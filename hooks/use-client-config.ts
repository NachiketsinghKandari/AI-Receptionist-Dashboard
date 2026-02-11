'use client';

import { createContext, useContext } from 'react';
import type { FirmConfig } from '@/types/client-config';

export interface ClientConfigContextValue {
  config: FirmConfig | null;
  isAdmin: boolean;
  firmId: number | null;
  isLoading: boolean;
}

export const ClientConfigContext = createContext<ClientConfigContextValue>({
  config: null,
  isAdmin: false,
  firmId: null,
  isLoading: true,
});

export function useClientConfig(): ClientConfigContextValue {
  return useContext(ClientConfigContext);
}
