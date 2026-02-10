/**
 * SQL validator: whitelist-based approach that only allows read-only queries.
 * This is the first layer of defense; the Supabase RPC function provides
 * a second layer with SET default_transaction_read_only = on.
 */

const MAX_LIMIT = 1000;

/** Keywords that indicate a write/DDL/admin operation */
const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'GRANT',
  'REVOKE',
  'EXECUTE',
  'CALL',
  'DO',
  'COPY',
  'IMPORT',
  'LOAD',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
  'COMMENT',
  'LOCK',
  'SET',
  'RESET',
  'NOTIFY',
  'LISTEN',
  'PREPARE',
] as const;

/** System tables that should never be queried */
const BLOCKED_TABLE_PATTERNS = [
  /\bpg_\w+/i,
  /\binformation_schema\b/i,
  /\bauth\.\w+/i,
  /\bstorage\.\w+/i,
  /\bsupabase_\w+/i,
];

/** Dangerous functions */
const BLOCKED_FUNCTIONS = [
  /\bpg_sleep\b/i,
  /\bdblink\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
  /\bcopy\s*\(/i,
  /\bpg_read_file\b/i,
  /\bpg_write_file\b/i,
  /\bpg_ls_dir\b/i,
  /\bcurrent_setting\b/i,
  /\bset_config\b/i,
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sql?: string;
}

/**
 * Strip SQL comments (both line and block) to prevent hiding malicious code
 */
function stripComments(sql: string): string {
  // Remove block comments (non-greedy)
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments
  result = result.replace(/--[^\n]*/g, ' ');
  return result;
}

/**
 * Ensure the query has a LIMIT clause, adding one if missing.
 * Caps existing LIMIT at MAX_LIMIT.
 */
function enforceLimit(sql: string): string {
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    const existing = parseInt(limitMatch[1], 10);
    if (existing > MAX_LIMIT) {
      return sql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_LIMIT}`);
    }
    return sql;
  }
  // No LIMIT found — append one
  return `${sql.replace(/;\s*$/, '')} LIMIT ${MAX_LIMIT}`;
}

/**
 * Validate a SQL query for safety. Returns the (possibly modified) SQL if valid.
 */
export function validateSql(raw: string): ValidationResult {
  if (!raw || !raw.trim()) {
    return { valid: false, error: 'Empty SQL query' };
  }

  // Strip comments first
  const cleaned = stripComments(raw).trim();

  if (!cleaned) {
    return { valid: false, error: 'SQL query is empty after removing comments' };
  }

  // Block dollar-quoted strings ($$...$$) which could hide keywords
  if (/\$\$/.test(cleaned)) {
    return { valid: false, error: 'Dollar-quoted strings are not allowed' };
  }

  // Block multiple statements (semicolons in the middle)
  // Handle escaped quotes ('') inside string literals properly
  const withoutStrings = cleaned.replace(/'(?:[^']|'')*'/g, '');
  if (withoutStrings.replace(/;\s*$/, '').includes(';')) {
    return { valid: false, error: 'Multiple SQL statements are not allowed' };
  }

  // Whitelist: must start with SELECT or WITH (for CTEs)
  const normalized = cleaned.replace(/\s+/g, ' ');
  const upperPrefix = normalized.toUpperCase().trimStart();
  if (!upperPrefix.startsWith('SELECT') && !upperPrefix.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Check for blocked keywords (word-boundary match in the non-string portion)
  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(withoutStrings)) {
      return { valid: false, error: `Blocked keyword: ${keyword}` };
    }
  }

  // Check for system table access
  for (const pattern of BLOCKED_TABLE_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return { valid: false, error: 'Access to system tables is not allowed' };
    }
  }

  // Check for dangerous functions
  for (const pattern of BLOCKED_FUNCTIONS) {
    if (pattern.test(withoutStrings)) {
      return { valid: false, error: 'Dangerous function call detected' };
    }
  }

  // Enforce LIMIT
  const finalSql = enforceLimit(cleaned.replace(/;\s*$/, ''));

  return { valid: true, sql: finalSql };
}
