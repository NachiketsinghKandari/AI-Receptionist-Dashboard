import { NextRequest, NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import {
  readConfig,
  writeConfig,
  setFirmConfig,
  deleteFirmConfig,
} from '@/lib/client-config';
import { isAdminEmail } from '@/lib/admin';
import type { FirmConfig } from '@/types/client-config';

async function requireAdmin() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'Unauthorized', status: 401 } as const;
  }

  const config = readConfig();
  if (!isAdminEmail(user.email, config.adminDomains)) {
    return { error: 'Forbidden', status: 403 } as const;
  }

  return { config, email: user.email } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const result = await requireAdmin();
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { firmId: firmIdStr } = await params;
  const firmId = parseInt(firmIdStr, 10);
  if (isNaN(firmId)) {
    return NextResponse.json({ error: 'Invalid firm ID' }, { status: 400 });
  }

  const firmConfig = result.config.firms[firmId];
  if (!firmConfig) {
    return NextResponse.json({ error: 'Firm not found' }, { status: 404 });
  }

  return NextResponse.json(firmConfig);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const result = await requireAdmin();
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { firmId: firmIdStr } = await params;
  const firmId = parseInt(firmIdStr, 10);
  if (isNaN(firmId)) {
    return NextResponse.json({ error: 'Invalid firm ID' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as FirmConfig;
    // Ensure firmId in body matches URL
    const firmConfig: FirmConfig = { ...body, firmId };
    const updated = setFirmConfig(result.config, firmConfig);
    writeConfig(updated);
    return NextResponse.json(firmConfig);
  } catch (error) {
    console.error('Firm config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update firm config' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const result = await requireAdmin();
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { firmId: firmIdStr } = await params;
  const firmId = parseInt(firmIdStr, 10);
  if (isNaN(firmId)) {
    return NextResponse.json({ error: 'Invalid firm ID' }, { status: 400 });
  }

  const updated = deleteFirmConfig(result.config, firmId);
  writeConfig(updated);
  return NextResponse.json({ success: true });
}
