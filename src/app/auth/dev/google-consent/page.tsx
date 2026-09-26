'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * DEV-ONLY simulated Google consent page.
 *
 * Rendered only when the server has no real GOOGLE_CLIENT_ID and dev-mode
 * auth delivery is enabled (sandbox / preview environments). It mimics the
 * Google account chooser so the "Sign in with Google" button can be tested
 * end-to-end: the chosen email is fed into the REAL callback route
 * (/api/auth/callback/google?dev=1), which reuses the exact same
 * user-upsert / session / cookie logic as a genuine Google login.
 *
 * With real Google credentials configured on the server, this page is
 * unreachable (the state route redirects to accounts.google.com instead)
 * and the callback ignores `dev=1` entirely.
 */

function DevConsentInner() {
  const params = useSearchParams();
  const state = params.get('state') || '';
  const [email, setEmail] = useState('demo.google@acquisitionos.local');
  const [name, setName] = useState('Demo Google User');
  const [error, setError] = useState('');

  const handleContinue = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address');
      return;
    }
    if (!state) {
      setError('Missing OAuth state — please go back and click "Sign in with Google" again.');
      return;
    }
    const cb = new URL('/api/auth/callback/google', window.location.origin);
    cb.searchParams.set('dev', '1');
    cb.searchParams.set('code', 'dev-mock-code');
    cb.searchParams.set('state', state);
    cb.searchParams.set('dev_email', trimmedEmail);
    cb.searchParams.set('dev_name', name.trim() || 'Google User');
    window.location.href = cb.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-lg p-8 space-y-5">
        {/* Pseudo-Google header */}
        <div className="text-center space-y-2">
          <p className="text-2xl font-medium">
            <span className="text-blue-600">G</span>
            <span className="text-red-500">o</span>
            <span className="text-yellow-500">o</span>
            <span className="text-blue-600">g</span>
            <span className="text-red-500">g</span>
            <span className="text-green-600">l</span>
            <span className="text-red-500">e</span>
            <span className="text-foreground ml-2">Sign-in</span>
          </p>
          <p className="text-lg text-foreground">Choose an account</p>
          <p className="text-sm text-muted-foreground">to continue to AcquisitionOS</p>
        </div>

        {/* Dev-mode banner */}
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2"
          role="status"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Simulated consent — dev environment only</p>
            <p className="text-xs leading-relaxed mt-0.5">
              Real Google OAuth credentials are not configured on this server, so this
              page stands in for accounts.google.com. The account is created/linked
              locally using the email you enter below.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="dev-google-email" className="text-xs font-medium">
            Google account email
          </Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="dev-google-email"
              type="email"
              className="pl-9 h-10"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              aria-invalid={!!error}
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dev-google-name" className="text-xs font-medium">
            Full name
          </Label>
          <Input
            id="dev-google-name"
            type="text"
            className="h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>

        <Button type="button" className="w-full h-10" onClick={handleContinue}>
          Continue
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          In production with real Google credentials, this step is replaced by the
          genuine Google consent screen.
        </p>
      </div>
    </div>
  );
}

export default function DevGoogleConsentPage() {
  return (
    <Suspense fallback={null}>
      <DevConsentInner />
    </Suspense>
  );
}
