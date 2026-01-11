/**
 * Supabase client for server-side usage
 * Supports multiple environments (production/staging)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Environment } from '@/lib/constants';

const clients: Record<Environment, SupabaseClient | null> = {
  production: null,
  staging: null,
};

const config: Record<Environment, { urlKey: string; keyKey: string }> = {
  production: { urlKey: 'SUPABASE_PROD_URL', keyKey: 'SUPABASE_PROD_KEY' },
  staging: { urlKey: 'SUPABASE_STAGE_URL', keyKey: 'SUPABASE_STAGE_KEY' },
};

export function getSupabaseClient(environment: Environment = 'production'): SupabaseClient {
  if (clients[environment]) {
    return clients[environment]!;
  }

  const { urlKey, keyKey } = config[environment];
  const url = process.env[urlKey];
  const key = process.env[keyKey];

  if (!url || !key) {
    throw new Error(`${urlKey} and ${keyKey} environment variables must be set`);
  }

  clients[environment] = createClient(url, key);
  return clients[environment]!;
}
