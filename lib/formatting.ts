/**
 * Shared formatting utilities for the dashboard
 */

/**
 * Formats a duration in seconds to a human-readable string (e.g., "5m 30s")
 * @param seconds - Duration in seconds (can be null)
 * @returns Formatted string like "5m 30s" or "-" if null/undefined
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Formats a UTC timestamp from the database without timezone conversion.
 * The database stores times in UTC (e.g., "2026-02-04T23:47:34.57698+00:00").
 * This function extracts the UTC date/time directly without converting to local time.
 *
 * @param timestamp - UTC timestamp string from database
 * @param format - Output format: 'datetime' (default), 'date', 'time', 'datetime-seconds'
 * @returns Formatted UTC string or '-' if null/undefined
 */
export function formatUTCTimestamp(
  timestamp: string | null | undefined,
  format: 'datetime' | 'date' | 'time' | 'datetime-seconds' = 'datetime'
): string {
  if (!timestamp) return '-';

  // Normalize: replace space with T for consistent parsing
  const normalized = timestamp.replace(' ', 'T');

  // Extract parts: "2026-02-04T23:47:34.57698+00:00" -> date: "2026-02-04", time: "23:47:34"
  const [datePart, timePart] = normalized.split('T');
  const timeOnly = timePart?.split('.')[0] || timePart?.slice(0, 8) || '';
  const timeWithoutSeconds = timeOnly.slice(0, 5);

  switch (format) {
    case 'date':
      return datePart || '-';
    case 'time':
      return timeWithoutSeconds || '-';
    case 'datetime-seconds':
      return `${datePart} ${timeOnly}`;
    case 'datetime':
    default:
      return `${datePart} ${timeWithoutSeconds}`;
  }
}
