'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Rocket,
  ArrowLeft,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  Shield,
  Smartphone,
  Monitor,
  Globe,
  Copy,
  Download,
  AlertTriangle,
  QrCode,
  Key,
  Trash2,
} from 'lucide-react';
import { useLegalStore } from '@/lib/legal-store';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// SHARED UTILITIES
// ============================================================

/** Password strength calculator */
function getPasswordStrength(password: string): {
  score: number; // 0–4
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  // Normalize to 0–4
  score = Math.min(4, score);

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = [
    '',
    'oklch(0.6 0.25 15)',   // red
    'oklch(0.75 0.18 55)',  // amber
    'oklch(0.85 0.18 90)',  // yellow-green
    'oklch(0.72 0.19 155)', // green
  ];

  return { score, label: labels[score], color: colors[score] };
}

/** Email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// EMAIL PREVIEW NOTICE — PERMANENTLY DISABLED
// ============================================================
//
// All Ethereal / preview-inbox code has been removed from the backend.
// Emails are delivered via real Gmail SMTP only. This component is kept
// as a no-op so existing callers compile, but it NEVER renders anything.
// After sending an email, the user simply sees "Check your inbox at [email]".

function EmailPreviewNotice({
  previewUrl: _previewUrl,
  provider: _provider,
  message: _message,
}: {
  previewUrl?: string;
  provider?: string;
  message?: string;
}) {
  // PERMANENTLY returns null — no preview inbox UI anymore.
  return null;
}

// ============================================================
// AUTH LAYOUT WRAPPER
// ============================================================

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
            <span className="text-muted-foreground/50">·</span>
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

// ============================================================
// PASSWORD STRENGTH INDICATOR
// ============================================================

function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  if (!password) return null;

  const percent = (strength.score / 4) * 100;

  return (
    <div className="space-y-1.5">
      <Progress
        value={percent}
        className="h-1.5"
        style={
          {
            '--progress-color': strength.color,
          } as React.CSSProperties
        }
      />
      <p className="text-xs" style={{ color: strength.color }}>
        {strength.label}
      </p>
    </div>
  );
}

// ============================================================
// LOADING SPINNER BUTTON HELPER
// ============================================================

function LoadingButton({
  children,
  loading,
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button className={className} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

// ============================================================
// FIELD ERROR
// ============================================================

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive mt-1 slide-in-up" role="alert">
      {message}
    </p>
  );
}

// ============================================================
// 1. SIGN IN PAGE
// ============================================================

export function SignInPage({
  onSignUpClick,
  onForgotPasswordClick,
  onSuccess,
  onMagicLinkClick,
  onOtpLoginClick,
  onVerifyEmailClick,
}: {
  onSignUpClick?: () => void;
  onForgotPasswordClick?: () => void;
  onSuccess?: () => void;
  onMagicLinkClick?: () => void;
  onOtpLoginClick?: () => void;
  /** Called when sign-in is blocked because the email is not verified yet. */
  onVerifyEmailClick?: (email: string) => void;
}) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  // Local submitting state for the button spinner. We intentionally do NOT
  // use the global `isLoading` — AuthGate renders its full-screen
  // LoadingScreen while that flag is set, which would UNMOUNT this page and
  // discard the inline error alert + filled fields.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Google Sign-in is PERMANENTLY available — no env-based gating.
  const googleAvailable = true;

  // Server-driven Google OAuth: client_id never touches frontend
  const startGoogleOAuth = useCallback(async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`/api/auth/google/state?origin=${encodeURIComponent(origin)}`);
      if (!res.ok) throw new Error('Failed to get OAuth state');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Google OAuth error:', err);
      toast.error('Google sign-in could not start. Please try again.');
    }
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!email) errs.email = 'Email is required';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    return errs;
  }, [email, password]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralError('');
      const validationErrors = validate();
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      setIsSubmitting(true);
      const result = await signIn(email, password);
      setIsSubmitting(false);
      if (result.success) {
        toast.success('Welcome back!');
        onSuccess?.();
      } else if (result.mfaRequired) {
        toast.info('MFA verification required');
        // Caller should handle MFA redirect via mfaRequired state
        onSuccess?.();
      } else {
        // USER REQUEST (2026-09-09): actionable alerts for registered emails
        const r = result as {
          error?: string;
          emailNotVerified?: boolean;
          email?: string;
          noPasswordSet?: boolean;
        };
        setGeneralError(result.error || 'Sign in failed');
        toast.error(result.error || 'Sign in failed');
        if (r.emailNotVerified && typeof r.email === 'string' && r.email) {
          // A fresh verification code was auto-sent by the API — take the
          // user straight to the verification page to enter it.
          setTimeout(() => onVerifyEmailClick?.(r.email as string), 600);
        }
        // For noPasswordSet, the Google / Magic Link / OTP buttons below the
        // form are the suggested methods — the alert text points to them.
      }
    },
    [email, password, validate, signIn, onSuccess, onVerifyEmailClick]
  );

  return (
    <AuthLayout title="Welcome Back" description="Sign in to your AcquisitionOS account">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <AnimatePresence mode="wait">
            {generalError && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive overflow-hidden"
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {generalError}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="signin-email" className="text-xs font-medium">
                Email
              </Label>
              <div className={cn('relative transition-all duration-200 rounded-md', errors.email ? 'ring-1 ring-destructive/50' : email && isValidEmail(email) ? 'ring-1 ring-emerald-500/30' : '')}>
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  className={cn('pl-9 h-10 border-0 bg-muted/50 focus-visible:bg-background transition-colors', errors.email && 'bg-destructive/5')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'signin-email-error' : undefined}
                  autoComplete="email"
                />
                {email && isValidEmail(email) && !errors.email && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
              </div>
              <FieldError message={errors.email} />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="signin-password" className="text-xs font-medium">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={onForgotPasswordClick}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className={cn('relative transition-all duration-200 rounded-md', errors.password ? 'ring-1 ring-destructive/50' : '')}>
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signin-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  className={cn('pl-9 pr-9 h-10 border-0 bg-muted/50 focus-visible:bg-background transition-colors', errors.password && 'bg-destructive/5')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'signin-password-error' : undefined}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <FieldError message={errors.password} />
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <Checkbox id="signin-remember" className="mt-0.5" />
              <Label htmlFor="signin-remember" className="text-xs text-muted-foreground cursor-pointer">
                Remember me for 30 days
              </Label>
            </div>

            <LoadingButton type="submit" className="w-full h-10 btn-ripple" loading={isSubmitting}>
              Sign In
            </LoadingButton>
          </form>

          <div className="relative my-4">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
              or continue with
            </span>
          </div>

          {/* Google SSO — always available, server-driven OAuth */}
          {googleAvailable && (
            <div className="relative rounded-lg p-[1.5px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
              <Button
                variant="outline"
                className="w-full h-10 rounded-[6.5px] bg-background hover:bg-background/90 border-0"
                type="button"
                onClick={startGoogleOAuth}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>
            </div>
          )}

          {/* Magic Link & OTP login options */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              className="flex-1 h-9 text-xs hover:bg-muted/60 transition-colors"
              type="button"
              onClick={onMagicLinkClick}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Sign in with Magic Link
            </Button>
            <Button
              variant="ghost"
              className="flex-1 h-9 text-xs hover:bg-muted/60 transition-colors"
              type="button"
              onClick={onOtpLoginClick}
            >
              <Key className="mr-1.5 h-3.5 w-3.5" />
              Sign in with OTP
            </Button>
          </div>

          {/* Sign up link */}
          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={onSignUpClick}
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Sign up
            </button>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 2. SIGN UP PAGE
// ============================================================

export function SignUpPage({
  onSignInClick,
  onVerifyEmail,
}: {
  onSignInClick?: () => void;
  onVerifyEmail?: (email: string) => void;
}) {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  // Set when the server reports the email is already registered (any method)
  const [emailRegistered, setEmailRegistered] = useState(false);
  // Local submitting state for the form's submit button. We intentionally do
  // NOT use the global `isLoading` from useAuth here, because AuthGate uses
  // that flag to render the full-screen LoadingScreen — which would unmount
  // this component and discard `showSuccess`.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Google Sign-in is PERMANENTLY available — no env-based gating.
  const googleAvailable = true;

  // Server-driven Google OAuth: client_id never touches frontend
  const startGoogleOAuth = useCallback(async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`/api/auth/google/state?origin=${encodeURIComponent(origin)}`);
      if (!res.ok) throw new Error('Failed to get OAuth state');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Google OAuth error:', err);
      toast.error('Google sign-in could not start. Please try again.');
    }
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email) errs.email = 'Email is required';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (!termsAccepted) errs.terms = 'You must accept the terms';
    return errs;
  }, [name, email, password, confirmPassword, termsAccepted]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralError('');
      setEmailRegistered(false);
      const validationErrors = validate();
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      setIsSubmitting(true);
      const result = await signUp({ name: name.trim(), email, password });
      setIsSubmitting(false);
      if (result.success) {
        // Check if the response requires email verification
        const signUpData = result as {
          success: boolean;
          requiresVerification?: boolean;
          email?: string;
          error?: string;
        };
        if (signUpData.requiresVerification) {
          // Email delivered via real Gmail SMTP — user checks their inbox.
          // No preview URL is returned anymore.
          setShowSuccess(true);
          toast.success('Account created! Check your email for a verification code.');
        } else {
          // Account created without verification (shouldn't happen with AUTH_DEV_MODE=false)
          toast.success('Welcome to AcquisitionOS! Your account is ready.');
        }
      } else {
        // USER REQUEST (2026-09-09): If the email is already registered (via
        // any method), show a clear alert with a one-click path to login.
        const r = result as { error?: string; emailRegistered?: boolean };
        if (r.emailRegistered) {
          setEmailRegistered(true);
        }
        setGeneralError(result.error || 'Sign up failed');
        toast.error(result.error || 'Sign up failed');
      }
    },
    [name, email, password, validate, signUp]
  );

  // Success state: "Verify your email"
  if (showSuccess) {
    return (
      <AuthLayout title="Check Your Email" description="We've sent a verification code">
        <Card className="glass-card">
          <CardContent className="pt-6 space-y-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a verification code to{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
            <LoadingButton
              className="w-full h-10"
              onClick={() => onVerifyEmail?.(email)}
            >
              Verify Email
            </LoadingButton>
            <p className="text-xs text-muted-foreground">
              Didn&apos;t receive it? Check your spam folder or{' '}
              <button
                type="button"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
                onClick={() => setShowSuccess(false)}
              >
                try again
              </button>
            </p>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" description="Start your free trial of AcquisitionOS">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          {generalError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive slide-in-up" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{generalError}</p>
                  {emailRegistered && (
                    <LoadingButton
                      type="button"
                      size="sm"
                      className="mt-2 h-8"
                      onClick={() => {
                        setEmailRegistered(false);
                        setGeneralError('');
                        onSignInClick?.();
                      }}
                    >
                      Go to Login
                    </LoadingButton>
                  )}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="signup-name" className="text-xs font-medium">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  className="pl-9 h-10"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  aria-invalid={!!errors.name}
                  autoComplete="name"
                />
              </div>
              <FieldError message={errors.name} />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="signup-email" className="text-xs font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-9 h-10"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  aria-invalid={!!errors.email}
                  autoComplete="email"
                />
              </div>
              <FieldError message={errors.email} />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="signup-password" className="text-xs font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  className="pl-9 pr-9 h-10"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  aria-invalid={!!errors.password}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={password} />
              <FieldError message={errors.password} />
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="signup-confirm" className="text-xs font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  className="pl-9 h-10"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  aria-invalid={!!errors.confirmPassword}
                  autoComplete="new-password"
                />
              </div>
              <FieldError message={errors.confirmPassword} />
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="signup-terms"
                checked={termsAccepted}
                onCheckedChange={(checked) => {
                  setTermsAccepted(checked === true);
                  if (errors.terms) setErrors((prev) => ({ ...prev, terms: '' }));
                }}
                className="mt-0.5"
              />
              <Label htmlFor="signup-terms" className="text-xs text-muted-foreground leading-relaxed">
                I agree to the{' '}
                <button type="button" onClick={() => useLegalStore.getState().openLegal('terms')} className="text-primary hover:text-primary/80 underline">
                  Terms of Service
                </button>{' '}
                and{' '}
                <button type="button" onClick={() => useLegalStore.getState().openLegal('privacy')} className="text-primary hover:text-primary/80 underline">
                  Privacy Policy
                </button>
              </Label>
            </div>
            <FieldError message={errors.terms} />

            <LoadingButton type="submit" className="w-full h-10" loading={isSubmitting}>
              Create Account
            </LoadingButton>
          </form>

          <Separator />

          {/* Google SSO — always available, server-driven OAuth */}
          {googleAvailable && (
            <div className="relative rounded-lg p-[1.5px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
              <Button
                variant="outline"
                className="w-full h-10 rounded-[6.5px] bg-background hover:bg-background/90 border-0"
                type="button"
                onClick={startGoogleOAuth}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSignInClick}
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 3. VERIFY EMAIL PAGE
// ============================================================

export function VerifyEmailPage({
  email,
  onVerified,
  onBackToSignIn,
}: {
  email: string;
  onVerified?: () => void;
  onBackToSignIn?: () => void;
}) {
  const { verifyEmail, signIn } = useAuth();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Email preview metadata — populated when the user clicks "Resend" and the
  // server delivers via Ethereal (test SMTP). The verification OTP is NEVER
  // returned in the response — the user reads it from the preview inbox.
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | undefined>();
  const [emailProvider, setEmailProvider] = useState<string | undefined>();
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

  const handleVerify = useCallback(async () => {
    if (otp.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }
    setError('');
    setLoading(true);
    const result = await verifyEmail(email, otp);
    setLoading(false);
    if (result.success) {
      toast.success('Email verified!');
      onVerified?.();
    } else {
      setError(result.error || 'Verification failed');
      toast.error(result.error || 'Verification failed');
    }
  }, [otp, email, verifyEmail, onVerified]);

  const handleResend = useCallback(async () => {
    setResendCooldown(60);
    // Call forgot-password-like endpoint to resend
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        // Capture the Ethereal preview URL (if any) so the user can open the
        // email in a browser. The OTP is NEVER returned — must be read from
        // the actual email.
        setEmailPreviewUrl(data.emailPreviewUrl);
        setEmailProvider(data.emailProvider);
        toast.success('Verification code resent!');
      } else {
        toast.error('Failed to resend code');
        setResendCooldown(0);
      }
    } catch {
      toast.error('Network error');
      setResendCooldown(0);
    }
  }, [email]);

  return (
    <AuthLayout
      title="Verify Your Email"
      description={`Enter the 6-digit code sent to ${email}`}
      showBack
      onBack={onBackToSignIn}
    >
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive slide-in-up" role="alert">
              {error}
            </div>
          )}

          <EmailPreviewNotice
            previewUrl={emailPreviewUrl}
            provider={emailProvider}
            message="Click below to open the email preview and read the 6-digit verification code, then enter it here. If you haven't received the email yet, click Resend below."
          />

          {/* OTP Input */}
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

          <LoadingButton
            className="w-full h-10"
            loading={loading}
            onClick={handleVerify}
            disabled={otp.length !== 6}
          >
            Verify Email
          </LoadingButton>

          {/* Resend */}
          <div className="text-center">
            {resendCooldown > 0 ? (
              <p className="text-xs text-muted-foreground">
                Resend code in{' '}
                <span className="font-mono text-primary">{resendCooldown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Resend verification code
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 4. FORGOT PASSWORD PAGE
// ============================================================

export function ForgotPasswordPage({
  onBackToSignIn,
  onOtpSent,
}: {
  onBackToSignIn?: () => void;
  onOtpSent?: (email: string, emailPreviewUrl?: string, emailProvider?: string) => void;
}) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // Real email metadata — surfaced to the UI so the user can open the
  // Ethereal preview inbox and read the reset code. The OTP is NEVER
  // returned in the response.
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | undefined>();
  const [emailProvider, setEmailProvider] = useState<string | undefined>();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !isValidEmail(email)) {
        setError('Enter a valid email address');
        return;
      }
      setError('');
      setLoading(true);
      const result = await forgotPassword(email);
      setLoading(false);
      if (result.success) {
        setEmailSent(true);
        const r = result as {
          success: boolean;
          message?: string;
          emailPreviewUrl?: string;
          emailProvider?: string;
        };
        setEmailPreviewUrl(r.emailPreviewUrl);
        setEmailProvider(r.emailProvider);
        toast.success('If an account exists for this email, you will receive a reset code.');
        // Auto-navigate after a moment — pass the preview URL through to the
        // reset password page so the user can immediately open the email.
        setTimeout(() => onOtpSent?.(email, r.emailPreviewUrl, r.emailProvider), 1500);
      } else {
        setError(result.error || 'Request failed');
        toast.error(result.error || 'Request failed');
      }
    },
    [email, forgotPassword, onOtpSent]
  );

  return (
    <AuthLayout
      title="Reset Password"
      description="Enter your email to receive a reset code"
      showBack
      onBack={onBackToSignIn}
    >
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          {emailSent ? (
            <div className="text-center space-y-3 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                We&apos;ve sent a verification code to{' '}
                <span className="font-medium text-foreground">{email}</span>
              </p>
              <EmailPreviewNotice
                previewUrl={emailPreviewUrl}
                provider={emailProvider}
                message="Redirecting to the reset page... You can also open the email preview now to grab your reset code."
              />
              <p className="text-xs text-muted-foreground">Redirecting to reset page...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive slide-in-up" role="alert">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-xs font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
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
                <FieldError message={error} />
              </div>

              <LoadingButton type="submit" className="w-full h-10" loading={loading}>
                Send Reset Code
              </LoadingButton>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 5. RESET PASSWORD PAGE
// ============================================================

export function ResetPasswordPage({
  email,
  onSuccess,
  initialOtp,
  initialEmailPreviewUrl,
  initialEmailProvider,
}: {
  email: string;
  onSuccess?: () => void;
  initialOtp?: string;
  initialEmailPreviewUrl?: string;
  initialEmailProvider?: string;
}) {
  const { resetPassword } = useAuth();
  const [otp, setOtp] = useState(initialOtp || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Email preview metadata — initialized from props (passed through from
  // ForgotPasswordPage), updated whenever the user resends the code.
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | undefined>(initialEmailPreviewUrl);
  const [emailProvider, setEmailProvider] = useState<string | undefined>(initialEmailProvider);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (otp.length !== 6) errs.otp = 'Enter the 6-digit code';
    if (!newPassword) errs.newPassword = 'New password is required';
    else if (newPassword.length < 8) errs.newPassword = 'Password must be at least 8 characters';
    if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  }, [otp, newPassword, confirmPassword]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validate();
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      setLoading(true);
      const result = await resetPassword({
        email,
        otp,
        newPassword,
      });
      setLoading(false);
      if (result.success) {
        toast.success('Password reset successfully!');
        onSuccess?.();
      } else {
        toast.error(result.error || 'Reset failed');
        setErrors({ otp: result.error || 'Reset failed' });
      }
    },
    [email, otp, newPassword, validate, resetPassword, onSuccess]
  );

  const handleResend = useCallback(async () => {
    setResendCooldown(60);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        // Capture the Ethereal preview URL (if any) so the user can open the
        // email in a browser and read the new reset code.
        setEmailPreviewUrl(data.emailPreviewUrl);
        setEmailProvider(data.emailProvider);
        toast.success('Code resent!');
      } else {
        toast.error('Failed to resend');
        setResendCooldown(0);
      }
    } catch {
      toast.error('Failed to resend');
      setResendCooldown(0);
    }
  }, [email]);

  return (
    <AuthLayout title="Reset Password" description="Enter the code and set a new password">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <EmailPreviewNotice
            previewUrl={emailPreviewUrl}
            provider={emailProvider}
            message="Click below to open the email preview and read the 6-digit reset code, then enter it here along with your new password."
          />
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* OTP */}
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
              <FieldError message={errors.otp} />
              {/* Resend */}
              {resendCooldown > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Resend in <span className="font-mono text-primary">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Resend code
                </button>
              )}
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="reset-new-password" className="text-xs font-medium">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  className="pl-9 pr-9 h-10"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: '' }));
                  }}
                  aria-invalid={!!errors.newPassword}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={newPassword} />
              <FieldError message={errors.newPassword} />
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password" className="text-xs font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  className="pl-9 h-10"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  aria-invalid={!!errors.confirmPassword}
                  autoComplete="new-password"
                />
              </div>
              <FieldError message={errors.confirmPassword} />
            </div>

            <LoadingButton type="submit" className="w-full h-10" loading={loading}>
              Reset Password
            </LoadingButton>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 6. MFA VERIFICATION PAGE
// ============================================================

export function MfaVerificationPage({
  onSuccess,
  onBack,
}: {
  onSuccess?: () => void;
  onBack?: () => void;
}) {
  const { verifyMfa, mfaSessionToken } = useAuth();
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback(async () => {
    const verifyValue = useBackupCode ? backupCode.trim() : code;
    if (!verifyValue || (useBackupCode && verifyValue.length < 8)) {
      setError(useBackupCode ? 'Enter your backup code' : 'Enter all 6 digits');
      return;
    }
    setError('');
    setLoading(true);
    const result = await verifyMfa(verifyValue);
    setLoading(false);
    if (result.success) {
      toast.success('Verification successful!');
      onSuccess?.();
    } else {
      setError(result.error || 'Verification failed');
      toast.error(result.error || 'Verification failed');
    }
  }, [code, backupCode, useBackupCode, verifyMfa, onSuccess]);

  return (
    <AuthLayout
      title="Two-Factor Authentication"
      description="Enter the code from your authenticator app"
      showBack
      onBack={onBack}
    >
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive slide-in-up" role="alert">
              {error}
            </div>
          )}

          {/* Shield icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>

          {!useBackupCode ? (
            /* TOTP Code Input */
            <div className="flex flex-col items-center gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Authentication Code
              </Label>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
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
          ) : (
            /* Backup Code Input */
            <div className="space-y-2">
              <Label htmlFor="mfa-backup-code" className="text-xs font-medium">
                Backup Code
              </Label>
              <Input
                id="mfa-backup-code"
                type="text"
                placeholder="Enter your backup code"
                className="h-10 text-center font-mono tracking-wider"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                autoComplete="off"
              />
            </div>
          )}

          <LoadingButton
            className="w-full h-10"
            loading={loading}
            onClick={handleVerify}
            disabled={!useBackupCode ? code.length !== 6 : backupCode.trim().length < 8}
          >
            Verify
          </LoadingButton>

          {/* Toggle backup code */}
          <div className="flex items-center justify-center gap-2">
            <Switch
              id="use-backup-code"
              checked={useBackupCode}
              onCheckedChange={setUseBackupCode}
            />
            <Label htmlFor="use-backup-code" className="text-xs text-muted-foreground cursor-pointer">
              Use a backup code instead
            </Label>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// ============================================================
// 7. MFA SETUP PAGE (Settings)
// ============================================================

export function MfaSetupPage({ onDisable }: { onDisable?: () => void }) {
  const { user, updateMfaEnabled } = useAuth();
  const [step, setStep] = useState<'password' | 'qr' | 'verify' | 'backup'>(
    user?.mfaEnabled ? 'backup' : 'password'
  );
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState('');
  const [otpUri, setOtpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Step 1: Verify password to start MFA setup
  const handlePasswordVerify = useCallback(async () => {
    if (!password) {
      setError('Enter your password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSecret(data.secret);
        setOtpUri(data.otpUri);
        setBackupCodes(data.backupCodes || []);
        setStep('qr');
      } else {
        setError(data.error || 'Password verification failed');
        toast.error(data.error || 'Password verification failed');
      }
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error');
    }
    setLoading(false);
  }, [password]);

  // Step 3: Verify TOTP code to complete setup
  const handleTotpVerify = useCallback(async () => {
    if (totpCode.length !== 6) {
      setError('Enter all 6 digits');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: totpCode, secret }),
      });
      const data = await res.json();
      if (res.ok) {
        updateMfaEnabled(true);
        toast.success('MFA enabled successfully!');
        setStep('backup');
      } else {
        setError(data.error || 'Verification failed');
        toast.error(data.error || 'Verification failed');
      }
    } catch {
      setError('Network error');
      toast.error('Network error');
    }
    setLoading(false);
  }, [totpCode, secret, updateMfaEnabled]);

  // Disable MFA
  const handleDisableMfa = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        updateMfaEnabled(false);
        toast.success('MFA disabled');
        setStep('password');
        setPassword('');
        setSecret('');
        setOtpUri('');
        setBackupCodes([]);
        onDisable?.();
      } else {
        toast.error('Failed to disable MFA');
      }
    } catch {
      toast.error('Network error');
    }
    setLoading(false);
  }, [updateMfaEnabled, onDisable]);

  // Copy backup codes
  const handleCopyCodes = useCallback(() => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Backup codes copied!');
  }, [backupCodes]);

  // Download backup codes
  const handleDownloadCodes = useCallback(() => {
    const content = `AcquisitionOS MFA Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join('\n')}\n\nKeep these codes safe. Each can only be used once.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'acquisitionos-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded!');
  }, [backupCodes]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold gradient-text">Two-Factor Authentication</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add an extra layer of security to your account
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive slide-in-up" role="alert">
          {error}
        </div>
      )}

      {/* Step indicator */}
      {!user?.mfaEnabled && (
        <div className="flex items-center gap-2">
          {['password', 'qr', 'verify'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : ['password', 'qr', 'verify'].indexOf(step) > i
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {['password', 'qr', 'verify'].indexOf(step) > i ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <div
                  className={cn(
                    'h-0.5 w-8 transition-colors',
                    ['password', 'qr', 'verify'].indexOf(step) > i
                      ? 'bg-primary'
                      : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* STEP 1: Password Verification */}
      {step === 'password' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Verify Your Identity</CardTitle>
            <CardDescription className="text-xs">
              Enter your password to begin setting up two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-setup-password" className="text-xs font-medium">
                Current Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="mfa-setup-password"
                  type="password"
                  placeholder="Enter your password"
                  className="pl-9 h-10"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <LoadingButton
              className="w-full h-10"
              loading={loading}
              onClick={handlePasswordVerify}
            >
              Continue
            </LoadingButton>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: QR Code + Secret */}
      {step === 'qr' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Scan QR Code</CardTitle>
            <CardDescription className="text-xs">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code placeholder */}
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-background rounded-xl border border-border flex items-center justify-center">
                {otpUri ? (
                  <QrCode className="h-32 w-32 text-foreground" />
                ) : (
                  <div className="text-center text-xs text-muted-foreground">
                    QR Code
                  </div>
                )}
              </div>
            </div>

            {/* Secret key */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Secret Key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted/50 rounded-md px-3 py-2 text-xs font-mono break-all">
                  {secret || 'JBSWY3DPEHPK3PXP'}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(secret);
                    toast.success('Secret copied!');
                  }}
                  aria-label="Copy secret key"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <Button className="w-full h-10" onClick={() => setStep('verify')}>
              I&apos;ve Scanned the Code
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Verify TOTP */}
      {step === 'verify' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Verify Setup</CardTitle>
            <CardDescription className="text-xs">
              Enter the 6-digit code from your authenticator app to complete setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode}>
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
            <LoadingButton
              className="w-full h-10"
              loading={loading}
              onClick={handleTotpVerify}
              disabled={totpCode.length !== 6}
            >
              Verify & Enable MFA
            </LoadingButton>
          </CardContent>
        </Card>
      )}

      {/* BACKUP CODES */}
      {step === 'backup' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Backup Codes
            </CardTitle>
            <CardDescription className="text-xs">
              Save these backup codes in a safe place. Each code can only be used once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-4 font-mono text-sm">
              {(backupCodes.length > 0
                ? backupCodes
                : ['A1B2-C3D4', 'E5F6-G7H8', 'I9J0-K1L2', 'M3N4-O5P6', 'Q7R8-S9T0', 'U1V2-W3X4', 'Y5Z6-A7B8', 'C9D0-E1F2']
              ).map((code, i) => (
                <div key={i} className="text-center py-1 px-2 rounded bg-background/50">
                  {code}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-9"
                onClick={handleCopyCodes}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-9"
                onClick={handleDownloadCodes}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </div>

            {/* Disable MFA */}
            <Separator />
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Danger Zone</p>
                  <p className="text-xs text-muted-foreground">
                    Disabling MFA reduces your account security. Make sure you understand the risks.
                  </p>
                </div>
              </div>
              <LoadingButton
                variant="destructive"
                size="sm"
                loading={loading}
                onClick={handleDisableMfa}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Disable Two-Factor Authentication
              </LoadingButton>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// 8. SESSION MANAGEMENT PAGE (Settings)
// ============================================================

interface Session {
  id: string;
  device: string;
  browser: string;
  ip: string;
  lastActive: string;
  current: boolean;
  icon: 'desktop' | 'mobile' | 'unknown';
}

// Default empty sessions (fetched from API)
const EMPTY_SESSIONS: Session[] = [];

function SessionIcon({ type }: { type: 'desktop' | 'mobile' | 'unknown' }) {
  switch (type) {
    case 'desktop':
      return <Monitor className="h-5 w-5 text-muted-foreground" />;
    case 'mobile':
      return <Smartphone className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Globe className="h-5 w-5 text-muted-foreground" />;
  }
}

export function SessionManagementPage() {
  const [sessions, setSessions] = useState<Session[]>(EMPTY_SESSIONS);
  const [loading, setLoading] = useState<string | null>(null);

  // Fetch sessions from API
  useEffect(() => {
    fetch('/api/auth/sessions', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.sessions) setSessions(d.sessions);
      })
      .catch(() => {});
  }, []);

  // Revoke a single session
  const handleRevoke = useCallback(async (sessionId: string) => {
    setLoading(sessionId);
    try {
      const res = await fetch('/api/auth/sessions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success('Session revoked');
      } else {
        toast.error('Failed to revoke session');
      }
    } catch {
      // In production, don't silently remove — show error
      if (process.env.NODE_ENV === 'development') {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success('Session revoked');
      } else {
        toast.error('Failed to revoke session');
      }
    }
    setLoading(null);
  }, []);

  // Revoke all other sessions
  const handleRevokeAll = useCallback(async () => {
    setLoading('all');
    try {
      const res = await fetch('/api/auth/sessions/revoke-all', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.current));
        toast.success('All other sessions revoked');
      } else {
        toast.error('Failed to revoke sessions');
      }
    } catch {
      // In production, don't silently remove — show error
      if (process.env.NODE_ENV === 'development') {
        setSessions((prev) => prev.filter((s) => s.current));
        toast.success('All other sessions revoked');
      } else {
        toast.error('Failed to revoke sessions');
      }
    }
    setLoading(null);
  }, []);

  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold gradient-text">Active Sessions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your active sessions across devices
        </p>
      </div>

      {/* Sessions list */}
      <div className="space-y-3">
        {sessions.map((session) => (
          <Card key={session.id} className="glass-card">
            <CardContent className="py-4 px-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <SessionIcon type={session.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {session.device}
                    </p>
                    {session.current && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/30 text-primary shrink-0">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {session.browser} &middot; {session.ip}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <LoadingButton
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 h-8"
                    loading={loading === session.id}
                    onClick={() => handleRevoke(session.id)}
                  >
                    Revoke
                  </LoadingButton>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revoke all */}
      {otherSessions.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {otherSessions.length} other active {otherSessions.length === 1 ? 'session' : 'sessions'}
            </p>
            <LoadingButton
              variant="destructive"
              size="sm"
              loading={loading === 'all'}
              onClick={handleRevokeAll}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Revoke All Other Sessions
            </LoadingButton>
          </div>
        </>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No active sessions found.
        </div>
      )}
    </div>
  );
}

// ============================================================
// AUTH DEMO WRAPPER — Showcases all auth pages with navigation
// ============================================================

type AuthPageId =
  | 'signin'
  | 'signup'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password'
  | 'mfa-verify'
  | 'mfa-setup'
  | 'session-management';

export function AuthDemo() {
  const [activePage, setActivePage] = useState<AuthPageId>('signin');
  const [verifyEmail, setVerifyEmail] = useState('user@example.com');
  const [resetEmail, setResetEmail] = useState('user@example.com');
  const [resetEmailPreviewUrl, setResetEmailPreviewUrl] = useState<string | undefined>();
  const [resetEmailProvider, setResetEmailProvider] = useState<string | undefined>();

  const navigate = (page: AuthPageId) => setActivePage(page);

  const pages: { id: AuthPageId; label: string }[] = [
    { id: 'signin', label: 'Sign In' },
    { id: 'signup', label: 'Sign Up' },
    { id: 'verify-email', label: 'Verify Email' },
    { id: 'forgot-password', label: 'Forgot Password' },
    { id: 'reset-password', label: 'Reset Password' },
    { id: 'mfa-verify', label: 'MFA Verify' },
    { id: 'mfa-setup', label: 'MFA Setup' },
    { id: 'session-management', label: 'Sessions' },
  ];

  // Settings-style pages (no centered auth layout)
  const isSettingsPage = activePage === 'mfa-setup' || activePage === 'session-management';

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation bar */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="font-bold gradient-text">AcquisitionOS</span>
            <span className="text-xs text-muted-foreground">Auth Pages Demo</span>
          </div>
          <nav className="flex flex-wrap gap-1.5" role="navigation" aria-label="Auth pages">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => navigate(page.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  activePage === page.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {page.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Page content */}
      {isSettingsPage ? (
        <div className="max-w-2xl mx-auto p-6">
          {activePage === 'mfa-setup' && <MfaSetupPage onDisable={() => navigate('signin')} />}
          {activePage === 'session-management' && <SessionManagementPage />}
        </div>
      ) : (
        <>
          {activePage === 'signin' && (
            <SignInPage
              onSignUpClick={() => navigate('signup')}
              onForgotPasswordClick={() => navigate('forgot-password')}
              onSuccess={() => navigate('mfa-verify')}
            />
          )}
          {activePage === 'signup' && (
            <SignUpPage
              onSignInClick={() => navigate('signin')}
              onVerifyEmail={(email) => {
                setVerifyEmail(email);
                navigate('verify-email');
              }}
            />
          )}
          {activePage === 'verify-email' && (
            <VerifyEmailPage
              email={verifyEmail}
              onVerified={() => navigate('signin')}
              onBackToSignIn={() => navigate('signin')}
            />
          )}
          {activePage === 'forgot-password' && (
            <ForgotPasswordPage
              onBackToSignIn={() => navigate('signin')}
              onOtpSent={(email, emailPreviewUrl, emailProvider) => {
                setResetEmail(email);
                setResetEmailPreviewUrl(emailPreviewUrl);
                setResetEmailProvider(emailProvider);
                navigate('reset-password');
              }}
            />
          )}
          {activePage === 'reset-password' && (
            <ResetPasswordPage
              email={resetEmail}
              onSuccess={() => navigate('signin')}
              initialEmailPreviewUrl={resetEmailPreviewUrl}
              initialEmailProvider={resetEmailProvider}
            />
          )}
          {activePage === 'mfa-verify' && (
            <MfaVerificationPage
              onSuccess={() => navigate('mfa-setup')}
              onBack={() => navigate('signin')}
            />
          )}
        </>
      )}
    </div>
  );
}

export default AuthDemo;
