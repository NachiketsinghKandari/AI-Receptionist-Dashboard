/**
 * Cekura feedback update API route - server-only proxy
 * Updates feedback for a specific call in Cekura
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';

interface UpdateFeedbackRequest {
  cekuraId: number;
  feedback: string;
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const apiKey = process.env.CEKURA_API_KEY;
    if (!apiKey) {
      return errorResponse('Cekura API key not configured', 503, 'CEKURA_NOT_CONFIGURED');
    }

    const body: UpdateFeedbackRequest = await request.json();
    const { cekuraId, feedback } = body;

    if (!cekuraId) {
      return errorResponse('cekuraId is required', 400, 'MISSING_PARAMS');
    }

    if (typeof feedback !== 'string') {
      return errorResponse('feedback must be a string', 400, 'INVALID_PARAMS');
    }

    // Call Cekura API to update feedback
    const response = await fetch(
      `https://new-prod.cekura.ai/observability/v1/call-logs/${cekuraId}/`,
      {
        method: 'PATCH',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'x-organization-id': '1939',
          'X-CEKURA-API-KEY': apiKey,
        },
        body: JSON.stringify({ feedback }),
      }
    );

    if (!response.ok) {
      console.error('Cekura API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error body:', errorText);
      return errorResponse('Failed to update feedback in Cekura API', response.status, 'CEKURA_API_ERROR');
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Cekura feedback update API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
