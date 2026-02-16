import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { readConfig } from '@/lib/client-config';
import { isAdminEmail, getUserFirmId } from '@/lib/admin';
import type { FirmConfig, ResolvedClientConfig } from '@/types/client-config';

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = readConfig();
    const email = session.email;
    const admin = isAdminEmail(email, config.adminDomains);

    if (admin) {
      // Admins get all-enabled defaults (full access)
      const result: ResolvedClientConfig = {
        config: null, // null signals "use defaults / show everything"
        isAdmin: true,
        firmId: null,
      };
      return NextResponse.json(result);
    }

    // Check for firm mapping
    const firmId = getUserFirmId(email, config);
    if (firmId !== null && config.firms[firmId]) {
      const result: ResolvedClientConfig = {
        config: config.firms[firmId],
        isAdmin: false,
        firmId,
      };
      return NextResponse.json(result);
    }

    // No mapping — return defaults as a FirmConfig shape
    const defaultConfig: FirmConfig = {
      firmId: 0,
      firmName: 'Default',
      pages: config.defaults.pages,
      columns: config.defaults.columns,
      features: config.defaults.features,
      branding: config.defaults.branding,
    };

    const result: ResolvedClientConfig = {
      config: defaultConfig,
      isAdmin: false,
      firmId: null,
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('Client config error:', error);
    return NextResponse.json(
      { error: 'Failed to load client config' },
      { status: 500 }
    );
  }
}
