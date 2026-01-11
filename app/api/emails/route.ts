/**
 * Emails API route - ported from shared.py:get_emails()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type Environment } from '@/lib/constants';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
} from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;

    // Parse and validate parameters
    const callId = parseIntOrNull(searchParams.get('callId'));
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;

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
