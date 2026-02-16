/**
 * PII masking utilities for partially hiding sensitive data.
 * Pure functions — no React dependency.
 *
 * Masking formats:
 *   Phone:  ***-***-7890  (last 4 digits visible)
 *   Name:   J*** D**       (first letter + asterisks per word)
 *   Email:  j***@e***.com  (first letter of local + domain visible)
 */

// ── Phone ──────────────────────────────────────────────────────

/** Show only the last 4 digits: `***-***-7890` */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone as null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

// ── Name ───────────────────────────────────────────────────────

/** First letter of each word + asterisks: `J*** D**` */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return name as null;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (word.length <= 1) return word[0] + '***';
      return word[0] + '*'.repeat(word.length - 1);
    })
    .join(' ');
}

// ── Email ──────────────────────────────────────────────────────

/** `j***@e***.com` */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email as null;
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '***@***.***';

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');
  const maskedLocal = local[0] + '***';

  if (dotIndex < 1) return `${maskedLocal}@***`;

  const domainName = domain.slice(0, dotIndex);
  const tld = domain.slice(dotIndex);
  const maskedDomain = domainName[0] + '***' + tld;

  return `${maskedLocal}@${maskedDomain}`;
}

// ── Recipients ─────────────────────────────────────────────────

/** Map `maskEmail` over an array of email addresses. */
export function maskRecipients(recipients: string[]): string[] {
  return recipients.map(r => maskEmail(r) ?? r);
}

// ── Free-text content ──────────────────────────────────────────

const PHONE_REGEX = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Regex-based masking of phones and emails inside free text
 * (e.g. transcripts, email bodies).
 *
 * Names are NOT masked in free text — too many false positives.
 * Only structured name fields should use `maskName`.
 */
export function maskContentPII(text: string | null | undefined): string | null {
  if (!text) return text as null;
  return text
    .replace(EMAIL_REGEX, match => maskEmail(match) ?? match)
    .replace(PHONE_REGEX, match => maskPhone(match) ?? match);
}
