// AcquisitionOS — Authentication Hook

'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore, type AuthUser } from '@/lib/auth-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useRouter } from 'next/navigation';
import { apiCall, getErrorFallbackMessage } from '@/lib/api-error-handler';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, mfaRequired, mfaSessionToken, setUser, setLoading, setMfaRequired, logout, updatePlan, updateEmailVerified, updateMfaEnabled } = useAuthStore();

  // Fetch current user on mount
  const fetchUser = useCallback(async () => {
    try {
      const data = await apiCall<{ user: AuthUser }>('/api/auth/me', {
        credentials: 'include',
      }, { errorMessage: 'Failed to fetch user', showToast: false });
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, [setUser]);

  // Sign in with email and password
  //
  // NOTE: We intentionally do NOT toggle the global `setLoading` here (same
  // rationale as signUp below). AuthGate renders a full-screen LoadingScreen
  // while `isLoading` is true, which UNMOUNTS SignInPage and destroys its
  // local state — the inline error alert and filled fields would be lost on
  // remount. SignInPage tracks its own `isSubmitting` for the button spinner.
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle email verification required
        if (data.requiresVerification) {
          return { success: false, error: data.error || 'Email verification required', requiresVerification: true, email: data.email };
        }
        // Propagate account-state flags so the UI can show actionable alerts
        // (unified login: a registered email can log in via ANY method).
        return {
          success: false,
          error: data.error || 'Sign in failed',
          mfaRequired: data.mfaRequired || false,
          emailNotVerified: data.emailNotVerified || false,
          verificationResent: data.verificationResent || false,
          noPasswordSet: data.noPasswordSet || false,
          email: data.email,
          // DEV-ONLY (sandbox): the fresh verification code the server just
          // generated for the unverified account, when it cannot be emailed.
          devDelivery: data.devDelivery || undefined,
        };
      }

      // If MFA is required, set the state
      if (data.mfaRequired) {
        setMfaRequired(true, data.mfaSessionToken);
        return { success: false, error: 'MFA verification required', mfaRequired: true };
      }

      setUser(data.user);
      return { success: true, user: data.user, mfaRequired: false };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.', mfaRequired: false };
    }
  }, [setUser, setMfaRequired]);

  // Sign up with email and password
  //
  // IMPORTANT: We intentionally do NOT toggle the global `setLoading` here.
  // AuthGate uses `isLoading` to decide whether to show the full-screen
  // LoadingScreen, which would unmount the SignUpPage and discard its
  // `showSuccess` state — preventing the post-signup "Check your email" screen
  // from ever rendering. Instead, the SignUpPage component tracks its own
  // local `isSubmitting` state for the button spinner, and we leave the global
  // loading flag alone so the auth pages stay mounted across the request.
  const signUp = useCallback(async (params: { name: string; email: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Sign up failed',
          emailRegistered: data.emailRegistered || false,
          email: data.email,
        };
      }

      // If signup requires email verification, don't set user (they're not authenticated yet)
      if (data.requiresVerification) {
        return {
          success: true,
          requiresVerification: true,
          email: data.email,
          emailProvider: data.emailProvider,
          // DEV-ONLY (sandbox): verification code surfaced in-place when the
          // server has no email provider configured. Never set in production.
          devDelivery: data.devDelivery || undefined,
        };
      }

      setUser(data.user);
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, [setUser]);

  // Verify MFA TOTP code
  const verifyMfa = useCallback(async (code: string) => {
    if (!mfaSessionToken) {
      return { success: false, error: 'No MFA session found' };
    }

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, mfaSessionToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'MFA verification failed' };
      }

      setUser(data.user);
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, [mfaSessionToken, setUser]);

  // Verify email with OTP
  const verifyEmail = useCallback(async (email: string, otp: string) => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Verification failed' };
      }

      updateEmailVerified(true);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, [updateEmailVerified]);

  // Request password reset
  const forgotPassword = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Request failed' };
      }

      return {
        success: true,
        message: data.message,
        emailProvider: data.emailProvider,
        // DEV-ONLY (sandbox): reset code surfaced in-place when the server
        // has no email provider configured. Never set in production.
        devDelivery: data.devDelivery || undefined,
      };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  // Reset password with OTP
  const resetPassword = useCallback(async (params: { email: string; otp: string; newPassword: string }) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Reset failed' };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await apiCall<void>('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      }, { errorMessage: 'Sign out failed', showToast: false });
    } catch {
      // Continue even if API call fails — still clear local state
    }
    logout();
    useSubscriptionStore.getState().reset(); // Reset subscription store
    router.push('/');
  }, [logout, router]);

  // Refresh auth state
  const refreshAuth = useCallback(async () => {
    setLoading(true);
    await fetchUser();
  }, [setLoading, fetchUser]);

  return {
    user,
    isAuthenticated,
    isLoading,
    mfaRequired,
    mfaSessionToken,
    signIn,
    signUp,
    signOut,
    verifyMfa,
    verifyEmail,
    forgotPassword,
    resetPassword,
    refreshAuth,
    updatePlan,
    updateMfaEnabled,
    fetchUser,
  };
}
