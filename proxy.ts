/**
 * Auth proxy - protects dashboard routes
 * Next.js 16+ uses proxy.ts instead of middleware.ts
 * Uses Supabase Auth for session validation
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/api/auth', '/auth/callback'];

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_STAGE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('NEXT_PUBLIC_SUPABASE_STAGE_URL and NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY must be set');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Create a response that we can modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh session if expired - required for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Clear stale auth cookies to prevent "Invalid Refresh Token" loops.
    // When a refresh token is revoked/expired server-side, the browser still
    // holds the old sb-* cookies. Without clearing them, every subsequent
    // request triggers a failed refresh attempt and an AuthApiError.
    const staleResponse = pathname.startsWith('/api/')
      ? NextResponse.json(
          { error: 'Unauthorized', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      : NextResponse.redirect(new URL('/login', request.url));

    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-')) {
        staleResponse.cookies.delete(name);
      }
    });

    return staleResponse;
  }

  return response;
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
