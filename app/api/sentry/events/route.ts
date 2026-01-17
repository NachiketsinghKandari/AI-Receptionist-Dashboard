/**
 * Sentry events API route - server-only proxy
 * Keeps Sentry API tokens private
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSentryClient } from '@/lib/sentry/client';
import { errorResponse, parseIntOrDefault, clamp } from '@/lib/api/utils';

const MAX_SENTRY_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const correlationId = searchParams.get('correlationId')?.trim() || null;
    const query = searchParams.get('query')?.trim() || null;
    const limit = clamp(parseIntOrDefault(searchParams.get('limit'), MAX_SENTRY_LIMIT), 1, MAX_SENTRY_LIMIT);
    const cursor = searchParams.get('cursor')?.trim() || null;
    const environment = searchParams.get('environment')?.trim() as 'production' | 'staging' | undefined;
    const statsPeriod = searchParams.get('statsPeriod')?.trim() || '30d';

    const client = getSentryClient();

    if (!client.isConfigured) {
      return errorResponse('Sentry not configured', 503, 'SENTRY_NOT_CONFIGURED');
    }

    if (correlationId) {
      // Fetch events for a specific call using Discover API (server-side filtering)
      const result = await client.fetchEventsForCorrelationId(correlationId, {
        environment: environment || undefined,
        statsPeriod,
        limit,
      });
      return NextResponse.json(result);
    } else {
      // Fetch events with pagination (legacy project events API)
      const result = await client.fetchEvents(query || undefined, limit, cursor || undefined);
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Sentry events API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
