import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

export async function GET() {
  try {
    const supabase = await createAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Get display name from user metadata, or fall back to email username
    const displayName =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'User';

    return NextResponse.json({
      authenticated: true,
      user: {
        email: user.email,
        id: user.id,
        username: displayName,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'An error occurred checking session' },
      { status: 500 }
    );
  }
}
