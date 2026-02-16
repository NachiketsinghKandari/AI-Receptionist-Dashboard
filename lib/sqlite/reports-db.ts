/**
 * SQLite-based reports storage
 * Replaces Supabase for the reports table with a local file-based DB.
 * On first access, clones existing data from Supabase, then all reads/writes go to SQLite.
 */

import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import type { Environment } from '@/lib/constants';
import { getSupabaseClient } from '@/lib/supabase/client';

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

interface RawReportRow {
  id: string;
  report_date: string;
  raw_data: string;
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

// --- Connection singleton ---

const dbInstances = new Map<Environment, Database.Database>();

function getDbPath(environment: Environment): string {
  return path.join(process.cwd(), '.data', `reports-${environment}.db`);
}

export function getReportsDb(environment: Environment): Database.Database {
  const existing = dbInstances.get(environment);
  if (existing) return existing;

  const dbPath = getDbPath(environment);
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables and indexes
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
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
    );

    CREATE INDEX IF NOT EXISTS idx_reports_report_date ON reports(report_date);
    CREATE INDEX IF NOT EXISTS idx_reports_report_type ON reports(report_type);
    CREATE INDEX IF NOT EXISTS idx_reports_firm_id ON reports(firm_id);
    CREATE INDEX IF NOT EXISTS idx_reports_date_type ON reports(report_date, report_type);
  `);

  dbInstances.set(environment, db);
  return db;
}

// --- Lazy clone from Supabase ---

const clonePromises = new Map<Environment, Promise<void>>();

export async function ensureCloned(environment: Environment): Promise<void> {
  const db = getReportsDb(environment);

  // Quick check: if table already has rows, skip
  const row = db.prepare('SELECT COUNT(*) as cnt FROM reports').get() as { cnt: number };
  if (row.cnt > 0) return;

  // Prevent concurrent clones for the same environment
  const existing = clonePromises.get(environment);
  if (existing) return existing;

  const promise = cloneFromSupabase(db, environment);
  clonePromises.set(environment, promise);

  try {
    await promise;
  } finally {
    clonePromises.delete(environment);
  }
}

async function cloneFromSupabase(db: Database.Database, environment: Environment): Promise<void> {
  console.log(`[reports-db] Cloning reports from Supabase (${environment})...`);

  const supabase = getSupabaseClient(environment);
  const PAGE_SIZE = 500;
  let offset = 0;
  let total = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO reports (id, report_date, raw_data, generated_at, trigger_type, full_report, success_report, failure_report, report_type, errors, firm_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: RawReportRow[]) => {
    for (const r of rows) {
      insert.run(r.id, r.report_date, r.raw_data, r.generated_at, r.trigger_type, r.full_report, r.success_report, r.failure_report, r.report_type, r.errors, r.firm_id);
    }
  });

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

    const rows: RawReportRow[] = data.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      report_date: r.report_date as string,
      raw_data: typeof r.raw_data === 'string' ? r.raw_data : JSON.stringify(r.raw_data),
      generated_at: r.generated_at as string,
      trigger_type: r.trigger_type as string,
      full_report: (r.full_report as string | null) ?? null,
      success_report: (r.success_report as string | null) ?? null,
      failure_report: (r.failure_report as string | null) ?? null,
      report_type: (r.report_type as string | null) ?? null,
      errors: (r.errors as number | null) ?? null,
      firm_id: (r.firm_id as number | null) ?? null,
    }));

    insertMany(rows);
    total += rows.length;

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[reports-db] Cloned ${total} reports from Supabase (${environment})`);
}

// --- Helpers ---

function parseRow(row: RawReportRow): ReportRow {
  return {
    ...row,
    raw_data: JSON.parse(row.raw_data),
  };
}

// Allowlist of columns that can be sorted on
const SORTABLE_COLUMNS = new Set(['report_date', 'generated_at', 'report_type', 'firm_id', 'errors']);

// --- CRUD functions ---

export function listReports(
  db: Database.Database,
  options: ListReportsOptions
): { data: ReportRow[]; total: number } {
  const { reportType, firmId, sortBy = 'report_date', sortOrder = 'desc', limit, offset } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (reportType) {
    conditions.push('report_type = ?');
    params.push(reportType);
  }

  if (firmId != null) {
    conditions.push('firm_id = ?');
    params.push(firmId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sortBy against allowlist
  const safeSortBy = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'report_date';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM reports ${where}`).get(...params) as { cnt: number };

  const rows = db.prepare(
    `SELECT * FROM reports ${where} ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as RawReportRow[];

  return {
    data: rows.map(parseRow),
    total: countRow.cnt,
  };
}

export function getReportByDateAndType(
  db: Database.Database,
  reportDate: string,
  reportType: string
): ReportRow | null {
  const row = db.prepare(
    'SELECT * FROM reports WHERE report_date = ? AND report_type = ? LIMIT 1'
  ).get(reportDate, reportType) as RawReportRow | undefined;

  return row ? parseRow(row) : null;
}

export function findReportByDateTypeAndFirm(
  db: Database.Database,
  reportDate: string,
  reportType: string,
  firmId: number | null
): { id: string } | null {
  let row: { id: string } | undefined;
  if (firmId != null) {
    row = db.prepare(
      'SELECT id FROM reports WHERE report_date = ? AND report_type = ? AND firm_id = ? LIMIT 1'
    ).get(reportDate, reportType, firmId) as { id: string } | undefined;
  } else {
    row = db.prepare(
      'SELECT id FROM reports WHERE report_date = ? AND report_type = ? AND firm_id IS NULL LIMIT 1'
    ).get(reportDate, reportType) as { id: string } | undefined;
  }
  return row ?? null;
}

export function updateReport(
  db: Database.Database,
  id: string,
  data: Partial<Omit<ReportRow, 'id'>>
): ReportRow | null {
  const rawData = data.raw_data != null ? JSON.stringify(data.raw_data) : undefined;
  const fields: string[] = [];
  const params: unknown[] = [];

  if (rawData !== undefined) { fields.push('raw_data = ?'); params.push(rawData); }
  if (data.generated_at !== undefined) { fields.push('generated_at = ?'); params.push(data.generated_at); }
  if (data.trigger_type !== undefined) { fields.push('trigger_type = ?'); params.push(data.trigger_type); }
  if (data.report_type !== undefined) { fields.push('report_type = ?'); params.push(data.report_type); }
  if ('full_report' in data) { fields.push('full_report = ?'); params.push(data.full_report ?? null); }
  if ('errors' in data) { fields.push('errors = ?'); params.push(data.errors ?? null); }
  if ('success_report' in data) { fields.push('success_report = ?'); params.push(data.success_report ?? null); }
  if ('failure_report' in data) { fields.push('failure_report = ?'); params.push(data.failure_report ?? null); }

  if (fields.length === 0) return getReportById(db, id);

  params.push(id);
  db.prepare(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  return getReportById(db, id);
}

export function insertReport(
  db: Database.Database,
  data: Omit<ReportRow, 'id'> & { firm_id?: number | null }
): ReportRow {
  const id = crypto.randomUUID();
  const rawData = JSON.stringify(data.raw_data);

  db.prepare(`
    INSERT INTO reports (id, report_date, raw_data, generated_at, trigger_type, full_report, success_report, failure_report, report_type, errors, firm_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.report_date,
    rawData,
    data.generated_at,
    data.trigger_type,
    data.full_report ?? null,
    data.success_report ?? null,
    data.failure_report ?? null,
    data.report_type ?? null,
    data.errors ?? null,
    data.firm_id ?? null
  );

  return getReportById(db, id)!;
}

export function updateReportColumns(
  db: Database.Database,
  id: string,
  columns: Record<string, unknown>
): void {
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(columns)) {
    fields.push(`${key} = ?`);
    params.push(value ?? null);
  }

  if (fields.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getReportsForWeeklyAggregation(
  db: Database.Database,
  weekStart: string,
  weekEnd: string,
  firmId: number | null | undefined
): ReportRow[] {
  let rows: RawReportRow[];

  if (firmId != null) {
    rows = db.prepare(`
      SELECT * FROM reports
      WHERE report_date >= ? AND report_date <= ?
        AND (report_type = 'eod' OR report_type IS NULL)
        AND firm_id = ?
      ORDER BY report_date ASC
    `).all(weekStart, weekEnd, firmId) as RawReportRow[];
  } else {
    rows = db.prepare(`
      SELECT * FROM reports
      WHERE report_date >= ? AND report_date <= ?
        AND (report_type = 'eod' OR report_type IS NULL)
        AND firm_id IS NULL
      ORDER BY report_date ASC
    `).all(weekStart, weekEnd) as RawReportRow[];
  }

  return rows.map(parseRow);
}

export function getReportById(db: Database.Database, id: string): ReportRow | null {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as RawReportRow | undefined;
  return row ? parseRow(row) : null;
}
