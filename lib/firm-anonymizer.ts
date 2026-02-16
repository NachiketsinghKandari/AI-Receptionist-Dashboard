import type { Firm } from '@/types/database';

/**
 * Frontend-only firm name anonymizer.
 * Maps real firm names to generic "Firm 1", "Firm 2", etc. based on ID order.
 * Backend data is never modified — this only affects display.
 */

/**
 * Creates a mapping from firm ID to anonymized display name.
 * Firms are numbered sequentially based on ascending ID order.
 */
export function createFirmAnonymizationMap(firms: Firm[]): Map<number, string> {
  const sorted = [...firms].sort((a, b) => a.id - b.id);
  const map = new Map<number, string>();
  sorted.forEach((firm, index) => {
    map.set(firm.id, `Firm ${index + 1}`);
  });
  return map;
}

/**
 * Returns a new array of firms with names replaced by "Firm 1", "Firm 2", etc.
 */
export function anonymizeFirms(firms: Firm[]): Firm[] {
  const map = createFirmAnonymizationMap(firms);
  return firms.map(firm => ({
    ...firm,
    name: map.get(firm.id) ?? `Firm ${firm.id}`,
  }));
}

/**
 * Gets the anonymized name for a single firm given its ID and the full list.
 */
export function getAnonymizedFirmName(firmId: number, firms: Firm[]): string {
  const map = createFirmAnonymizationMap(firms);
  return map.get(firmId) ?? `Firm ${firmId}`;
}

/**
 * Replaces all occurrences of real firm names in a string with their
 * anonymized equivalents. Matches are case-insensitive and use word
 * boundaries so partial matches inside other words are avoided.
 * Longer names are replaced first to prevent partial-match collisions.
 */
export function anonymizeContent(content: string, realFirms: Firm[]): string {
  if (!content || realFirms.length === 0) return content;

  const anonMap = createFirmAnonymizationMap(realFirms);

  // Sort by name length descending so "Bey and Associates LLC" is replaced
  // before "Bey" (avoids partial leftover).
  const sorted = [...realFirms].sort((a, b) => b.name.length - a.name.length);

  let result = content;
  for (const firm of sorted) {
    const anonymized = anonMap.get(firm.id);
    if (!anonymized) continue;
    // Case-insensitive global replace with word-boundary-like safety.
    // We escape regex special chars in the firm name.
    const escaped = firm.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, anonymized);
  }

  return result;
}
