# Authentication and Session Management

## Overview
AI Receptionist Dashboard uses Supabase Auth for authentication. Sessions are managed via Supabase cookies (sb-* prefix). A proxy.ts file acts as the auth gate for all non-public routes (replacing deprecated middleware.ts in Next.js 16).

## Auth Flow Diagrams

### Browser Login (Email/Password)

```mermaid
sequenceDiagram
    participant User
    participant LoginPage as /login
    participant Browser as Browser Client
    participant Supabase
    participant Proxy as proxy.ts
    participant Dashboard

    User->>LoginPage: Submit email/password
    LoginPage->>Browser: createAuthBrowserClient()
    Browser->>Supabase: signInWithPassword({ email, password })
    Supabase->>Supabase: Validate against auth.users
    Supabase->>Browser: Set sb-* cookies via @supabase/ssr
    Browser->>LoginPage: Session established
    LoginPage->>Dashboard: router.push('/')
    Dashboard->>Proxy: Request /
    Proxy->>Browser: Create server Supabase client
    Browser->>Proxy: Read sb-* cookies
    Proxy->>Supabase: supabase.auth.getUser()
    Supabase->>Proxy: Valid session + refreshed tokens
    Proxy->>Dashboard: NextResponse.next() with refreshed cookies
    Dashboard->>User: Render dashboard with providers and navbar
```

### API Request from Dashboard

```mermaid
sequenceDiagram
    participant Dashboard
    participant TanStack as TanStack Query
    participant Proxy as proxy.ts
    participant API as /api/* Route
    participant Auth as authenticateRequest()
    participant Supabase

    Dashboard->>TanStack: Hook fires fetch to /api/...
    TanStack->>Proxy: GET /api/... (cookies automatic, no Authorization header)
    Proxy->>Supabase: supabase.auth.getUser() from cookies
    Supabase->>Proxy: Valid session
    Proxy->>API: NextResponse.next() -> API route handler
    API->>Auth: authenticateRequest()
    Auth->>Auth: Check for sb-* cookies
    Auth->>API: { authenticated: true }
    API->>Dashboard: Return data
```

### External API Request (Postman/curl)

```mermaid
sequenceDiagram
    participant Client as Postman/curl
    participant LoginAPI as /api/auth/login
    participant Supabase
    participant Proxy as proxy.ts
    participant API as /api/* Route
    participant Auth as authenticateRequest()

    Client->>LoginAPI: POST { email, password }
    LoginAPI->>Supabase: signInWithPassword()
    Supabase->>LoginAPI: { access_token, refresh_token, ... }
    LoginAPI->>Client: Return tokens

    Note over Client: Subsequent requests
    Client->>Proxy: GET /api/calls<br/>Authorization: Bearer <token>
    Proxy->>Proxy: See /api/* + Authorization header
    Proxy->>API: Pass through to API route
    API->>Auth: authenticateRequest()
    Auth->>Supabase: supabase.auth.getUser(token)
    Supabase->>Auth: Valid user
    Auth->>API: { authenticated: true }
    API->>Client: Return data
```

### OAuth Flow (Google, currently hidden)

```mermaid
sequenceDiagram
    participant User
    participant LoginPage as /login
    participant Google
    participant Callback as /auth/callback
    participant Allowlist as ALLOWED_EMAILS
    participant Dashboard

    User->>LoginPage: Click "Sign in with Google"
    LoginPage->>Google: signInWithOAuth redirect
    Google->>User: Google login screen
    User->>Google: Authenticate
    Google->>Callback: Redirect with ?code=...
    Callback->>Callback: Exchange code for session
    Callback->>Allowlist: Check email against allowlist

    alt Email allowed
        Callback->>Dashboard: Redirect to /
        Dashboard->>User: Render dashboard
    else Email not allowed
        Callback->>Callback: Sign out
        Callback->>LoginPage: Redirect to /login?error=unauthorized
        LoginPage->>User: Show error message
    end
```

## Key Files

| File | Purpose |
|------|---------|
| `app/(auth)/login/page.tsx` | Login form (email/password + hidden Google OAuth) |
| `app/(auth)/forgot-password/page.tsx` | Password reset request |
| `app/(auth)/reset-password/page.tsx` | New password entry |
| `app/auth/callback/route.ts` | OAuth callback handler |
| `app/api/auth/login/route.ts` | API login (for Postman/curl) |
| `app/api/auth/logout/route.ts` | Logout endpoint |
| `app/api/auth/session/route.ts` | Session check endpoint |
| `proxy.ts` | Auth gate (validates every request) |
| `lib/api/auth.ts` | `authenticateRequest()` for API routes |
| `lib/auth/allowlist.ts` | Email allowlist for OAuth |
| `lib/auth/config.ts` | Legacy hardcoded users (UNUSED) |
| `lib/auth/session.ts` | Legacy JWT sessions (UNUSED) |
| `lib/supabase/auth-client.ts` | Browser Supabase client for auth |
| `lib/supabase/auth-server.ts` | Server Supabase client for auth |

## Public Routes (No Auth Required)
- `/login`
- `/forgot-password`
- `/reset-password`
- `/api/auth/*`
- `/auth/callback`

## Auth Modes for API Routes

### 1. Cookie Auth (Browser)
No Authorization header needed. proxy.ts already validated the session. API route checks for sb-* cookies and trusts the proxy.

**Example (automatic from browser):**
```http
GET /api/calls
Cookie: sb-access-token=...; sb-refresh-token=...
```

### 2. Bearer Token
`Authorization: Bearer <supabase_access_token>`. Validated via `supabase.auth.getUser(token)`.

**Example:**
```http
GET /api/calls
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Basic Auth
`Authorization: Basic <base64(email:password)>`. Validated via `supabase.auth.signInWithPassword()`.

**Example:**
```http
GET /api/calls
Authorization: Basic dXNlckBleGFtcGxlLmNvbTpwYXNzd29yZA==
```

## Password Recovery Flow

```mermaid
sequenceDiagram
    participant User
    participant ForgotPage as /forgot-password
    participant Supabase
    participant Email
    participant Callback as /auth/callback
    participant ResetPage as /reset-password
    participant LoginPage as /login

    User->>ForgotPage: Enter email
    ForgotPage->>Supabase: resetPasswordForEmail(email, { redirectTo: '/auth/callback?type=recovery' })
    Supabase->>Email: Send recovery email
    Email->>User: Recovery link
    User->>Callback: Click link (/auth/callback?code=...&type=recovery)
    Callback->>Supabase: Exchange code for session
    Callback->>Callback: Detect type=recovery
    Callback->>ResetPage: Redirect to /reset-password
    User->>ResetPage: Enter new password (min 6 chars)
    ResetPage->>Supabase: supabase.auth.updateUser({ password })
    Supabase->>ResetPage: Password updated
    ResetPage->>Supabase: Sign out
    ResetPage->>LoginPage: Redirect to /login
    LoginPage->>User: Show success message
```

## Legacy Auth (Unused)
The codebase contains a legacy JWT-based auth system (`lib/auth/config.ts` with hardcoded users, `lib/auth/session.ts` with jose JWT tokens). This is NOT used in the active auth flow — Supabase Auth replaced it entirely.

**Legacy files (do not use):**
- `lib/auth/config.ts` - Hardcoded user credentials
- `lib/auth/session.ts` - JWT token creation/validation with jose

## Environment Note
Auth always uses the staging Supabase project (`NEXT_PUBLIC_SUPABASE_STAGE_URL`, `NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY`). Only data queries switch between production and staging via the EnvironmentProvider.

## Security Considerations

### Cookie Security
- Supabase cookies are HttpOnly, Secure, and SameSite=Lax by default
- Managed entirely by @supabase/ssr package
- Automatically refreshed by proxy.ts on each request

### Token Expiration
- Access tokens expire after 1 hour (Supabase default)
- Refresh tokens valid for 30 days
- Automatic refresh handled by Supabase client

### CORS and API Security
- API routes validate authentication via authenticateRequest()
- External API access requires explicit Authorization header
- No CORS configuration needed for same-origin browser requests

### Password Requirements
- Minimum 6 characters (Supabase default)
- Can be configured in Supabase project settings
- Passwords never stored in client code

## Troubleshooting

### "Unauthorized" error on API requests
1. Check that sb-* cookies are present in browser DevTools
2. Verify session is valid: GET /api/auth/session
3. For external APIs: ensure Authorization header is correctly formatted
4. Check proxy.ts logs for validation errors

### OAuth "unauthorized" error
- Email must be in ALLOWED_EMAILS array in `lib/auth/allowlist.ts`
- Check browser console for error parameter in URL

### Password reset not working
1. Verify email is in Supabase auth.users table
2. Check Supabase email templates are configured
3. Ensure redirect URL matches /auth/callback route
