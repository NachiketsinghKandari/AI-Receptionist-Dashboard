/**
 * Sentry error check API route
 * Returns correlation IDs that have error-level events
 * Uses Discover API for server-side filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSentryClient } from '@/lib/sentry/client';
import { errorResponse } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get('environment')?.trim() || undefined;
    const statsPeriod = searchParams.get('statsPeriod')?.trim() || '7d';

    const client = getSentryClient();

    if (!client.isConfigured) {
      return errorResponse('Sentry not configured', 503, 'SENTRY_NOT_CONFIGURED');
    }

    // Fetch correlation IDs with errors using Discover API (server-side filtering)
    const correlationIds = await client.fetchErrorCorrelationIds(environment, statsPeriod);

    return NextResponse.json({
      correlationIds,
    });
  } catch (error) {
    console.error('Sentry error check API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
