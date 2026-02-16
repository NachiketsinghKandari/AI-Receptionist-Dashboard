/**
 * Turso-based reports storage
 * Uses @libsql/client to connect to a hosted Turso (libSQL) database.
 * On first access per environment, clones existing data from Supabase.
 */

import { type Row } from '@libsql/client';
import crypto from 'crypto';
import type { Environment } from '@/lib/constants';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getTursoClient } from '@/lib/turso/client';

// --- Types ---

export interface ReportRow {
  id: string;
  report_date: string;
  raw_data: Record<string, unknown>;
  generated_at: string;
  trigger_type: string;
  full_report: string | null;
  success_report: string | null;
  failure_report: string | null;
  report_type: string | null;
  errors: number | null;
  firm_id: number | null;
}

interface ListReportsOptions {
  reportType?: string | null;
  firmId?: number | null;
  sortBy?: string;
  sortOrder?: string;
  limit: number;
  offset: number;
}

// --- Schema initialization ---

let schemaInitialized = false;

async function ensureSchema(): Promise<void> {
  if (schemaInitialized) return;

  const db = getTursoClient();
  await db.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        environment TEXT NOT NULL DEFAULT 'production',
        report_date TEXT NOT NULL,
        raw_data TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        trigger_type TEXT,
        full_report TEXT,
        success_report TEXT,
        failure_report TEXT,
        report_type TEXT,
        errors INTEGER,
        firm_id INTEGER
      )`,
        args: [],
      },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reports_env ON reports(environment)', args: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reports_report_date ON reports(report_date)', args: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reports_report_type ON reports(report_type)', args: [] },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_reports_firm_id ON reports(firm_id)', args: [] },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_reports_env_date_type ON reports(environment, report_date, report_type)',
        args: [],
      },
    ],
    'write'
  );

  schemaInitialized = true;
}

// --- Lazy clone from Supabase ---

const clonedEnvironments = new Set<Environment>();
const clonePromises = new Map<Environment, Promise<void>>();

export async function ensureCloned(environment: Environment): Promise<void> {
  await ensureSchema();

  if (clonedEnvironments.has(environment)) return;

  const db = getTursoClient();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as cnt FROM reports WHERE environment = ?',
    args: [environment],
  });

  const count = Number(result.rows[0]?.cnt ?? 0);
  if (count > 0) {
    clonedEnvironments.add(environment);
    return;
  }

  // Prevent concurrent clones for the same environment
  const existing = clonePromises.get(environment);
  if (existing) return existing;

  const promise = cloneFromSupabase(environment);
  clonePromises.set(environment, promise);

  try {
    await promise;
    clonedEnvironments.add(environment);
  } finally {
    clonePromises.delete(environment);
  }
}

async function cloneFromSupabase(environment: Environment): Promise<void> {
  console.log(`[reports-db] Cloning reports from Supabase (${environment}) to Turso...`);

  const supabase = getSupabaseClient(environment);
  const db = getTursoClient();
  const PAGE_SIZE = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('report_date', { ascending: false });

    if (error) {
      console.error('[reports-db] Error fetching from Supabase:', error);
      throw new Error(`Failed to clone reports: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    const statements = data.map((r: Record<string, unknown>) => ({
      sql: `INSERT OR IGNORE INTO reports (id, environment, report_date, raw_data, generated_at, trigger_type, full_report, success_report, failure_report, report_type, errors, firm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.id as string,
        environment,
        r.report_date as string,
        typeof r.raw_data === 'string' ? r.raw_data : JSON.stringify(r.raw_data),
        r.generated_at as string,
        (r.trigger_type as string) ?? null,
        (r.full_report as string | null) ?? null,
        (r.success_report as string | null) ?? null,
        (r.failure_report as string | null) ?? null,
        (r.report_type as string | null) ?? null,
        (r.errors as number | null) ?? null,
        (r.firm_id as number | null) ?? null,
      ],
    }));

    await db.batch(statements, 'write');
    total += data.length;

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[reports-db] Cloned ${total} reports from Supabase (${environment}) to Turso`);
}

// --- Helpers ---

function parseRow(row: Row): ReportRow {
  return {
    id: row.id as string,
    report_date: row.report_date as string,
    raw_data: JSON.parse(row.raw_data as string),
    generated_at: row.generated_at as string,
    trigger_type: row.trigger_type as string,
    full_report: (row.full_report as string | null) ?? null,
    success_report: (row.success_report as string | null) ?? null,
    failure_report: (row.failure_report as string | null) ?? null,
    report_type: (row.report_type as string | null) ?? null,
    errors: row.errors != null ? Number(row.errors) : null,
    firm_id: row.firm_id != null ? Number(row.firm_id) : null,
  };
}

// Allowlist of columns that can be sorted on
const SORTABLE_COLUMNS = new Set(['report_date', 'generated_at', 'report_type', 'firm_id', 'errors']);

// --- CRUD functions ---

export async function listReports(
  environment: Environment,
  options: ListReportsOptions
): Promise<{ data: ReportRow[]; total: number }> {
  const { reportType, firmId, sortBy = 'report_date', sortOrder = 'desc', limit, offset } = options;

  const conditions: string[] = ['environment = ?'];
  const params: (string | number | null)[] = [environment];

  if (reportType) {
    conditions.push('report_type = ?');
    params.push(reportType);
  }

  if (firmId != null) {
    conditions.push('firm_id = ?');
    params.push(firmId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const safeSortBy = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'report_date';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const db = getTursoClient();

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM reports ${where}`,
    args: params,
  });

  const dataResult = await db.execute({
    sql: `SELECT * FROM reports ${where} ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`,
    args: [...params, limit, offset],
  });

  return {
    data: dataResult.rows.map(parseRow),
    total: Number(countResult.rows[0]?.cnt ?? 0),
  };
}

export async function getReportByDateAndType(
  environment: Environment,
  reportDate: string,
  reportType: string
): Promise<ReportRow | null> {
  const db = getTursoClient();
  const result = await db.execute({
    sql: 'SELECT * FROM reports WHERE environment = ? AND report_date = ? AND report_type = ? LIMIT 1',
    args: [environment, reportDate, reportType],
  });

  return result.rows.length > 0 ? parseRow(result.rows[0]) : null;
}

export async function findReportByDateTypeAndFirm(
  environment: Environment,
  reportDate: string,
  reportType: string,
  firmId: number | null
): Promise<{ id: string } | null> {
  const db = getTursoClient();
  let result;

  if (firmId != null) {
    result = await db.execute({
      sql: 'SELECT id FROM reports WHERE environment = ? AND report_date = ? AND report_type = ? AND firm_id = ? LIMIT 1',
      args: [environment, reportDate, reportType, firmId],
    });
  } else {
    result = await db.execute({
      sql: 'SELECT id FROM reports WHERE environment = ? AND report_date = ? AND report_type = ? AND firm_id IS NULL LIMIT 1',
      args: [environment, reportDate, reportType],
    });
  }

  return result.rows.length > 0 ? { id: result.rows[0].id as string } : null;
}

export async function updateReport(
  id: string,
  data: Partial<Omit<ReportRow, 'id'>>
): Promise<ReportRow | null> {
  const rawData = data.raw_data != null ? JSON.stringify(data.raw_data) : undefined;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (rawData !== undefined) { fields.push('raw_data = ?'); params.push(rawData); }
  if (data.generated_at !== undefined) { fields.push('generated_at = ?'); params.push(data.generated_at); }
  if (data.trigger_type !== undefined) { fields.push('trigger_type = ?'); params.push(data.trigger_type); }
  if (data.report_type !== undefined) { fields.push('report_type = ?'); params.push(data.report_type); }
  if ('full_report' in data) { fields.push('full_report = ?'); params.push(data.full_report ?? null); }
  if ('errors' in data) { fields.push('errors = ?'); params.push(data.errors ?? null); }
  if ('success_report' in data) { fields.push('success_report = ?'); params.push(data.success_report ?? null); }
  if ('failure_report' in data) { fields.push('failure_report = ?'); params.push(data.failure_report ?? null); }

  if (fields.length === 0) return getReportById(id);

  const db = getTursoClient();
  params.push(id);
  await db.execute({
    sql: `UPDATE reports SET ${fields.join(', ')} WHERE id = ?`,
    args: params,
  });

  return getReportById(id);
}

export async function insertReport(
  environment: Environment,
  data: Omit<ReportRow, 'id'> & { firm_id?: number | null }
): Promise<ReportRow> {
  const id = crypto.randomUUID();
  const rawData = JSON.stringify(data.raw_data);

  const db = getTursoClient();
  await db.execute({
    sql: `INSERT INTO reports (id, environment, report_date, raw_data, generated_at, trigger_type, full_report, success_report, failure_report, report_type, errors, firm_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      environment,
      data.report_date,
      rawData,
      data.generated_at,
      data.trigger_type ?? null,
      data.full_report ?? null,
      data.success_report ?? null,
      data.failure_report ?? null,
      data.report_type ?? null,
      data.errors ?? null,
      data.firm_id ?? null,
    ],
  });

  return (await getReportById(id))!;
}

export async function updateReportColumns(
  id: string,
  columns: Record<string, unknown>
): Promise<void> {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(columns)) {
    fields.push(`${key} = ?`);
    params.push((value as string | number | null) ?? null);
  }

  if (fields.length === 0) return;

  const db = getTursoClient();
  params.push(id);
  await db.execute({
    sql: `UPDATE reports SET ${fields.join(', ')} WHERE id = ?`,
    args: params,
  });
}

export async function getReportsForWeeklyAggregation(
  environment: Environment,
  weekStart: string,
  weekEnd: string,
  firmId: number | null | undefined
): Promise<ReportRow[]> {
  const db = getTursoClient();
  let result;

  if (firmId != null) {
    result = await db.execute({
      sql: `SELECT * FROM reports
            WHERE environment = ? AND report_date >= ? AND report_date <= ?
              AND (report_type = 'eod' OR report_type IS NULL)
              AND firm_id = ?
            ORDER BY report_date ASC`,
      args: [environment, weekStart, weekEnd, firmId],
    });
  } else {
    result = await db.execute({
      sql: `SELECT * FROM reports
            WHERE environment = ? AND report_date >= ? AND report_date <= ?
              AND (report_type = 'eod' OR report_type IS NULL)
              AND firm_id IS NULL
            ORDER BY report_date ASC`,
      args: [environment, weekStart, weekEnd],
    });
  }

  return result.rows.map(parseRow);
}

export async function getReportById(id: string): Promise<ReportRow | null> {
  const db = getTursoClient();
  const result = await db.execute({
    sql: 'SELECT * FROM reports WHERE id = ?',
    args: [id],
  });

  return result.rows.length > 0 ? parseRow(result.rows[0]) : null;
}
