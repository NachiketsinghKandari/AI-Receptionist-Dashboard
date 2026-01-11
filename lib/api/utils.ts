/**
 * Shared API utilities for validation, error handling, and query building
 */

import { NextResponse } from 'next/server';

/**
 * Standard API error response structure
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  message: string,
  status: number,
  code?: string,
  details?: unknown
): NextResponse<ApiError> {
  const body: ApiError = { error: message };
  if (code) body.code = code;
  if (details) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Parse an integer from a string, returning null if invalid
 */
export function parseIntOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Parse an integer from a string, returning a default value if invalid
 */
export function parseIntOrDefault(value: string | null, defaultValue: number): number {
  const parsed = parseIntOrNull(value);
  return parsed ?? defaultValue;
}

/**
 * Validate that a value is within a valid range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Escape special characters in a string for use in PostgreSQL LIKE patterns.
 * This prevents SQL injection via LIKE pattern manipulation.
 *
 * PostgreSQL LIKE special characters:
 * - % matches any sequence of characters
 * - _ matches any single character
 * - \ is the escape character
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent signs
    .replace(/_/g, '\\_');   // Escape underscores
}

/**
 * Build a safe ilike search term for Supabase queries.
 * Escapes special characters and wraps with wildcards.
 */
export function buildSafeSearchTerm(value: string): string {
  const escaped = escapeLikePattern(value.trim());
  return `%${escaped}%`;
}

/**
 * Build an OR condition string for Supabase queries with safe search terms.
 *
 * @param columns - Array of column names to search
 * @param searchTerm - The search term (will be escaped)
 * @returns A string suitable for Supabase's .or() method
 */
export function buildSearchOrCondition(columns: string[], searchTerm: string): string {
  const safeTerm = buildSafeSearchTerm(searchTerm);
  return columns.map(col => `${col}.ilike.${safeTerm}`).join(',');
}

/**
 * Validate pagination parameters
 */
export function validatePagination(
  limit: number,
  offset: number,
  maxLimit: number = 100
): { limit: number; offset: number } {
  return {
    limit: clamp(limit, 1, maxLimit),
    offset: Math.max(offset, 0),
  };
}

/**
 * Check if a string is a valid integer within PostgreSQL int4 range
 */
export function isValidInt4(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const num = parseInt(value, 10);
  return num >= -2147483648 && num <= 2147483647;
}

/**
 * Decode a base64-encoded, gzip-compressed payload and parse it as JSON.
 * Returns the original value if it's already an object (for backward compatibility).
 */
export function decodeBase64Payload(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const zlib = require('zlib');
      const buffer = Buffer.from(payload, 'base64');
      const decompressed = zlib.gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf-8'));
    } catch {
      // If decoding/decompression fails, return empty object
      return {};
    }
  }
  // If already an object, return as-is (backward compatibility)
  return (payload as Record<string, unknown>) || {};
}
