/**
 * Auth callback route for Supabase authentication
 * Handles OAuth redirects and password recovery flows
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import { isEmailAllowed } from '@/lib/auth/allowlist';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth errors from the provider
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`
    );
  }

  // Validate that we received an auth code
  if (!code) {
    console.error('No auth code received in callback');
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    const supabase = await createAuthServerClient();

    // Exchange the auth code for a session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Failed to exchange code for session:', exchangeError.message);
      return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
    }

    // Handle password recovery flow - redirect to reset password page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    // Get the user's email from the session
    const userEmail = data.user?.email;

    if (!userEmail) {
      console.error('No email found in user session');
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=no_email`);
    }

    // Check if the user's email is in the allowlist
    if (!isEmailAllowed(userEmail)) {
      console.error('Email not in allowlist:', userEmail);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=unauthorized`);
    }

    // Email is allowed - redirect to dashboard home
    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    console.error('Unexpected error during OAuth callback:', err);
    return NextResponse.redirect(`${origin}/login?error=unexpected`);
  }
}
