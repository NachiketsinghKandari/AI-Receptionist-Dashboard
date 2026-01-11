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
