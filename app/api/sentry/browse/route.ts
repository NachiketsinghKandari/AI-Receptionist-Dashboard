/**
 * Sentry browse API route - fetches events using Discover API
 * Supports filtering by level, environment, and correlation_id search
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';

const SENTRY_BASE_URL = 'https://sentry.io/api/0';

interface DiscoverEvent {
  id: string;
  title: string;
  message: string;
  level: string;
  timestamp: string;
  transaction: string;
  environment: string;
  correlation_id: string;
}

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
  last_timestamp: string;
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
    const timestamps = evts.map(e => e.timestamp).filter(Boolean).sort();

    summary.push({
      correlation_id: cid,
      call_id: evts[0]?.call_id ?? null,
      event_count: evts.length,
      level: getMaxLevel(levels),
      types: types.join(', '),
      first_timestamp: timestamps.length > 0 ? timestamps[0] : '',
      last_timestamp: timestamps.length > 0 ? timestamps[timestamps.length - 1] : '',
    });
  }

  // Sort by last_timestamp descending (most recent activity first)
  summary.sort((a, b) => b.last_timestamp.localeCompare(a.last_timestamp));

  return { summary, groups };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('eventType')?.trim() || null;
    const level = searchParams.get('level')?.trim() || null;
    const search = searchParams.get('search')?.trim() || null;
    const sentryEnv = searchParams.get('sentryEnv')?.trim() || null;
    const statsPeriod = searchParams.get('statsPeriod')?.trim() || '7d';

    // Check Sentry configuration
    const org = process.env.SENTRY_ORG;
    const token = process.env.SENTRY_AUTH_TOKEN;

    if (!org || !token) {
      return errorResponse('Sentry not configured', 503, 'SENTRY_NOT_CONFIGURED');
    }

    // Use Discover API - supports environment filtering and returns all log levels
    const url = `${SENTRY_BASE_URL}/organizations/${org}/events/`;
    const params = new URLSearchParams();

    // Fields to fetch - each as separate parameter
    const fields = ['id', 'title', 'message', 'level', 'timestamp', 'transaction', 'environment', 'correlation_id'];
    for (const field of fields) {
      params.append('field', field);
    }

    // Build query parts
    const queryParts: string[] = [];

    // Level filter
    if (level && level !== 'All') {
      queryParts.push(`level:${level}`);
    }

    // Search filter - correlation_id or message
    if (search) {
      if (search.includes('-') && search.length > 10) {
        // Looks like a correlation_id
        queryParts.push(`correlation_id:${search}`);
      } else {
        // General message search
        queryParts.push(`message:*${search}*`);
      }
    }

    if (queryParts.length > 0) {
      params.set('query', queryParts.join(' '));
    }

    // Environment filter
    if (sentryEnv) {
      params.set('environment', sentryEnv);
    }

    // Time period and pagination
    params.set('statsPeriod', statsPeriod);
    params.set('per_page', '100');
    params.set('sort', '-timestamp');

    // Fetch events with pagination
    const allEvents: DiscoverEvent[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 10; // Up to 1000 events

    do {
      if (cursor) {
        params.set('cursor', cursor);
      }

      const fullUrl = `${url}?${params}`;
      console.log('Sentry Discover API URL:', fullUrl);

      const response = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Sentry Discover API error:', response.status, errorText);
        break;
      }

      const data = await response.json();
      const events: DiscoverEvent[] = data.data || [];
      console.log(`Sentry page ${pageCount + 1}: fetched ${events.length} events`);

      if (events.length === 0) break;

      allEvents.push(...events);
      pageCount++;

      // Parse Link header for next cursor
      cursor = null;
      const linkHeader = response.headers.get('link') || '';
      if (linkHeader) {
        const links = linkHeader.split(',');
        for (const link of links) {
          const parts = link.split(';');
          let isNext = false;
          let resultsTrue = false;
          let cursorVal: string | null = null;

          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('rel="next"')) isNext = true;
            if (trimmed.includes('results="true"')) resultsTrue = true;
            const cursorMatch = trimmed.match(/cursor="([^"]+)"/);
            if (cursorMatch) {
              cursorVal = cursorMatch[1];
            }
          }

          if (isNext && resultsTrue && cursorVal) {
            cursor = cursorVal;
            break;
          }
        }
      }
    } while (cursor && pageCount < maxPages);

    console.log('Sentry total events:', allEvents.length);

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
    for (const event of allEvents) {
      const transaction = event.transaction || '';
      const correlationId = event.correlation_id || 'unknown';
      const callId = callIdMap[correlationId] ?? null;
      const fullMessage = event.message || event.title || '';

      parsedEvents.push({
        event_id: event.id,
        message: fullMessage,
        event_type: parseEventType(transaction),
        transaction,
        level: event.level || 'info',
        environment: event.environment || '',
        correlation_id: correlationId,
        call_id: callId,
        timestamp: event.timestamp,
        logger: '',
      });
    }

    // Apply event type filter (client-side)
    let filteredEvents = parsedEvents;
    if (eventType && eventType !== 'All') {
      filteredEvents = filteredEvents.filter(e => e.event_type === eventType);
    }

    // Group events by correlation_id
    const { summary, groups } = groupEvents(filteredEvents);

    return NextResponse.json({
      summary,
      groups,
      totalEvents: allEvents.length,
      filteredEvents: filteredEvents.length,
      hasMore: false,
      nextCursor: null,
    });
  } catch (error) {
    console.error('Sentry browse API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
