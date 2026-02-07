/**
 * Emails API route - ported from shared.py:get_emails()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@/lib/constants';
import { authenticateRequest } from '@/lib/api/auth';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
  escapeLikePattern,
  parseEnvironment,
} from '@/lib/api/utils';
import type { DynamicFilter } from '@/types/api';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));

    // Parse and validate parameters
    const callId = parseIntOrNull(searchParams.get('callId'));
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;

    // Parse dynamic filters (JSON array)
    let dynamicFilters: DynamicFilter[] = [];
    const dynamicFiltersParam = searchParams.get('dynamicFilters');
    if (dynamicFiltersParam) {
      try {
        dynamicFilters = JSON.parse(dynamicFiltersParam);
      } catch (e) {
        console.error('Failed to parse dynamicFilters:', e);
      }
    }

    const { limit, offset } = validatePagination(
      parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT),
      parseIntOrDefault(searchParams.get('offset'), 0),
      MAX_PAGE_LIMIT
    );

    // Sorting parameters
    const sortBy = searchParams.get('sortBy') || 'sent_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'sent_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'sent_at';

    const client = getSupabaseClient(env);

    let query = client
      .from('email_logs')
      .select('id, call_id, firm_id, subject, recipients, email_type, status, sent_at, body', {
        count: 'exact',
      });

    if (callId !== null) {
      query = query.eq('call_id', callId);
    }
    if (firmId !== null) {
      query = query.eq('firm_id', firmId);
    }
    if (startDate) {
      query = query.gte('sent_at', startDate);
    }
    if (endDate) {
      query = query.lte('sent_at', endDate);
    }

    // Search across multiple columns with properly escaped terms
    if (search) {
      const searchColumns = ['subject', 'email_type', 'status'];
      let orCondition = buildSearchOrCondition(searchColumns, search);

      // If the search term is a valid integer, also search by ID and call_id
      if (isValidInt4(search)) {
        orCondition += `,id.eq.${search},call_id.eq.${search}`;
      }

      query = query.or(orCondition);
    }

    // Apply dynamic filters
    const validFilterColumns = ['id', 'call_id', 'subject', 'email_type', 'status', 'sent_at', 'firm_id'];

    for (const filter of dynamicFilters) {
      if (!validFilterColumns.includes(filter.field)) {
        continue;
      }

      const { field, condition, value } = filter;

      switch (condition) {
        case 'equals':
          query = query.eq(field, value);
          break;
        case 'not_equals':
          query = query.neq(field, value);
          break;
        case 'contains':
          query = query.ilike(field, `%${escapeLikePattern(value)}%`);
          break;
        case 'not_contains':
          query = query.not(field, 'ilike', `%${escapeLikePattern(value)}%`);
          break;
        case 'starts_with':
          query = query.ilike(field, `${escapeLikePattern(value)}%`);
          break;
        case 'ends_with':
          query = query.ilike(field, `%${escapeLikePattern(value)}`);
          break;
        case 'greater_than':
          query = query.gt(field, value);
          break;
        case 'less_than':
          query = query.lt(field, value);
          break;
        case 'greater_or_equal':
          query = query.gte(field, value);
          break;
        case 'less_or_equal':
          query = query.lte(field, value);
          break;
        case 'is_empty':
          query = query.is(field, null);
          break;
        case 'is_not_empty':
          query = query.not(field, 'is', null);
          break;
      }
    }

    query = query.order(sortColumn, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const response = await query;

    if (response.error) {
      console.error('Error fetching emails:', response.error);
      return errorResponse('Failed to fetch emails', 500, 'EMAILS_FETCH_ERROR');
    }

    return NextResponse.json({
      data: response.data || [],
      total: response.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Emails API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
