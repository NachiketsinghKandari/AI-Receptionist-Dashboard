/**
 * Utility functions for building shareable report URLs
 */

/**
 * Convert a date string (YYYY-MM-DD) to DDMMYYYY format
 */
function formatDateForUrl(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}${month}${year}`;
}

/**
 * Build a shareable URL for a report
 * Format: /reports/eod/DDMMYYYY?e=production or /reports/weekly/DDMMYYYY?e=production
 */
export function buildReportShareUrl(
  reportDate: string,
  reportType: 'eod' | 'weekly',
  environment: string,
  baseUrl: string = typeof window !== 'undefined' ? window.location.origin : ''
): string {
  const dateForUrl = formatDateForUrl(reportDate);
  const params = new URLSearchParams();
  params.set('e', environment);

  return `${baseUrl}/reports/${reportType}/${dateForUrl}?${params.toString()}`;
}

/**
 * Parse a report date from URL format (DDMMYYYY) to database format (YYYY-MM-DD)
 */
export function parseReportDateFromUrl(dateParam: string): string | null {
  if (!dateParam || dateParam.length !== 8) {
    return null;
  }

  const day = dateParam.slice(0, 2);
  const month = dateParam.slice(2, 4);
  const year = dateParam.slice(4, 8);
  const dateStr = `${year}-${month}-${day}`;

  // Validate it's a real date
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    return null;
  }

  return dateStr;
}

/**
 * Copy URL to clipboard and return success status
 */
export async function copyToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
