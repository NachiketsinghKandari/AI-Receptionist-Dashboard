'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandedLogo } from '@/components/logo';
import { createAuthBrowserClient } from '@/lib/supabase/auth-client';


const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  unauthorized: 'You are not authorized to access this dashboard. Contact your administrator.',
  no_code: 'Authentication failed. Please try again.',
  exchange_failed: 'Authentication failed. Please try again.',
  no_email: 'Could not retrieve email from Google. Please try again.',
  unexpected: 'An unexpected error occurred. Please try again.',
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const error = searchParams.get('error');
  const errorMessage = error ? ERROR_MESSAGES[error] || error : null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createAuthBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Email sign-in error:', error);
        router.push('/login?error=invalid_credentials');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Unexpected error:', err);
      router.push('/login?error=unexpected');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const supabase = createAuthBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error('Google sign-in error:', error);
        router.push('/login?error=unexpected');
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      router.push('/login?error=unexpected');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isAnyLoading = isLoading || isGoogleLoading;

  return (
    <Card className="w-full max-w-md mx-4 relative z-10">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center">
          <BrandedLogo className="h-8 w-auto text-foreground text-xl font-bold" />
        </CardTitle>
        <CardDescription>Sign in to access the dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded-md">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isAnyLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isAnyLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isAnyLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-12 text-base" disabled={isAnyLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>

          <div className="text-center">
            <a
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot your password?
            </a>
          </div>
        </form>

        {/* Google OAuth - hidden for now, enable when configured */}
        <div className="hidden">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            onClick={handleGoogleSignIn}
            disabled={isAnyLoading}
            variant="outline"
            className="w-full h-12 text-base"
          >
            {isGoogleLoading ? (
              'Signing in...'
            ) : (
              <>
                <GoogleIcon className="h-5 w-5 mr-3" />
                Sign in with Google
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Only authorized team members can access this dashboard.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <Suspense fallback={
        <Card className="w-full max-w-md mx-4 relative z-10">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center">
              <BrandedLogo className="h-8 w-auto text-foreground text-xl font-bold" />
            </CardTitle>
            <CardDescription>Sign in to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full h-12 text-base" disabled>
              Loading...
            </Button>
          </CardContent>
        </Card>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}
