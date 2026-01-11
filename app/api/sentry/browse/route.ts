/**
 * Sentry browse API route - fetches and groups events for browsing
 * Supports filtering by event type, level, and search
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSentryClient } from '@/lib/sentry/client';
import { getSupabaseClient } from '@/lib/supabase/client';
import { errorResponse, parseIntOrDefault, clamp } from '@/lib/api/utils';

const MAX_SENTRY_LIMIT = 100;

interface ParsedEvent {
  event_id: string;
  message: string;
  event_type: string;
  transaction: string;
  level: string;
  environment: string;
  correlation_id: string;
  call_id: number | null;
  timestamp: string;
  logger: string;
}

interface GroupedSummary {
  correlation_id: string;
  call_id: number | null;
  event_count: number;
  level: string;
  types: string;
  first_timestamp: string;
}

function parseEventType(transaction: string): string {
  if (transaction.includes('/transfer')) return 'transfer';
  if (transaction.includes('/webhook')) return 'webhook';
  if (transaction.includes('/search_case')) return 'search_case';
  if (transaction.includes('/take_message')) return 'take_message';
  if (transaction.includes('/schedule_callback')) return 'schedule_callback';
  return 'unknown';
}

function getMaxLevel(levels: Set<string>): string {
  if (levels.has('error')) return 'error';
  if (levels.has('warning')) return 'warning';
  return 'info';
}

function groupEvents(events: ParsedEvent[]): { summary: GroupedSummary[]; groups: Record<string, ParsedEvent[]> } {
  const groups: Record<string, ParsedEvent[]> = {};

  for (const event of events) {
    const cid = event.correlation_id || 'unknown';
    if (!groups[cid]) groups[cid] = [];
    groups[cid].push(event);
  }

  const summary: GroupedSummary[] = [];
  for (const [cid, evts] of Object.entries(groups)) {
    const types = [...new Set(evts.map(e => e.event_type))].sort();
    const levels = new Set(evts.map(e => e.level));
    const timestamps = evts.map(e => e.timestamp).filter(Boolean);

    summary.push({
      correlation_id: cid,
      call_id: evts[0]?.call_id ?? null,
      event_count: evts.length,
      level: getMaxLevel(levels),
      types: types.join(', '),
      first_timestamp: timestamps.length > 0 ? timestamps.sort()[0] : '',
    });
  }

  // Sort by first_timestamp descending
  summary.sort((a, b) => b.first_timestamp.localeCompare(a.first_timestamp));

  return { summary, groups };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clamp(parseIntOrDefault(searchParams.get('limit'), MAX_SENTRY_LIMIT), 20, MAX_SENTRY_LIMIT);
    const cursor = searchParams.get('cursor')?.trim() || null;
    const eventType = searchParams.get('eventType')?.trim() || null;
    const level = searchParams.get('level')?.trim() || null;
    const search = searchParams.get('search')?.trim().toLowerCase() || null;

    const client = getSentryClient();

    if (!client.isConfigured) {
      return errorResponse('Sentry not configured', 503, 'SENTRY_NOT_CONFIGURED');
    }

    // Fetch events from Sentry
    const result = await client.fetchEvents('/vapi/', limit, cursor || undefined);
    const rawEvents = result.events as Array<{
      eventID: string;
      message?: string;
      title?: string;
      dateCreated: string;
      tags?: Array<{ key: string; value: string }>;
    }>;

    // Get call ID mapping from Supabase
    const supabase = getSupabaseClient();
    const callsResult = await supabase
      .from('calls')
      .select('id, platform_call_id')
      .not('platform_call_id', 'is', null);

    const callIdMap: Record<string, number> = {};
    if (callsResult.data) {
      for (const row of callsResult.data) {
        if (row.platform_call_id) {
          callIdMap[row.platform_call_id] = row.id;
        }
      }
    }

    // Parse events
    const parsedEvents: ParsedEvent[] = [];
    for (const event of rawEvents) {
      const tags: Record<string, string> = {};
      for (const tag of event.tags || []) {
        tags[tag.key] = tag.value;
      }

      const transaction = tags.transaction || '';

      // Only include VAPI-related events
      if (!transaction.includes('/vapi/') && !transaction.includes('vapi')) {
        continue;
      }

      const correlationId = tags.correlation_id || 'unknown';
      const callId = callIdMap[correlationId] ?? null;
      const fullMessage = event.message || event.title || '';

      parsedEvents.push({
        event_id: event.eventID,
        message: fullMessage,
        event_type: parseEventType(transaction),
        transaction,
        level: tags.level || 'info',
        environment: tags.environment || '',
        correlation_id: correlationId,
        call_id: callId,
        timestamp: event.dateCreated,
        logger: tags.logger || '',
      });
    }

    // Apply filters
    let filteredEvents = parsedEvents;

    if (eventType && eventType !== 'All') {
      filteredEvents = filteredEvents.filter(e => e.event_type === eventType);
    }

    if (level && level !== 'All') {
      filteredEvents = filteredEvents.filter(e => e.level === level);
    }

    if (search) {
      filteredEvents = filteredEvents.filter(e => {
        const searchableText = [
          e.correlation_id,
          e.call_id?.toString() || '',
          e.message,
          e.transaction,
          e.logger,
          e.environment,
        ].join(' ').toLowerCase();
        return searchableText.includes(search);
      });
    }

    // Group events
    const { summary, groups } = groupEvents(filteredEvents);

    return NextResponse.json({
      summary,
      groups,
      totalEvents: parsedEvents.length,
      filteredEvents: filteredEvents.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    console.error('Sentry browse API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
