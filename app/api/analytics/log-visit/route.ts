import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { logVisitToSheet } from '@/lib/google-sheets';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await logVisitToSheet(session.id, session.email);

    return NextResponse.json({ logged: true });
  } catch (error) {
    console.error('Failed to log visit to Google Sheet:', error);
    return NextResponse.json(
      { error: 'Failed to log visit' },
      { status: 500 }
    );
  }
}
