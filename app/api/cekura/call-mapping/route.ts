/**
 * Cekura call mapping API route - server-only proxy
 * Fetches call mappings from Cekura API to map correlation_id -> cekura_call_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/utils';

// Cekura agent IDs by environment
const CEKURA_AGENT_IDS: Record<string, number> = {
  production: 10779,
  staging: 11005,
};

interface CekuraCallResult {
  id: number;
  call_id: string; // This is our correlation_id (platform_call_id)
}

interface CekuraApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CekuraCallResult[];
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

    // Build mapping: correlation_id -> cekura_call_id
    const mapping: Record<string, number> = {};
    for (const result of allResults) {
      if (result.call_id) {
        mapping[result.call_id] = result.id;
      }
    }

    return NextResponse.json({
      mapping,
      count: Object.keys(mapping).length,
      agentId,
    });
  } catch (error) {
    console.error('Cekura call mapping API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
