/**
 * Sentry API client - server-only
 * Ported from shared.py:SimplifiedSentryClient
 */

interface SentryEvent {
  event_id: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
  transaction: string;
  logger: string;
  environment: string;
  event_type: string;
  tags: Record<string, string>;
  request?: {
    url: string;
    method: string;
    headers: Array<{ key: string; value: string }>;
    body: Record<string, unknown> | null;
    query: string | null;
    content_type: string | null;
  };
  context?: Record<string, unknown>;
  exception_type?: string;
  exception_value?: string;
}

// Map dashboard environment names to Sentry environment names
const SENTRY_ENV_MAP: Record<string, string> = {
  production: 'pre-prod',
  staging: 'stage',
};

function mapEnvironment(dashboardEnv?: string): string | undefined {
  if (!dashboardEnv) return undefined;
  return SENTRY_ENV_MAP[dashboardEnv] || dashboardEnv;
}

export class SentryClient {
  private org: string;
  private project: string;
  private token: string;
  private baseUrl = 'https://sentry.io/api/0';

  constructor() {
    this.org = process.env.SENTRY_ORG || '';
    this.project = process.env.SENTRY_PROJECT || '';
    this.token = process.env.SENTRY_AUTH_TOKEN || '';
  }

  get isConfigured(): boolean {
    return !!(this.org && this.project && this.token);
  }

  async fetchEventsForCall(platformCallId: string, limit = 100): Promise<SentryEvent[]> {
    if (!this.isConfigured || !platformCallId) {
      return [];
    }

    const url = `${this.baseUrl}/projects/${this.org}/${this.project}/events/`;
    const headers = { Authorization: `Bearer ${this.token}` };

    try {
      const response = await fetch(`${url}?per_page=${limit}`, {
        headers,
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        console.error('Sentry API error:', response.status);
        return [];
      }

      const allEvents = await response.json();

      // Filter for events matching this correlation_id
      const events: SentryEvent[] = [];
      for (const event of allEvents) {
        const tags: Record<string, string> = {};
        for (const tag of event.tags || []) {
          tags[tag.key] = tag.value;
        }

        if (tags.correlation_id === platformCallId) {
          const level = (tags.level || event.level || 'info') as 'info' | 'warning' | 'error';
          const transaction = tags.transaction || '';
          const logger = tags.logger || '';
          const environment = tags.environment || '';

          // Determine event type from transaction URL
          let eventType = 'unknown';
          if (transaction.includes('/transfer')) eventType = 'transfer';
          else if (transaction.includes('/webhook')) eventType = 'webhook';
          else if (transaction.includes('/search_case')) eventType = 'tool:search_case';
          else if (transaction.includes('/take_message')) eventType = 'tool:take_message';
          else if (transaction.includes('/schedule_callback')) eventType = 'tool:schedule_callback';
          else if (transaction.includes('/vapi')) eventType = 'vapi';

          const fullMessage = event.message || event.title || 'Unknown';

          events.push({
            event_id: event.eventID,
            title: fullMessage,
            message: fullMessage,
            level,
            timestamp: event.dateCreated,
            transaction,
            logger,
            environment,
            event_type: eventType,
            tags,
          });
        }
      }

      // Fetch detailed data for first 10 events
      for (const parsed of events.slice(0, 10)) {
        try {
          const detailUrl = `${this.baseUrl}/projects/${this.org}/${this.project}/events/${parsed.event_id}/`;
          const detailResponse = await fetch(detailUrl, { headers });

          if (detailResponse.ok) {
            const detail = await detailResponse.json();

            // Extract request info from entries
            for (const entry of detail.entries || []) {
              if (entry.type === 'request') {
                const reqData = entry.data || {};
                parsed.request = {
                  url: reqData.url,
                  method: reqData.method,
                  headers: reqData.headers || [],
                  body: reqData.data,
                  query: reqData.query,
                  content_type: reqData.inferredContentType,
                };
              } else if (entry.type === 'exception') {
                const exceptions = entry.data?.values || [];
                if (exceptions.length > 0) {
                  parsed.exception_type = exceptions[0].type;
                  parsed.exception_value = exceptions[0].value;
                }
              }
            }

            parsed.context = detail.context || {};
          }
        } catch (e) {
          console.debug('Failed to fetch event detail:', e);
        }
      }

      // Sort by timestamp descending
      events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return events;
    } catch (error) {
      console.error('Error fetching Sentry events:', error);
      return [];
    }
  }

  async fetchEvents(
    query?: string,
    limit = 100,
    cursor?: string
  ): Promise<{
    events: unknown[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    if (!this.isConfigured) {
      return { events: [], hasMore: false, nextCursor: null };
    }

    const url = `${this.baseUrl}/projects/${this.org}/${this.project}/events/`;
    const params = new URLSearchParams({ per_page: String(Math.min(limit, 100)) });
    if (query) params.set('query', query);
    if (cursor) params.set('cursor', cursor);

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (!response.ok) {
        return { events: [], hasMore: false, nextCursor: null };
      }

      const events = await response.json();

      // Parse pagination from Link header
      const linkHeader = response.headers.get('link') || '';
      let hasMore = false;
      let nextCursor: string | null = null;

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
            if (trimmed.startsWith('cursor="')) {
              cursorVal = trimmed.split('cursor="')[1]?.replace('"', '') || null;
            }
          }

          if (isNext && resultsTrue && cursorVal) {
            hasMore = true;
            nextCursor = cursorVal;
            break;
          }
        }
      }

      return { events, hasMore, nextCursor };
    } catch (error) {
      console.error('Error fetching Sentry events:', error);
      return { events: [], hasMore: false, nextCursor: null };
    }
  }

  /**
   * Fetch events for a specific correlation_id using the Discover API
   * This provides server-side filtering, solving the 100-event limit problem
   */
  async fetchEventsForCorrelationId(
    correlationId: string,
    options?: {
      environment?: 'production' | 'staging';
      statsPeriod?: string; // '24h', '7d', '30d', '90d'
      limit?: number;
    }
  ): Promise<{ events: SentryEvent[]; hasMore: boolean; nextCursor: string | null }> {
    if (!this.isConfigured || !correlationId) {
      return { events: [], hasMore: false, nextCursor: null };
    }

    const url = `${this.baseUrl}/organizations/${this.org}/events/`;
    const headers = { Authorization: `Bearer ${this.token}` };

    // Fields to fetch from Discover API - each must be a separate param
    const fields = [
      'id',
      'title',
      'message',
      'level',
      'timestamp',
      'transaction',
      'environment',
    ];

    const params = new URLSearchParams();
    // Add each field as a separate parameter
    for (const field of fields) {
      params.append('field', field);
    }
    // Only fetch error-level events for call details
    params.set('query', `correlation_id:${correlationId} level:error`);
    params.set('statsPeriod', options?.statsPeriod || '30d');
    params.set('per_page', String(options?.limit || 100));

    const sentryEnv = mapEnvironment(options?.environment);
    if (sentryEnv) {
      params.set('environment', sentryEnv);
    }

    try {
      const response = await fetch(`${url}?${params}`, {
        headers,
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        console.error('Sentry Discover API error:', response.status, await response.text());
        return { events: [], hasMore: false, nextCursor: null };
      }

      const data = await response.json();
      const rawEvents = data.data || [];

      // Transform Discover API response to SentryEvent format
      const events: SentryEvent[] = rawEvents.map((event: Record<string, string>) => {
        const transaction = event.transaction || '';

        // Determine event type from transaction URL
        let eventType = 'unknown';
        if (transaction.includes('/transfer')) eventType = 'transfer';
        else if (transaction.includes('/webhook')) eventType = 'webhook';
        else if (transaction.includes('/search_case')) eventType = 'tool:search_case';
        else if (transaction.includes('/take_message')) eventType = 'tool:take_message';
        else if (transaction.includes('/schedule_callback')) eventType = 'tool:schedule_callback';
        else if (transaction.includes('/vapi')) eventType = 'vapi';

        const fullMessage = event.message || event.title || 'Unknown';

        return {
          event_id: event.id,
          title: fullMessage,
          message: fullMessage,
          level: (event.level || 'info') as 'info' | 'warning' | 'error',
          timestamp: event.timestamp,
          transaction,
          logger: '',
          environment: event.environment || '',
          event_type: eventType,
          tags: { correlation_id: correlationId },
        };
      });

      // Fetch detailed data for first 10 events
      for (const parsed of events.slice(0, 10)) {
        try {
          const detailUrl = `${this.baseUrl}/projects/${this.org}/${this.project}/events/${parsed.event_id}/`;
          const detailResponse = await fetch(detailUrl, { headers });

          if (detailResponse.ok) {
            const detail = await detailResponse.json();

            // Extract tags from detail
            for (const tag of detail.tags || []) {
              parsed.tags[tag.key] = tag.value;
            }
            parsed.logger = parsed.tags.logger || '';

            // Extract request info from entries
            for (const entry of detail.entries || []) {
              if (entry.type === 'request') {
                const reqData = entry.data || {};
                parsed.request = {
                  url: reqData.url,
                  method: reqData.method,
                  headers: reqData.headers || [],
                  body: reqData.data,
                  query: reqData.query,
                  content_type: reqData.inferredContentType,
                };
              } else if (entry.type === 'exception') {
                const exceptions = entry.data?.values || [];
                if (exceptions.length > 0) {
                  parsed.exception_type = exceptions[0].type;
                  parsed.exception_value = exceptions[0].value;
                }
              }
            }

            parsed.context = detail.context || {};
          }
        } catch (e) {
          console.debug('Failed to fetch event detail:', e);
        }
      }

      // Sort by timestamp descending
      events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Parse pagination from Link header
      const linkHeader = response.headers.get('link') || '';
      let hasMore = false;
      let nextCursor: string | null = null;

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
            if (trimmed.startsWith('cursor="')) {
              cursorVal = trimmed.split('cursor="')[1]?.replace('"', '') || null;
            }
          }

          if (isNext && resultsTrue && cursorVal) {
            hasMore = true;
            nextCursor = cursorVal;
            break;
          }
        }
      }

      return { events, hasMore, nextCursor };
    } catch (error) {
      console.error('Error fetching Sentry events via Discover API:', error);
      return { events: [], hasMore: false, nextCursor: null };
    }
  }

  /**
   * Fetch correlation IDs that have error-level events using the Discover API
   * Used for highlighting calls with errors in the calls table
   */
  async fetchErrorCorrelationIds(
    environment?: string,
    statsPeriod = '7d'
  ): Promise<string[]> {
    if (!this.isConfigured) {
      return [];
    }

    const url = `${this.baseUrl}/organizations/${this.org}/events/`;
    const headers = { Authorization: `Bearer ${this.token}` };

    const params = new URLSearchParams();
    params.append('field', 'correlation_id');
    params.set('query', 'level:error has:correlation_id');
    params.set('statsPeriod', statsPeriod);
    params.set('per_page', '100');

    const sentryEnv = mapEnvironment(environment);
    if (sentryEnv) {
      params.set('environment', sentryEnv);
    }

    try {
      const response = await fetch(`${url}?${params}`, {
        headers,
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        console.error('Sentry Discover API error:', response.status, await response.text());
        return [];
      }

      const data = await response.json();
      const rawEvents = data.data || [];

      // Extract unique correlation IDs
      const correlationIds = new Set<string>();
      for (const event of rawEvents) {
        const correlationId = event['correlation_id'] || event.correlation_id;
        if (correlationId) {
          correlationIds.add(correlationId);
        }
      }

      return Array.from(correlationIds);
    } catch (error) {
      console.error('Error fetching error correlation IDs:', error);
      return [];
    }
  }
}

// Singleton instance
let sentryClient: SentryClient | null = null;

export function getSentryClient(): SentryClient {
  if (!sentryClient) {
    sentryClient = new SentryClient();
  }
  return sentryClient;
}
