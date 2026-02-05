/**
 * Email allowlist configuration for Google OAuth
 * Reads allowed emails from ALLOWED_EMAILS environment variable
 */

function parseAllowedEmails(): string[] {
  const envValue = process.env.ALLOWED_EMAILS || '';
  if (!envValue.trim()) {
    return [];
  }
  return envValue
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * Check if an email is in the allowlist
 * @param email - Email address to check
 * @returns true if email is allowed, false otherwise
 */
export function isEmailAllowed(email: string): boolean {
  const allowedEmails = parseAllowedEmails();
  // If no allowlist is configured, deny all
  if (allowedEmails.length === 0) {
    return false;
  }
  return allowedEmails.includes(email.trim().toLowerCase());
}

/**
 * Get the list of allowed emails
 * @returns Array of allowed email addresses (lowercase, trimmed)
 */
export function getAllowedEmails(): string[] {
  return parseAllowedEmails();
}
