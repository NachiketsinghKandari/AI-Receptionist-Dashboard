/**
 * Date utilities for consistent timezone handling
 * All dates are stored in UTC in the database, but the business operates in US Eastern timezone
 */

export const BUSINESS_TIMEZONE = 'America/New_York';

/**
 * Get today's date boundaries in UTC, based on Eastern timezone
 * Returns ISO strings with Z suffix for database queries
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
 * Convert a date range (in Eastern timezone) to UTC ISO strings
 * @param startDateStr - Start date in YYYY-MM-DD format (interpreted as Eastern timezone)
 * @param endDateStr - End date in YYYY-MM-DD format (interpreted as Eastern timezone)
 * @returns UTC ISO strings for database queries
 */
export function getDateRangeUTC(
  startDateStr: string,
  endDateStr: string
): { startDate: string; endDate: string } {
  // Parse the dates and create Date objects representing Eastern timezone boundaries
  // We need to find what UTC time corresponds to midnight Eastern on these dates

  // Start of day: YYYY-MM-DD 00:00:00 Eastern -> UTC
  const startUTC = easternToUTC(startDateStr, '00:00:00');

  // End of day: YYYY-MM-DD 23:59:59 Eastern -> UTC
  const endUTC = easternToUTC(endDateStr, '23:59:59');

  return {
    startDate: startUTC,
    endDate: endUTC,
  };
}

/**
 * Convert an Eastern timezone datetime to UTC ISO string
 * Handles DST automatically
 */
function easternToUTC(dateStr: string, timeStr: string): string {
  // Create a date string that JavaScript will parse
  // We use a trick: create the date in a way that respects the timezone

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);

  // Create a formatter that can tell us the UTC offset for this specific date/time in Eastern
  // Get the timezone offset for this date in Eastern timezone
  // We do this by formatting the same instant in both UTC and Eastern, then comparing
  const utcFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const easternFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // For the target date, determine if it's DST or not by checking a date in that range
  // EST (standard) = UTC-5, EDT (daylight) = UTC-4
  const checkDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const utcParts = utcFormatter.formatToParts(checkDate);
  const easternParts = easternFormatter.formatToParts(checkDate);

  const getPartValue = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const utcHour = getPartValue(utcParts, 'hour');
  const easternHour = getPartValue(easternParts, 'hour');
  const utcDay = getPartValue(utcParts, 'day');
  const easternDay = getPartValue(easternParts, 'day');

  // Calculate offset (Eastern is behind UTC, so offset is negative)
  let offsetHours = easternHour - utcHour;
  if (easternDay !== utcDay) {
    // Handle day boundary crossing
    offsetHours += (easternDay > utcDay ? 24 : -24);
  }

  // offsetHours is now -5 (EST) or -4 (EDT)
  // To convert Eastern to UTC, we subtract the offset (or add the absolute value)
  const targetEasternMs = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const targetUTCMs = targetEasternMs - (offsetHours * 60 * 60 * 1000);

  return new Date(targetUTCMs).toISOString();
}

/**
 * Get yesterday's date boundaries in UTC, based on Eastern timezone
 * Returns ISO strings with Z suffix for database queries
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
