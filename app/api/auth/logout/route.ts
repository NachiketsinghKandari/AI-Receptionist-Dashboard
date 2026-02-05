import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

export async function POST() {
  try {
    const supabase = await createAuthServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'An error occurred during logout' },
      { status: 500 }
    );
  }
}
