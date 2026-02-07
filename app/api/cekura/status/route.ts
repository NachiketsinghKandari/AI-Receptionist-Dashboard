/**
 * Cekura status update API route - server-only proxy
 * Updates status for a specific call in Cekura
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';

interface UpdateStatusRequest {
  cekuraId: number;
  status: 'reviewed_success' | 'reviewed_failure';
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

    const body: UpdateStatusRequest = await request.json();
    const { cekuraId, status } = body;

    if (!cekuraId) {
      return errorResponse('cekuraId is required', 400, 'MISSING_PARAMS');
    }

    if (!status || !['reviewed_success', 'reviewed_failure'].includes(status)) {
      return errorResponse('status must be reviewed_success or reviewed_failure', 400, 'INVALID_PARAMS');
    }

    // Call Cekura API to update status
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
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      console.error('Cekura API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error body:', errorText);
      return errorResponse('Failed to update status in Cekura API', response.status, 'CEKURA_API_ERROR');
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Cekura status update API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
