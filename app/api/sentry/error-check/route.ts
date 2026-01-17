/**
 * Sentry error check API route
 * Returns correlation IDs that have error-level events
 */

import { NextResponse } from 'next/server';
import { getSentryClient } from '@/lib/sentry/client';
import { errorResponse } from '@/lib/api/utils';

export async function GET() {
  try {
    const client = getSentryClient();

    if (!client.isConfigured) {
      return errorResponse('Sentry not configured', 503, 'SENTRY_NOT_CONFIGURED');
    }

    // Fetch recent events (last 100)
    const result = await client.fetchEvents(undefined, 100);

    // Extract correlation IDs that have error-level events
    const errorCorrelationIds = new Set<string>();

    for (const event of result.events as Array<{ tags?: Array<{ key: string; value: string }> }>) {
      const tags: Record<string, string> = {};
      for (const tag of event.tags || []) {
        tags[tag.key] = tag.value;
      }

      // Check if this is an error-level event
      const level = tags.level || 'info';
      if (level === 'error' && tags.correlation_id) {
        errorCorrelationIds.add(tags.correlation_id);
      }
    }

    return NextResponse.json({
      correlationIds: Array.from(errorCorrelationIds),
    });
  } catch (error) {
    console.error('Sentry error check API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
