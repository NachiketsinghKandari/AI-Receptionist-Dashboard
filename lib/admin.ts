import type { ClientConfig } from '@/types/client-config';

export function isAdminEmail(email: string, adminDomains: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return adminDomains.some((d) => d.toLowerCase() === domain);
}

export function getUserFirmId(
  email: string,
  config: ClientConfig
): number | null {
  const mapping = config.userFirmMappings.find(
    (m) => m.email.toLowerCase() === email.toLowerCase()
  );
  return mapping?.firmId ?? null;
}
