/**
 * EOD Reports AI Generation API route
 * POST: Generate AI insights for a saved EOD report
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getSupabaseClient } from '@/lib/supabase/client';
import { errorResponse } from '@/lib/api/utils';
import type { Environment } from '@/lib/constants';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface AIResponse {
  error_count: number;
  ai_response: string;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = (searchParams.get('env') || 'production') as Environment;

    const body = await request.json();
    const { reportId, rawData } = body;

    if (!reportId) {
      return errorResponse('reportId is required', 400, 'MISSING_PARAMS');
    }

    if (!rawData) {
      return errorResponse('rawData is required', 400, 'MISSING_PARAMS');
    }

    if (!GEMINI_API_KEY) {
      return errorResponse('GEMINI_API_KEY not configured', 500, 'CONFIG_ERROR');
    }

    const supabase = getSupabaseClient(environment);

    // Fetch prompt from prompts table
    const { data: promptData, error: promptError } = await supabase
      .from('prompts')
      .select('prompt')
      .eq('type', 'eod_report_prompt')
      .single();

    if (promptError || !promptData) {
      console.error('Error fetching prompt:', promptError);
      return errorResponse(
        'Prompt not found. Please create a row in the prompts table with type = "eod_report_prompt"',
        404,
        'PROMPT_NOT_FOUND'
      );
    }

    // Replace placeholder with actual JSON data
    const fullPrompt = promptData.prompt.replace(
      '{input_json}',
      JSON.stringify(rawData, null, 2)
    );

    // Call Gemini API
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: fullPrompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        responseMimeType: 'application/json',
      },
    });

    // Parse the response
    let aiResult: AIResponse;
    try {
      const responseText = response.text || '';
      aiResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', response.text);
      return errorResponse(
        'Failed to parse AI response. Check server logs.',
        500,
        'AI_PARSE_ERROR'
      );
    }

    // Update the eod_reports row with AI results
    const { error: updateError } = await supabase
      .from('eod_reports')
      .update({
        report: aiResult.ai_response,
        errors: aiResult.error_count,
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Error updating EOD report with AI results:', updateError);
      return errorResponse('Failed to save AI results', 500, 'DB_ERROR');
    }

    return NextResponse.json({
      success: true,
      error_count: aiResult.error_count,
      report_preview: aiResult.ai_response.substring(0, 200) + '...',
    });
  } catch (error) {
    console.error('AI generation API error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      'INTERNAL_ERROR'
    );
  }
}
