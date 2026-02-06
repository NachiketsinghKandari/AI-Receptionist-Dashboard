import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { errorResponse } from '@/lib/api/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400, 'MISSING_CREDENTIALS');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_STAGE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse('Auth configuration missing', 500, 'CONFIG_ERROR');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return errorResponse('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const session = data.session;
    if (!session) {
      return errorResponse('No session returned', 500, 'SESSION_ERROR');
    }

    return NextResponse.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: 'bearer',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
