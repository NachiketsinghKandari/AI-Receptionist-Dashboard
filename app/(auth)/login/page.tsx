'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandedLogo } from '@/components/logo';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  unexpected: 'An unexpected error occurred. Please try again.',
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const error = searchParams.get('error');
  const errorMessage = error ? ERROR_MESSAGES[error] || error : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
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

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isLoading}
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
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

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
