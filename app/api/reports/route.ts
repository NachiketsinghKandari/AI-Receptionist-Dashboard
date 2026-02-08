/**
 * EOD Reports API route
 * GET: List all EOD reports
 * POST: Save a new EOD report (frontend triggers AI generation separately)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseIntOrDefault, clamp, parseEnvironment } from '@/lib/api/utils';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));
    const limit = clamp(parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT), 1, MAX_PAGE_LIMIT);
    const offset = parseIntOrDefault(searchParams.get('offset'), 0);
    const sortBy = searchParams.get('sortBy') || 'report_date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const supabase = getSupabaseClient(environment);
    const firmIdParam = searchParams.get('firmId');
    const firmId = firmIdParam ? parseInt(firmIdParam, 10) : null;

    // Build base query with optional firmId filter
    let countQuery = supabase.from('reports').select('*', { count: 'exact', head: true });
    let dataQuery = supabase.from('reports').select('*');

    // Filter by reportType if provided (defaults to showing all)
    const reportType = searchParams.get('reportType');
    if (reportType) {
      countQuery = countQuery.eq('report_type', reportType);
      dataQuery = dataQuery.eq('report_type', reportType);
    }

    // Filter by firmId using the dedicated column
    // When a specific firm is selected, show only that firm's reports.
    // When "All" is selected (firmId is null), show every report — no filter.
    if (firmId != null) {
      countQuery = countQuery.eq('firm_id', firmId);
      dataQuery = dataQuery.eq('firm_id', firmId);
    }

    // Get total count
    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('Error fetching EOD reports count:', countError);
      return errorResponse('Failed to fetch reports count', 500, 'DB_ERROR');
    }

    // Fetch reports with pagination
    const { data, error } = await dataQuery
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching EOD reports:', error);
      return errorResponse('Failed to fetch reports', 500, 'DB_ERROR');
    }

    return NextResponse.json({
      data: data || [],
      total: totalCount || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('EOD reports API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));

    const body = await request.json();
    const { reportDate, rawData, triggerType = 'manual', reportType = 'eod' } = body;
    const firmId = body.firmId as number | null | undefined;
    const firmIdValue = firmId ?? null;

    if (!reportDate || !rawData) {
      return errorResponse('reportDate and rawData are required', 400, 'MISSING_PARAMS');
    }

    const supabase = getSupabaseClient(environment);

    // Check if report already exists for this date, type, and firm
    let existingQuery = supabase
      .from('reports')
      .select('id')
      .eq('report_date', reportDate)
      .eq('report_type', reportType);

    if (firmIdValue != null) {
      existingQuery = existingQuery.eq('firm_id', firmIdValue);
    } else {
      existingQuery = existingQuery.is('firm_id', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      // Update existing report - clear AI fields for regeneration
      // firm_id is NOT updated here — the row was already matched by firm_id in the existence check
      const { data, error } = await supabase
        .from('reports')
        .update({
          raw_data: rawData,
          generated_at: new Date().toISOString(),
          trigger_type: triggerType,
          report_type: reportType,
          full_report: null, // Clear for regeneration
          errors: null, // Clear for regeneration
          success_report: null, // Clear for regeneration
          failure_report: null, // Clear for regeneration
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating EOD report:', error);
        return errorResponse('Failed to update report', 500, 'DB_ERROR');
      }

      // Frontend will trigger AI generation for both success and failure reports in parallel
      return NextResponse.json({
        report: data,
        updated: true,
        message: 'Report saved! Trigger AI generation separately.',
      });
    }

    // Insert new report — only set firm_id when a specific firm was chosen
    const insertPayload: Record<string, unknown> = {
      report_date: reportDate,
      raw_data: rawData,
      trigger_type: triggerType,
      report_type: reportType,
      full_report: null,
      errors: null,
      success_report: null,
      failure_report: null,
    };
    if (firmIdValue != null) {
      insertPayload.firm_id = firmIdValue;
    }

    const { data, error } = await supabase
      .from('reports')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Error inserting EOD report:', error);
      return errorResponse('Failed to save report', 500, 'DB_ERROR');
    }

    // Frontend will trigger AI generation for both success and failure reports in parallel
    return NextResponse.json({
      report: data,
      updated: false,
      message: 'Report saved! Trigger AI generation separately.',
    });
  } catch (error) {
    console.error('EOD reports API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
