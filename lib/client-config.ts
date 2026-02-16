import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ClientConfig, FirmConfig } from '@/types/client-config';

const CONFIG_PATH = join(process.cwd(), 'config', 'client-configs.json');

export function readConfig(): ClientConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as ClientConfig;
  } catch {
    // Return safe defaults if file is missing/corrupt
    return {
      adminDomains: ['hellocounsel.ai'],
      userFirmMappings: [],
      firms: {},
      defaults: {
        pages: {
          calls: true,
          reports: true,
          emails: true,
          transfers: true,
          sentry: true,
          webhooks: true,
        },
        columns: { calls: {}, emails: {}, transfers: {}, webhooks: {}, sentry: {} },
        features: {
          aiReports: true,
          cekuraIntegration: true,
          chat: true,
          accurateTranscript: true,
          dynamicFilters: true,
          environmentSwitcher: true,
        },
        branding: { displayName: null, logoUrl: null, theme: null },
      },
    };
  }
}

export function writeConfig(config: ClientConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getFirmConfig(config: ClientConfig, firmId: number): FirmConfig | undefined {
  return config.firms[firmId];
}

export function setFirmConfig(config: ClientConfig, firmConfig: FirmConfig): ClientConfig {
  return {
    ...config,
    firms: {
      ...config.firms,
      [firmConfig.firmId]: firmConfig,
    },
  };
}

export function deleteFirmConfig(config: ClientConfig, firmId: number): ClientConfig {
  const { [firmId]: _, ...rest } = config.firms;
  return { ...config, firms: rest };
}
