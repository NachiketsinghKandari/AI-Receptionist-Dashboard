'use client';

import { useMemo } from 'react';
import { useClientConfig } from '@/hooks/use-client-config';
import { maskPhone, maskName, maskEmail, maskRecipients, maskContentPII } from '@/lib/pii-masker';
import type { PiiMaskingConfig } from '@/types/client-config';

export interface PIIMaskFunctions {
  /** Whether PII masking is currently active */
  isActive: boolean;
  phone: (v: string | null | undefined) => string | null;
  name: (v: string | null | undefined) => string | null;
  email: (v: string | null | undefined) => string | null;
  recipients: (v: string[]) => string[];
  content: (v: string | null | undefined) => string | null;
}

// Static identity functions — zero processing cost for admins
const idFn = (v: string | null | undefined) => v as string | null;
const idRecipients = (v: string[]) => v;

const IDENTITY: PIIMaskFunctions = {
  isActive: false,
  phone: idFn,
  name: idFn,
  email: idFn,
  recipients: idRecipients,
  content: idFn,
};

/**
 * Returns PII masking functions based on the current user's config.
 * - Admins always get IDENTITY (pass-through) — zero cost.
 * - Non-admin users get per-field masking based on the firm's piiMasking config.
 */
export function usePIIMask(): PIIMaskFunctions {
  const { config, isAdmin } = useClientConfig();

  return useMemo(() => {
    // Admins: immediate static return — no processing
    if (isAdmin) return IDENTITY;

    const m = config?.features.piiMasking as PiiMaskingConfig | undefined;
    if (!m || (!m.phones && !m.names && !m.emails && !m.transcripts)) {
      return IDENTITY;
    }

    return {
      isActive: true,
      phone: m.phones ? maskPhone : idFn,
      name: m.names ? maskName : idFn,
      email: m.emails ? maskEmail : idFn,
      recipients: m.emails ? maskRecipients : idRecipients,
      content: m.transcripts ? maskContentPII : idFn,
    };
  }, [config, isAdmin]);
}
