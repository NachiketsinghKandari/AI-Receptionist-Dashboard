import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { readConfig, writeConfig } from '@/lib/client-config';
import { isAdminEmail } from '@/lib/admin';
import type { ClientConfig } from '@/types/client-config';

async function requireAdmin() {
  const session = await getSession();

  if (!session?.email) {
    return { error: 'Unauthorized', status: 401 } as const;
  }

  const config = readConfig();
  if (!isAdminEmail(session.email, config.adminDomains)) {
    return { error: 'Forbidden', status: 403 } as const;
  }

  return { config, email: session.email } as const;
}

export async function GET() {
  const result = await requireAdmin();
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json(result.config);
}

export async function PUT(request: NextRequest) {
  const result = await requireAdmin();
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  try {
    const body = (await request.json()) as Partial<ClientConfig>;
    const current = result.config;

    // Merge: allow updating adminDomains, userFirmMappings, defaults
    const updated: ClientConfig = {
      ...current,
      ...(body.adminDomains !== undefined && {
        adminDomains: body.adminDomains,
      }),
      ...(body.userFirmMappings !== undefined && {
        userFirmMappings: body.userFirmMappings,
      }),
      ...(body.defaults !== undefined && { defaults: body.defaults }),
      // firms are managed via /admin/config/[firmId]
      firms: current.firms,
    };

    writeConfig(updated);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Admin config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
