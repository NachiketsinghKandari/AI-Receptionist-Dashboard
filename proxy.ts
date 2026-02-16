/**
 * Auth proxy - protects dashboard routes
 * Next.js 16+ uses proxy.ts instead of middleware.ts
 * Uses local JWT session for validation
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // API routes with Authorization header bypass cookie auth
  // Route handlers validate credentials via authenticateRequest()
  if (pathname.startsWith('/api/') && request.headers.get('authorization')) {
    return NextResponse.next();
  }

  // Check for local JWT session cookie
  const sessionToken = request.cookies.get('session')?.value;

  if (!sessionToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(sessionToken);

  if (!session) {
    // Invalid/expired token — clear the stale cookie
    const response = pathname.startsWith('/api/')
      ? NextResponse.json(
          { error: 'Unauthorized', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      : NextResponse.redirect(new URL('/login', request.url));

    response.cookies.delete('session');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
