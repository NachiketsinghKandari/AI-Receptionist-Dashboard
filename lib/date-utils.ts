/**
 * Date utilities for consistent timezone handling
 * All dates are stored in UTC in the database.
 * Date ranges use UTC day boundaries to match the chart grouping.
 * Eastern timezone is used only to determine WHICH date is "today"/"yesterday".
 */

export const BUSINESS_TIMEZONE = 'America/New_York';

/**
 * Get today's date in Eastern timezone, then return its UTC day boundaries.
 * Eastern is used to determine WHICH date is "today", but the boundaries are UTC midnight-to-midnight.
 */
export function getTodayRangeUTC(): { startDate: string; endDate: string } {
  const now = new Date();

  // Get today's date string in Eastern timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now); // Format: YYYY-MM-DD

  return getDateRangeUTC(todayStr, todayStr);
}

/**
 * Convert a date range to UTC ISO strings using UTC day boundaries.
 * This ensures filtering matches the chart grouping (both use UTC dates).
 * @param startDateStr - Start date in YYYY-MM-DD format
 * @param endDateStr - End date in YYYY-MM-DD format
 * @returns UTC ISO strings for database queries
 */
export function getDateRangeUTC(
  startDateStr: string,
  endDateStr: string
): { startDate: string; endDate: string } {
  return {
    startDate: `${startDateStr}T00:00:00.000Z`,
    endDate: `${endDateStr}T23:59:59.999Z`,
  };
}

/**
 * Get yesterday's date in Eastern timezone, then return its UTC day boundaries.
 * Eastern is used to determine WHICH date is "yesterday", but the boundaries are UTC midnight-to-midnight.
 */
export function getYesterdayRangeUTC(): { startDate: string; endDate: string } {
  const now = new Date();
  // Subtract one day
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const yesterdayStr = formatter.format(yesterday); // Format: YYYY-MM-DD

  return getDateRangeUTC(yesterdayStr, yesterdayStr);
}

/**
 * Format a UTC ISO string for display in Eastern timezone
 */
export function formatEasternDateTime(isoString: string, formatStr: string): string {
  const date = new Date(isoString);

  // Use Intl.DateTimeFormat for timezone-aware formatting
  const options: Intl.DateTimeFormatOptions = {
    timeZone: BUSINESS_TIMEZONE,
  };

  // Parse format string and build options
  if (formatStr.includes('yyyy')) options.year = 'numeric';
  if (formatStr.includes('MM')) options.month = '2-digit';
  if (formatStr.includes('dd')) options.day = '2-digit';
  if (formatStr.includes('HH')) {
    options.hour = '2-digit';
    options.hour12 = false;
  }
  if (formatStr.includes('mm')) options.minute = '2-digit';
  if (formatStr.includes('ss')) options.second = '2-digit';

  return new Intl.DateTimeFormat('en-CA', options).format(date).replace(',', '');
}
