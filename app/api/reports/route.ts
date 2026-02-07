/**
 * EOD Reports API route
 * GET: List all EOD reports
 * POST: Save a new EOD report (frontend triggers AI generation separately)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseIntOrDefault, clamp } from '@/lib/api/utils';
import type { Environment } from '@/lib/constants';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = (searchParams.get('env') || 'production') as Environment;
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

    // Filter by firmId if provided (stored in raw_data.firm_id)
    if (firmId) {
      countQuery = countQuery.eq('raw_data->firm_id', firmId);
      dataQuery = dataQuery.eq('raw_data->firm_id', firmId);
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
    const environment = (searchParams.get('env') || 'production') as Environment;

    const body = await request.json();
    const { reportDate, rawData, triggerType = 'manual', reportType = 'eod' } = body;

    if (!reportDate || !rawData) {
      return errorResponse('reportDate and rawData are required', 400, 'MISSING_PARAMS');
    }

    const supabase = getSupabaseClient(environment);

    // Check if report already exists for this date and report_type
    let existingQuery = supabase
      .from('reports')
      .select('id')
      .eq('report_date', reportDate);

    // Include report_type in duplicate check so EOD and weekly don't collide
    existingQuery = existingQuery.eq('report_type', reportType);

    const { data: existing } = await existingQuery.single();

    if (existing) {
      // Update existing report - clear AI fields for regeneration
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

    // Insert new report
    const { data, error } = await supabase
      .from('reports')
      .insert({
        report_date: reportDate,
        raw_data: rawData,
        trigger_type: triggerType,
        report_type: reportType,
        full_report: null,
        errors: null,
        success_report: null,
        failure_report: null,
      })
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
