import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, getUserId } from '@/lib/auth/config';
import { createSession } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400, 'MISSING_CREDENTIALS');
    }

    const user = verifyCredentials(email, password);
    if (!user) {
      return errorResponse('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const id = getUserId(user.email);
    await createSession(id, user.email, user.apps);

    return NextResponse.json({
      user: {
        id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
