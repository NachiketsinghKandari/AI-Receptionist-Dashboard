/**
 * Chat message types for the RAG-for-SQL chatbot
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  result?: SqlResult;
  chart?: ChartSpec;
  error?: string;
  createdAt: number;
}

export interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie';
  title: string;
  xKey: string;
  yKeys: string[];
  data: Record<string, unknown>[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** NDJSON stream event types sent from the API */
export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'sql'; sql: string }
  | { type: 'result'; result: SqlResult }
  | { type: 'chart'; chart: ChartSpec }
  | { type: 'error'; error: string }
  | { type: 'done' };
