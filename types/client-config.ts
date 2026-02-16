export interface PageToggles {
  calls: boolean;
  reports: boolean;
  emails: boolean;
  transfers: boolean;
  sentry: boolean;
  webhooks: boolean;
}

export interface ColumnToggles {
  calls: Record<string, boolean>;
  emails: Record<string, boolean>;
  transfers: Record<string, boolean>;
  webhooks: Record<string, boolean>;
  sentry: Record<string, boolean>;
}

export interface PiiMaskingConfig {
  phones: boolean;
  names: boolean;
  emails: boolean;
  transcripts: boolean;
}

export interface FeatureToggles {
  aiReports: boolean;
  cekuraIntegration: boolean;
  chat: boolean;
  accurateTranscript: boolean;
  dynamicFilters: boolean;
  environmentSwitcher: boolean;
  piiMasking: PiiMaskingConfig;
}

export interface FirmBranding {
  displayName: string | null;
  logoUrl: string | null;
  theme: Record<string, string> | null;
}

export interface FirmConfig {
  firmId: number;
  firmName: string;
  pages: PageToggles;
  columns: ColumnToggles;
  features: FeatureToggles;
  branding: FirmBranding;
}

export interface UserFirmMapping {
  email: string;
  firmId: number;
}

export interface ClientConfig {
  adminDomains: string[];
  userFirmMappings: UserFirmMapping[];
  firms: Record<number, FirmConfig>;
  defaults: {
    pages: PageToggles;
    columns: ColumnToggles;
    features: FeatureToggles;
    branding: FirmBranding;
  };
}

export interface ResolvedClientConfig {
  config: FirmConfig | null;
  isAdmin: boolean;
  firmId: number | null;
}
