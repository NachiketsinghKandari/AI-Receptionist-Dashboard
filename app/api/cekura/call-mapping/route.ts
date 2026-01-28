/**
 * Cekura call mapping API route - server-only proxy
 * Fetches call data from Cekura API including status and evaluation metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/utils';

// Cekura agent IDs by environment
const CEKURA_AGENT_IDS: Record<string, number> = {
  production: 10779,
  staging: 11005,
};

interface CekuraMetric {
  type: string;
  name: string;
  score_normalized: number;
  explanation: string;
}

interface CekuraEvaluation {
  metrics: CekuraMetric[];
}

interface CekuraCallResult {
  id: number;
  call_id: string; // This is our correlation_id (platform_call_id)
  status: string;
  evaluation?: CekuraEvaluation;
}

interface CekuraApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CekuraCallResult[];
}

// Simplified call data to return to the client
export interface CekuraCallData {
  cekuraId: number;
  status: string;
  metrics: Array<{
    name: string;
    score: number;
    explanation: string;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate')?.trim();
    const endDate = searchParams.get('endDate')?.trim();
    const environment = (searchParams.get('environment')?.trim() || 'production') as 'production' | 'staging';

    const apiKey = process.env.CEKURA_API_KEY;
    if (!apiKey) {
      return errorResponse('Cekura API key not configured', 503, 'CEKURA_NOT_CONFIGURED');
    }

    if (!startDate || !endDate) {
      return errorResponse('startDate and endDate are required', 400, 'MISSING_PARAMS');
    }

    const agentId = CEKURA_AGENT_IDS[environment] || CEKURA_AGENT_IDS.production;

    // Fetch all pages from Cekura API
    const allResults: CekuraCallResult[] = [];
    let nextUrl: string | null = `https://api.cekura.ai/observability/v1/call-logs/?timestamp_from=${encodeURIComponent(startDate)}&timestamp_to=${encodeURIComponent(endDate)}&agent_id=${agentId}`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'X-CEKURA-API-KEY': apiKey,
        },
      });

      if (!response.ok) {
        console.error('Cekura API error:', response.status, response.statusText);
        return errorResponse('Failed to fetch from Cekura API', response.status, 'CEKURA_API_ERROR');
      }

      const data: CekuraApiResponse = await response.json();
      allResults.push(...data.results);
      nextUrl = data.next;
    }

    // Build mapping: correlation_id -> full call data
    const calls: Record<string, CekuraCallData> = {};
    for (const result of allResults) {
      if (result.call_id) {
        // Filter metrics to only include binary_ types
        const binaryMetrics = (result.evaluation?.metrics || [])
          .filter(m => m.type?.includes('binary_'))
          .map(m => ({
            name: m.name,
            score: m.score_normalized,
            explanation: m.explanation || '',
          }));

        calls[result.call_id] = {
          cekuraId: result.id,
          status: result.status || 'unknown',
          metrics: binaryMetrics,
        };
      }
    }

    return NextResponse.json({
      calls,
      count: Object.keys(calls).length,
      agentId,
    });
  } catch (error) {
    console.error('Cekura call mapping API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
