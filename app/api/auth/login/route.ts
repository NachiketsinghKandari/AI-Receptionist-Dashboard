import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, getUserApps } from '@/lib/auth/config';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (!verifyCredentials(username, password)) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const apps = getUserApps(username);
    await createSession(username, apps);

    return NextResponse.json({
      success: true,
      user: { username, apps },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
