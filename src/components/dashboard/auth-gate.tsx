'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useAuth } from '@/hooks/use-auth';
import { useTokenRefresh } from '@/hooks/use-token-refresh';
import { useSubscriptionSync } from '@/hooks/use-subscription-sync';
import DashboardLayout from '@/components/dashboard/dashboard-layout';
import TrialBanner from '@/components/dashboard/trial-banner';
import CreditWarningBanner from '@/components/dashboard/credit-warning-banner';
import {
  SignInPage,
  SignUpPage,
  VerifyEmailPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  MfaVerificationPage,
} from '@/components/dashboard/auth-pages-v2';
import LegalPages from '@/components/dashboard/legal-pages';
import { DevDeliveryNotice, parseDevDelivery } from '@/components/dashboard/dev-delivery-notice';
import type { DevDeliveryPayload } from '@/lib/dev-auth';
import { useLegalStore } from '@/lib/legal-store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import {
  Key,
  ArrowLeft,
  Mail,
  Loader2,
  AlertTriangle,
  Rocket,
  Shield,
  Globe,
  ExternalLink,
  Inbox,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Auth page state type ──────────────────────────────────────
type AuthPage =
  | 'signin'
  | 'signup'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password'
  | 'mfa-verify'
  | 'magic-link'
  | 'otp-login';

// ── Loading screen ────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <svg className="h-8 w-8 text-primary animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading AcquisitionOS...</p>
    </div>
  );
}

// ── Shared AuthLayout (mirrors auth-pages-v2.tsx pattern) ─────
interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  showBack?: boolean;
  onBack?: () => void;
}

// Demo Mode Banner removed — auth is always real.

function AuthLayout({ children, title, description, showBack, onBack }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 pt-10 relative overflow-hidden">
      {/* Demo Mode Banner removed — auth is always real */}
      {/* Animated gradient background */}
      <div className="absolute inset-0 gradient-bg-animated opacity-40" />
      <div className="absolute inset-0 bg-grid opacity-20" />
      {/* Floating decorative orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 rounded-full bg-primary/5 blur-3xl animate-sparkle" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl" style={{ animationDelay: '1s' }} />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="relative">
              <Rocket className="h-8 w-8 text-primary" />
              <div className="absolute -inset-1.5 rounded-full bg-primary/20 animate-pulse-ring" />
            </div>
            <span className="text-2xl font-bold gradient-text">AcquisitionOS</span>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
        >
          {children}
        </motion.div>

        {/* Back link */}
        <AnimatePresence>
          {showBack && onBack && (
            <motion.button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-primary hover:text-primary/80 font-medium transition-colors mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ArrowLeft className="h-3 w-3" /> Back to Sign In
            </motion.button>
          )}
        </AnimatePresence>

        {/* Social proof & trust badges */}
        <motion.div
          className="mt-4 flex items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3 text-emerald-500" />
            <span>256-bit SSL</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="flex -space-x-1">
              {[0,1,2].map(i => (
                <div key={i} className="h-4 w-4 rounded-full bg-primary/20 border border-background flex items-center justify-center text-[6px] font-bold text-primary">
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span>2,400+ users</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Globe className="h-3 w-3 text-primary" />
            <span>SOC 2</span>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => useLegalStore.getState().openLegal('privacy')}
              className="text-primary hover:text-primary/80 underline transition-colors"
            >
              Privacy Policy
            </button>
            <span className="text-muted-foreground/50">&middot;</span>
            <button
              type="button"
              onClick={() => useLegalStore.getState().openLegal('terms')}
              className="text-primary hover:text-primary/80 underline transition-colors"
            >
              Terms of Service
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AcquisitionOS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Email Preview Notice — PERMANENTLY DISABLED ─────────────────
// All Ethereal / preview-inbox code has been removed from the backend.
// Emails are delivered via real Gmail SMTP only. This component is kept
// as a no-op so existing callers compile, but it NEVER renders anything.
function EmailPreviewNotice({
  previewUrl: _previewUrl,
  provider: _provider,
  message: _message,
  fallbackReason: _fallbackReason,
}: {
  previewUrl?: string;
  provider?: string;
  message?: string;
  fallbackReason?: string;
}) {
  // PERMANENTLY returns null — no preview inbox UI anymore.
  return null;
}

// ── OTP Login page ────────────────────────────────────────────
function OtpLoginPage({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | undefined>();
  const [emailProvider, setEmailProvider] = useState<string | undefined>();
  const [deliveryIssue, setDeliveryIssue] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  // DEV-ONLY (sandbox): the OTP surfaced in-place when the server cannot
  // send emails. Never set in production.
  const [devDelivery, setDevDelivery] = useState<DevDeliveryPayload | undefined>();
  const cooldownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [resendCooldown]);

  const handleRequestOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email address');
        return;
      }
      setError('');
      setLoading(true);
      try {
        const res = await fetch('/api/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok) {
          setStep('verify');
          setResendCooldown(60);
          // Surface the Ethereal preview URL so the user can open the email
          // and read the OTP. If no preview URL is returned (real SMTP /
          // Resend), the user must check their actual inbox.
          setEmailPreviewUrl(data.emailPreviewUrl);
          setEmailProvider(data.emailProvider);
          setFallbackReason(data.fallbackReason);
          // DEV-ONLY: capture the in-place delivered code (sandbox mode).
          setDevDelivery(parseDevDelivery(data));
          // Surface delivery failures (e.g. Gmail daily quota exceeded) so the
          // user knows the OTP will NOT arrive and doesn't wait forever.
          setDeliveryIssue(!!data.deliveryIssue);
          setDeliveryMessage(data.deliveryMessage || '');
          if (data.deliveryIssue && !data.devDelivery) {
            toast.error('Email delivery failed — see details below');
          } else if (data.devDelivery) {
            toast.info('Dev mode: email delivery not configured — your login code is shown below.');
          } else if (data.fallbackReason) {
            toast.warning('Gmail limit reached — OTP delivered to preview inbox. Click the preview link below.');
          } else {
            toast.success('If an account exists for this email, you will receive a sign-in code.');
          }
        } else {
          setError(data.error || 'Failed to send OTP');
          toast.error(data.error || 'Failed to send OTP');
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Welcome back!');
        // Auth cookies are set by the API, refresh auth state
        window.location.reload();
      } else {
        setError(data.error || 'Invalid OTP');
        toast.error(data.error || 'Verification failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, otp]);

  return (
    <AuthLayout
      title="Sign in with OTP"
      description={step === 'request' ? 'Enter your email to receive a login code' : `Enter the 6-digit code sent to ${email}`}
      showBack
      onBack={onBackToSignIn}
    >
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive overflow-hidden"
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {step === 'request' ? (
              <motion.form
                key="request"
                onSubmit={handleRequestOtp}
                className="space-y-4"
                noValidate
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-2">
                  <Label htmlFor="otp-email" className="text-xs font-medium">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="otp-email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-9 h-10 border-0 bg-muted/50 focus-visible:bg-background transition-colors"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                      aria-invalid={!!error}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 btn-ripple"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Send Login Code
                    </>
                  )}
                </Button>
              </motion.form>
            ) : (
              <motion.div
                key="verify"
                className="space-y-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {deliveryIssue && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 overflow-hidden"
                    role="alert"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-1">Email delivery failed</p>
                        <p className="text-xs leading-relaxed">{deliveryMessage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
                <DevDeliveryNotice
                  delivery={devDelivery}
                  onFillCode={(code) => setOtp(code)}
                />
                <EmailPreviewNotice
                  previewUrl={emailPreviewUrl}
                  provider={emailProvider}
                  fallbackReason={fallbackReason}
                  message="Click below to open the email preview and read the 6-digit login code, then enter it here."
                />
                <div className="flex flex-col items-center gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Verification Code</Label>
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  type="button"
                  disabled={loading || otp.length !== 6}
                  onClick={handleVerifyOtp}
                  className="w-full h-10 btn-ripple"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Sign In'
                  )}
                </Button>
                {resendCooldown > 0 ? (
                  <p className="text-xs text-center text-muted-foreground">
                    Resend in <span className="font-mono text-primary">{resendCooldown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => { handleRequestOtp({ preventDefault: () => {} } as React.FormEvent); }}
                    className="text-xs text-center text-primary hover:text-primary/80 font-medium transition-colors w-full"
                  >
                    Resend code
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ── Magic Link page ───────────────────────────────────────────
function MagicLinkPage({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | undefined>();
  const [emailProvider, setEmailProvider] = useState<string | undefined>();
  const [deliveryIssue, setDeliveryIssue] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  // DEV-ONLY (sandbox): the sign-in link surfaced in-place when the server
  // cannot send emails. Never set in production.
  const [devDelivery, setDevDelivery] = useState<DevDeliveryPayload | undefined>();

  const handleSendMagicLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email address');
        return;
      }
      setError('');
      setLoading(true);
      try {
        const res = await fetch('/api/auth/magic-link/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          const data = await res.json();
          // The token is NEVER returned in the response — the user must click
          // the link from the actual email. In Ethereal (test) mode we surface
          // a preview URL so they can open the email in a browser.
          setEmailPreviewUrl(data.emailPreviewUrl);
          setEmailProvider(data.emailProvider);
          setDeliveryIssue(!!data.deliveryIssue);
          setDeliveryMessage(data.deliveryMessage || '');
          setFallbackReason(data.fallbackReason);
          // DEV-ONLY: capture the in-place delivered link (sandbox mode).
          setDevDelivery(parseDevDelivery(data));
          setSent(true);
          if (data.deliveryIssue && !data.devDelivery) {
            toast.error('Email delivery failed — see details below');
          } else if (data.devDelivery) {
            toast.info('Dev mode: email delivery not configured — your sign-in link is shown below.');
          } else if (data.fallbackReason) {
            toast.warning('Gmail limit reached — magic link delivered to preview inbox. Click the preview link below.');
          } else {
            toast.success('If an account exists for this email, you will receive a sign-in link.');
          }
        } else {
          const data = await res.json();
          setError(data.error || 'Failed to send magic link');
          toast.error(data.error || 'Failed to send magic link');
        }
      } catch {
        setError('Network error. Please try again.');
        toast.error('Network error');
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  return (
    <AuthLayout
      title="Sign in with Magic Link"
      description="We'll email you a link to sign in"
      showBack
      onBack={onBackToSignIn}
    >
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="sent"
                className="text-center space-y-3 py-4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Check your inbox at{' '}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Click the link in the email to sign in automatically.
                </p>
                {deliveryIssue && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 overflow-hidden text-left"
                    role="alert"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-1">Email delivery failed</p>
                        <p className="text-xs leading-relaxed">{deliveryMessage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
                <DevDeliveryNotice delivery={devDelivery} />
                <EmailPreviewNotice
                  previewUrl={emailPreviewUrl}
                  provider={emailProvider}
                  fallbackReason={fallbackReason}
                  message="Click below to open the email preview in a new tab, then click the sign-in button inside the email."
                />
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSendMagicLink}
                className="space-y-4"
                noValidate
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive overflow-hidden"
                      role="alert"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <Label htmlFor="magic-email" className="text-xs font-medium">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-9 h-10 border-0 bg-muted/50 focus-visible:bg-background transition-colors"
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
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 btn-ripple"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Magic Link
                    </>
                  )}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ══════════════════════════════════════════════════════════════
// Authenticated Wrapper — Syncs subscription + shows banners
// ══════════════════════════════════════════════════════════════
function AuthenticatedWrapper({
  upgradeModalOpen,
  setUpgradeModalOpen,
  creditWarningDismissed,
  setCreditWarningDismissed,
}: {
  upgradeModalOpen: boolean;
  setUpgradeModalOpen: (open: boolean) => void;
  creditWarningDismissed: boolean;
  setCreditWarningDismissed: (dismissed: boolean) => void;
}) {
  // Sync subscription data from backend to Zustand store
  useSubscriptionSync();

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Trial Banner (top of authenticated section) */}
      <TrialBanner onUpgradeClick={() => setUpgradeModalOpen(true)} />

      {/* Credit Warning Banner (below trial banner) */}
      {!creditWarningDismissed && (
        <CreditWarningBanner
          onUpgradeClick={() => setUpgradeModalOpen(true)}
          onDismiss={() => setCreditWarningDismissed(true)}
        />
      )}

      {/* Dashboard Layout fills remaining space */}
      <div className="flex-1 min-h-0">
        <DashboardLayout
          externalUpgradeModalOpen={upgradeModalOpen}
          onExternalUpgradeModalChange={setUpgradeModalOpen}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main AuthGate component
// ══════════════════════════════════════════════════════════════
export default function AuthGate() {
  const { isAuthenticated, isLoading, mfaRequired, setUser, setLoading } = useAuthStore();
  const { signIn } = useAuth();

  // ── Auth page navigation state ───────────────────────────────
  const [authPage, setAuthPage] = useState<AuthPage>('signin');
  const [flowEmail, setFlowEmail] = useState('');
  const [initialized, setInitialized] = useState(false);

  // ── Subscription banner state (authenticated only) ──────────
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [creditWarningDismissed, setCreditWarningDismissed] = useState(false);

  // ── Auto token refresh when authenticated ────────────────────
  useTokenRefresh();

  // ── Initialize: check auth state on mount ────────────────────
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);

      // Check for OAuth error redirect — show simple toast, no custom popup.
      const authError = params.get('auth_error');
      if (authError === 'google_failed') {
        toast.error('Google sign-in failed. Please try again or use email/password.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'no_code') {
        toast.error('Google login was cancelled. Please try again.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'google_invalid_client_secret') {
        toast.error(
          'Google sign-in is unavailable: the Google client secret configured on the server was rejected by Google (it was likely regenerated or revoked). ACTION NEEDED: create a new OAuth client secret in Google Cloud Console and update GOOGLE_CLIENT_SECRET in the server .env, then restart the server. Until then, please use OTP, Magic Link, or email/password login.',
          { duration: 12000 }
        );
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'google_invalid_redirect_uri') {
        toast.error(
          'Google sign-in failed: the redirect URI is not registered in Google Cloud Console. Please contact support to update the authorized redirect URIs.',
          { duration: 9000 }
        );
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'google_invalid_grant') {
        toast.error('Google login session expired. Please try the Google sign-in button again.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'google_misconfigured') {
        toast.error(
          'Google OAuth is misconfigured on the server. Please use email/password or OTP login while we fix this.',
          { duration: 9000 }
        );
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'expired_link') {
        toast.error('Your magic link has expired. Please request a new one.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authError === 'oauth_failed') {
        toast.error('Google OAuth failed. Please try again.');
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Check for payment success/cancel redirect from Stripe
      const paymentStatus = params.get('payment');
      if (paymentStatus === 'success') {
        // Stripe redirected back to the app after the user completed checkout.
        // We do NOT activate the subscription here — the Stripe webhook is the
        // source of truth for payment confirmation. The webhook will update the
        // user's subscription and credits in the database. This toast only
        // acknowledges that the checkout was completed; the actual plan upgrade
        // happens server-side via /api/payments/webhook/stripe.
        toast.info('Payment received. Your plan will be updated shortly.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (paymentStatus === 'cancelled') {
        toast.info('Payment was cancelled.');
        window.history.replaceState({}, '', window.location.pathname);
      }

      // ── Honor ?auth=signin|signup|forgot-password|verify-email ──
      // Lets the dedicated /auth/signin and /auth/signup pages (which
      // redirect to /?auth=signin etc.) start the user on the right
      // auth sub-page rather than always defaulting to "Sign In".
      const authPageParam = params.get('auth');
      if (authPageParam === 'signup') {
        setAuthPage('signup');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authPageParam === 'signin') {
        setAuthPage('signin');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (authPageParam === 'forgot-password') {
        setAuthPage('forgot-password');
        window.history.replaceState({}, '', window.location.pathname);
      }

      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [setUser]);

  // ── Auto-switch to MFA page when mfaRequired becomes true ───
  useEffect(() => {
    if (mfaRequired && authPage !== 'mfa-verify') {
      setAuthPage('mfa-verify');
    }
  }, [mfaRequired, authPage]);

  // ── Navigation handlers ──────────────────────────────────────
  const navigateToSignIn = useCallback(() => {
    setAuthPage('signin');
    setFlowEmail('');
  }, []);

  const navigateToSignUp = useCallback(() => {
    setAuthPage('signup');
  }, []);

  const navigateToForgotPassword = useCallback(() => {
    setAuthPage('forgot-password');
  }, []);

  const navigateToVerifyEmail = useCallback((email: string, devDelivery?: DevDeliveryPayload) => {
    setFlowEmail(email);
    setVerifyDevDelivery(devDelivery);
    setAuthPage('verify-email');
  }, []);

  const [resetEmailPreviewUrl, setResetEmailPreviewUrl] = useState<string | undefined>();
  const [resetEmailProvider, setResetEmailProvider] = useState<string | undefined>();
  // DEV-ONLY (sandbox): reset/verification code surfaced in-place when the
  // server cannot send emails. Never set in production.
  const [verifyDevDelivery, setVerifyDevDelivery] = useState<DevDeliveryPayload | undefined>();
  const [resetDevDelivery, setResetDevDelivery] = useState<DevDeliveryPayload | undefined>();

  const navigateToResetPassword = useCallback(
    (email: string, emailPreviewUrl?: string, emailProvider?: string, devDelivery?: DevDeliveryPayload) => {
      setFlowEmail(email);
      setResetEmailPreviewUrl(emailPreviewUrl);
      setResetEmailProvider(emailProvider);
      setResetDevDelivery(devDelivery);
      setAuthPage('reset-password');
    },
    []
  );

  const navigateToMagicLink = useCallback(() => {
    setAuthPage('magic-link');
  }, []);

  const navigateToOtpLogin = useCallback(() => {
    setAuthPage('otp-login');
  }, []);

  // ── Sign in success handler ──────────────────────────────────
  const handleSignInSuccess = useCallback(() => {
    // The signIn in useAuth already sets the user in the store.
    // If MFA was required, the mfaRequired effect above will switch to the MFA page.
    // If no MFA, the user is set and isAuthenticated becomes true, showing the dashboard.
  }, []);

  // ── Email verified handler: auto-sign-in after verification ──
  const handleEmailVerified = useCallback(async () => {
    if (flowEmail) {
      toast.info('Signing you in...');
      // After email verification, attempt auto sign-in
      // The user needs to have set a password during signup, so we prompt them to sign in
      setAuthPage('signin');
      toast.success('Email verified! Please sign in with your credentials.');
    } else {
      navigateToSignIn();
    }
  }, [flowEmail, navigateToSignIn]);

  // ── Password reset success handler ───────────────────────────
  const handleResetPasswordSuccess = useCallback(() => {
    toast.success('Password reset! Please sign in with your new password.');
    navigateToSignIn();
  }, [navigateToSignIn]);

  // ── MFA verification success handler ─────────────────────────
  const handleMfaSuccess = useCallback(() => {
    // The verifyMfa in useAuth already sets the user in the store
    // isAuthenticated will become true and the dashboard will show
    toast.success('Welcome back!');
  }, []);

  // ── Legal pages dialog (available everywhere) ────────────────
  const legalDialog = <LegalPages />;

  // ── Loading state while checking auth ────────────────────────
  if (!initialized || isLoading) {
    return (
      <>
        {legalDialog}
        <LoadingScreen />
      </>
    );
  }

  // ── Authenticated: show dashboard ────────────────────────────
  if (isAuthenticated && !mfaRequired) {
    return (
      <>
        {legalDialog}
        <AuthenticatedWrapper
          upgradeModalOpen={upgradeModalOpen}
          setUpgradeModalOpen={setUpgradeModalOpen}
          creditWarningDismissed={creditWarningDismissed}
          setCreditWarningDismissed={setCreditWarningDismissed}
        />
      </>
    );
  }

  switch (authPage) {
    case 'signin':
      return (
        <>
          <SignInPage
            onSignUpClick={navigateToSignUp}
            onForgotPasswordClick={navigateToForgotPassword}
            onSuccess={handleSignInSuccess}
            onMagicLinkClick={navigateToMagicLink}
            onOtpLoginClick={navigateToOtpLogin}
            onVerifyEmailClick={navigateToVerifyEmail}
          />
        </>
      );

    case 'signup':
      return (
        <>
          {legalDialog}
          <SignUpPage
            onSignInClick={navigateToSignIn}
            onVerifyEmail={navigateToVerifyEmail}
          />
        </>
      );

    case 'verify-email':
      return (
        <>
          {legalDialog}
          <VerifyEmailPage
            email={flowEmail}
            initialDevDelivery={verifyDevDelivery}
            onVerified={handleEmailVerified}
            onBackToSignIn={navigateToSignIn}
          />
        </>
      );

    case 'forgot-password':
      return (
        <>
          {legalDialog}
          <ForgotPasswordPage
            onBackToSignIn={navigateToSignIn}
            onOtpSent={navigateToResetPassword}
          />
        </>
      );

    case 'reset-password':
      return (
        <>
          {legalDialog}
          <ResetPasswordPage
            email={flowEmail}
            onSuccess={handleResetPasswordSuccess}
            initialEmailPreviewUrl={resetEmailPreviewUrl}
            initialEmailProvider={resetEmailProvider}
            initialDevDelivery={resetDevDelivery}
          />
        </>
      );

    case 'mfa-verify':
      return (
        <>
          {legalDialog}
          <MfaVerificationPage
            onSuccess={handleMfaSuccess}
            onBack={navigateToSignIn}
          />
        </>
      );

    case 'otp-login':
      return (
        <>
          {legalDialog}
          <OtpLoginPage onBackToSignIn={navigateToSignIn} />
        </>
      );

    case 'magic-link':
      return (
        <>
          {legalDialog}
          <MagicLinkPage onBackToSignIn={navigateToSignIn} />
        </>
      );

    default:
      return (
        <>
          {legalDialog}
          <SignInPage
            onSignUpClick={navigateToSignUp}
            onForgotPasswordClick={navigateToForgotPassword}
            onSuccess={handleSignInSuccess}
            onMagicLinkClick={navigateToMagicLink}
            onOtpLoginClick={navigateToOtpLogin}
            onVerifyEmailClick={navigateToVerifyEmail}
          />
        </>
      );
  }
}
