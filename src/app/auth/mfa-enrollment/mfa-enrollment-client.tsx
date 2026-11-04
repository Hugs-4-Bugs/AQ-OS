'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — MFA Enrollment Client Component
//
// Guides the admin through mandatory TOTP 2FA enrollment:
// 1. Enter current password (security verification)
// 2. Scan QR code with authenticator app
// 3. Enter 6-digit TOTP code to verify
// 4. Save recovery codes
// 5. Redirect to /admin (now 2FA-enrolled)
//
// Uses existing /api/auth/mfa/setup and /api/auth/mfa/confirm routes.
// ═══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, Smartphone, Key, CheckCircle2, AlertCircle, Copy, ArrowRight } from 'lucide-react';

interface MfaEnrollmentClientProps {
  adminEmail: string;
  adminName: string;
}

type Step = 'password' | 'qr' | 'verify' | 'recovery' | 'done';

export default function MfaEnrollmentClient({ adminEmail, adminName }: MfaEnrollmentClientProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 1: Submit password to /api/auth/mfa/setup → get QR + secret
  const handleSetup = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start MFA setup');
        setLoading(false);
        return;
      }
      setQrUrl(data.qrUrl || data.totpUri || '');
      setSecret(data.secret || '');
      setStep('qr');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  };

  // Step 2: Verify TOTP code via /api/auth/mfa/confirm
  const handleVerify = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid code. Please try again.');
        setLoading(false);
        return;
      }
      if (data.backupCodes || data.recoveryCodes) {
        setRecoveryCodes(data.backupCodes || data.recoveryCodes || []);
      }
      setStep('recovery');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  };

  // Step 3: Acknowledge recovery codes saved → done
  const handleComplete = () => {
    setStep('done');
    setTimeout(() => router.push('/admin'), 2000);
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Secure Your Admin Account</h1>
          <p className="text-sm text-muted-foreground">
            Two-Factor Authentication is required for all admin accounts.
            Complete setup to access the Admin Console.
          </p>
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{adminName}</span> ({adminEmail})
          </p>
          <a href="/auth/create-password" className="text-xs text-primary hover:underline">
            Don't have a password? Create one →
          </a>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 text-xs">
          {(['password', 'qr', 'verify', 'recovery'] as Step[]).map((s, i) => {
            const stepOrder = ['password', 'qr', 'verify', 'recovery'];
            const currentIdx = stepOrder.indexOf(step);
            const isActive = i <= currentIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                {i < 3 && <div className={`h-px w-8 ${isActive ? 'bg-primary' : 'bg-muted'}`} />}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Password */}
        {step === 'password' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4 text-muted-foreground" /> Verify Your Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your current password to begin 2FA setup. This prevents unauthorized enrollment.
              </p>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Current password"
                onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
                aria-label="Current password"
              />
              <Button onClick={handleSetup} disabled={!password || loading} className="w-full">
                {loading ? 'Verifying...' : 'Continue'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: QR Code */}
        {step === 'qr' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4 text-muted-foreground" /> Scan QR Code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with Google Authenticator, Authy, or any TOTP app.
              </p>
              {qrUrl && (
                <div className="flex justify-center">
                  <img src={qrUrl} alt="TOTP QR Code" className="rounded-lg border" width={200} height={200} />
                </div>
              )}
              {secret && (
                <div className="rounded-md bg-muted p-2 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Or enter manually:</p>
                  <code className="text-xs font-mono break-all">{secret}</code>
                </div>
              )}
              <Button onClick={() => setStep('verify')} className="w-full">
                I've Scanned the Code <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Verify TOTP */}
        {step === 'verify' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Enter Verification Code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                onKeyDown={(e) => e.key === 'Enter' && totpCode.length === 6 && handleVerify()}
                aria-label="6-digit TOTP code"
              />
              <Button onClick={handleVerify} disabled={totpCode.length !== 6 || loading} className="w-full">
                {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Recovery Codes */}
        {step === 'recovery' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4 text-muted-foreground" /> Save Recovery Codes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                Store these codes safely. You'll need them to access your account if you lose your authenticator device.
              </div>
              {recoveryCodes.length > 0 && (
                <div className="rounded-md bg-muted p-3 space-y-1">
                  {recoveryCodes.map((code, i) => (
                    <div key={i} className="font-mono text-xs">{code}</div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={copyCodes} className="flex-1">
                  <Copy className="h-4 w-4 mr-2" /> {copied ? 'Copied!' : 'Copy Codes'}
                </Button>
                <Button onClick={handleComplete} className="flex-1">
                  I've Saved Them <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done */}
        {step === 'done' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div>
                <h2 className="text-lg font-semibold">2FA Enabled Successfully</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Your admin account is now protected with Two-Factor Authentication.
                  Redirecting to Admin Console...
                </p>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                <Shield className="h-3 w-3 mr-1" /> Secured
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
