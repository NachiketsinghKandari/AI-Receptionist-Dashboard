/**
 * Gemini function calling orchestration for the chat feature.
 * Uses @google/genai SDK with run_sql and generate_chart tools.
 *
 * ============================================================
 * SUPABASE RPC MIGRATION — Run this in the Supabase SQL Editor:
 * ============================================================
 *
 * CREATE OR REPLACE FUNCTION execute_readonly_sql(query text)
 * RETURNS jsonb
 * LANGUAGE plpgsql
 * SECURITY DEFINER
 * AS $$
 * DECLARE
 *   result jsonb;
 * BEGIN
 *   -- Force read-only mode
 *   SET LOCAL default_transaction_read_only = on;
 *   -- Enforce timeout to prevent long-running queries
 *   SET LOCAL statement_timeout = '15s';
 *
 *   EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query)
 *   INTO result;
 *
 *   RETURN COALESCE(result, '[]'::jsonb);
 * END;
 * $$;
 *
 * -- Grant execute to the service_role only
 * REVOKE ALL ON FUNCTION execute_readonly_sql(text) FROM PUBLIC;
 * GRANT EXECUTE ON FUNCTION execute_readonly_sql(text) TO service_role;
 *
 * ============================================================
 */

import { GoogleGenAI, Type, ThinkingLevel, type Content, type Part, type Tool } from '@google/genai';
import { validateSql } from './sql-validator';
import { buildSystemPrompt } from './system-prompt';
import type { SqlResult, ChartSpec, StreamEvent } from '@/types/chat';
import type { Environment } from '@/lib/constants';
import { getSupabaseClient } from '@/lib/supabase/client';

const MAX_TOOL_ROUNDS = 8;

const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'run_sql',
        description:
          'Execute a read-only PostgreSQL SELECT query against the dashboard database. The query is validated for safety before execution.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            sql: {
              type: Type.STRING,
              description: 'The SQL SELECT query to execute',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'generate_chart',
        description:
          'Generate a chart from the most recent run_sql result. xKey and yKeys MUST exactly match column aliases returned by that query — any mismatch produces an empty chart.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ['bar', 'line', 'pie'],
              description: 'Chart type: bar for comparisons/categories, line for time series, pie for proportions',
            },
            title: {
              type: Type.STRING,
              description: 'Chart title',
            },
            xKey: {
              type: Type.STRING,
              description: 'Exact column alias from the SQL result to use for x-axis labels',
            },
            yKeys: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exact column alias(es) from the SQL result to use for y-axis values',
            },
          },
          required: ['type', 'title', 'xKey', 'yKeys'],
        },
      },
    ],
  },
];

async function executeSql(
  sql: string,
  environment: Environment,
): Promise<{ result?: SqlResult; error?: string; validatedSql?: string }> {
  const validation = validateSql(sql);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const safeSql = validation.sql!;
  const supabase = getSupabaseClient(environment);

  try {
    const { data, error } = await supabase.rpc('execute_readonly_sql', {
      query: safeSql,
    });

    if (error) {
      return { error: `Database error: ${error.message}` };
    }

    const rows = (data as Record<string, unknown>[]) || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const truncated = rows.length >= 1000;

    return {
      result: { columns, rows, rowCount: rows.length, truncated },
      validatedSql: safeSql,
    };
  } catch (err) {
    return {
      error: `Query execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Stream chat responses from Gemini with function calling.
 * Yields NDJSON StreamEvent objects.
 */
export async function* streamChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  environment: Environment,
): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    yield { type: 'error', error: 'GEMINI_API_KEY is not configured' };
    yield { type: 'done' };
    return;
  }

  const genai = new GoogleGenAI({ apiKey });

  // Build conversation history for Gemini
  const contents: Content[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  let lastSqlResult: SqlResult | undefined;
  let toolRounds = 0;

  try {
    // Initial call to Gemini
    let response = await genai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction: buildSystemPrompt(),
        tools: TOOLS,
        temperature: 0.1,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    // Iterative tool-calling loop
    while (toolRounds < MAX_TOOL_ROUNDS) {
      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) break;

      const parts = candidate.content.parts;
      let hasFunctionCall = false;
      const functionResponseParts: Part[] = [];

      for (const part of parts) {
        // Handle text output
        if (part.text) {
          yield { type: 'text', content: part.text };
        }

        // Handle function calls
        if (part.functionCall) {
          hasFunctionCall = true;
          const { name, args } = part.functionCall;

          if (name === 'run_sql') {
            const sql = (args as { sql: string }).sql;
            yield { type: 'sql', sql };

            const { result, error, validatedSql } = await executeSql(sql, environment);

            if (error) {
              yield { type: 'error', error };
              functionResponseParts.push({
                functionResponse: {
                  name: 'run_sql',
                  response: { error },
                },
              });
            } else if (result) {
              lastSqlResult = result;
              // Yield the validated SQL (may differ from the original if LIMIT was adjusted)
              if (validatedSql && validatedSql !== sql) {
                yield { type: 'sql', sql: validatedSql };
              }
              yield { type: 'result', result };
              functionResponseParts.push({
                functionResponse: {
                  name: 'run_sql',
                  response: {
                    columns: result.columns,
                    rowCount: result.rowCount,
                    truncated: result.truncated,
                    // Send sample rows to Gemini for analysis (first 50)
                    sampleRows: result.rows.slice(0, 50),
                  },
                },
              });
            }
          } else if (name === 'generate_chart') {
            const chartArgs = args as {
              type: 'bar' | 'line' | 'pie';
              title: string;
              xKey: string;
              yKeys: string[];
            };

            if (lastSqlResult && lastSqlResult.rows.length > 0) {
              const chart: ChartSpec = {
                ...chartArgs,
                data: lastSqlResult.rows,
              };
              yield { type: 'chart', chart };
              functionResponseParts.push({
                functionResponse: {
                  name: 'generate_chart',
                  response: { success: true },
                },
              });
            } else {
              functionResponseParts.push({
                functionResponse: {
                  name: 'generate_chart',
                  response: { error: 'No data available to chart' },
                },
              });
            }
          }
        }
      }

      if (!hasFunctionCall) break;

      // Add model's response and our function responses to the conversation
      contents.push({
        role: 'model',
        parts,
      });
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      // Next round
      toolRounds++;
      response = await genai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: {
          systemInstruction: buildSystemPrompt(),
          tools: TOOLS,
          temperature: 0.1,
        },
      });
    }

  } catch (err) {
    yield {
      type: 'error',
      error: `Chat error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }

  yield { type: 'done' };
}
