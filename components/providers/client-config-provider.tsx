'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ClientConfigContext } from '@/hooks/use-client-config';
import type { FirmConfig, ResolvedClientConfig } from '@/types/client-config';

export function ClientConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<FirmConfig | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [firmId, setFirmId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTheme } = useTheme();

  useEffect(() => {
    fetch('/api/client-config')
      .then((res) => res.json())
      .then((data: ResolvedClientConfig) => {
        setConfig(data.config);
        setIsAdmin(data.isAdmin);
        setFirmId(data.firmId);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Theme + branding side-effects
  useEffect(() => {
    if (!config?.branding) return;

    const { theme: firmTheme, displayName } = config.branding;

    // Apply full theme overrides (all CSS variables)
    if (firmTheme) {
      // Force light mode base for firm users — their theme is fixed
      setTheme('light');

      for (const [key, value] of Object.entries(firmTheme)) {
        document.documentElement.style.setProperty(`--${key}`, value);
      }
    }

    if (displayName) {
      document.title = `${displayName} Dashboard`;
    }

    return () => {
      // Clean up on unmount
      if (firmTheme) {
        for (const key of Object.keys(firmTheme)) {
          document.documentElement.style.removeProperty(`--${key}`);
        }
      }
    };
  }, [config?.branding, setTheme]);

  return (
    <ClientConfigContext.Provider value={{ config, isAdmin, firmId, isLoading }}>
      {children}
    </ClientConfigContext.Provider>
  );
}
