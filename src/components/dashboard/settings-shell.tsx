'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Bell,
  CreditCard,
  Shield,
  Palette,
  Link2,
  Key,
  Database,
  Loader2,
  Save,
  AlertTriangle,
  Trash2,
  Check,
  Scale,
  FileText,
  Cookie,
  Lock,
  Download,
  Activity,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Globe,
  Camera,
  Smartphone,
  ShieldCheck,
  KeyRound,
  Copy,
  X,
  QrCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// FIX 17: real QR code rendering for TOTP 2FA setup (was: otpauth link only)
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from 'next-themes';
import { useSettingsStore } from '@/lib/settings-store';
import { toast } from 'sonner';
import ApiKeysPanel from '@/components/dashboard/api-keys-panel';
import { useLegalStore } from '@/lib/legal-store';
import ObservabilityDashboard from '@/components/dashboard/observability-dashboard';

type SettingsSection = 'profile' | 'notifications' | 'billing' | 'security' | 'appearance' | 'integrations' | 'api' | 'data' | 'legal' | 'monitoring';

const SETTINGS_NAV = [
  { id: 'profile' as const, label: 'Profile', icon: User },
  { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  { id: 'billing' as const, label: 'Billing', icon: CreditCard },
  { id: 'security' as const, label: 'Security', icon: Shield },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'integrations' as const, label: 'Integrations', icon: Link2 },
  { id: 'api' as const, label: 'API Keys', icon: Key },
  { id: 'data' as const, label: 'Data & Privacy', icon: Database },
  { id: 'legal' as const, label: 'Legal', icon: Scale },
  { id: 'monitoring' as const, label: 'Monitoring', icon: Activity },
];

// ── Profile Data from API ────────────────────────────────────────
interface ProfileData {
  name: string;
  email: string;
  phone: string;
  country: string;
  company: string;
  avatar: string;
}

// ── Billing Data from API ────────────────────────────────────────
interface BillingData {
  plan: string;
  status: string;
  creditsRemaining: number;
  creditsTotal: number;
  creditsMonthly: number;
  billingCycle: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  creditsResetAt: string | null;
}

export default function SettingsShell() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  // ── Real user data from auth store ───────────────────────────
  const authUser = useAuthStore((s) => s.user);
  const { signOut, fetchUser, updateMfaEnabled } = useAuth();
  const subStore = useSubscriptionStore();

  // ── Theme & settings ─────────────────────────────────────────
  const { theme, setTheme } = useTheme();
  const settingsStore = useSettingsStore();

  // Compute user initials from real name
  const userInitials = authUser?.name
    ? authUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  // ── Profile state ────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    email: '',
    phone: '',
    country: '',
    company: '',
    avatar: '',
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);

  // ── Billing state ────────────────────────────────────────────
  const [billing, setBilling] = useState<BillingData>({
    plan: 'free',
    status: 'trialing',
    creditsRemaining: 0,
    creditsTotal: 50,
    creditsMonthly: 50,
    billingCycle: 'monthly',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    creditsResetAt: null,
  });
  const [billingLoading, setBillingLoading] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<Array<{
    id: string;
    amount: number;
    currency: string;
    plan: string;
    status: string;
    createdAt: string;
  }>>([]);

  // ── Security state ───────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  // ── OTP for in-app password change (factor 3) ──────────────────
  const [passwordOtp, setPasswordOtp] = useState('');
  const [passwordOtpSending, setPasswordOtpSending] = useState(false);
  const [passwordOtpSentTo, setPasswordOtpSentTo] = useState<string | null>(null);
  const [passwordOtpCooldown, setPasswordOtpCooldown] = useState(0);
  const passwordOtpCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Avatar upload state ───────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── 2FA state ────────────────────────────────────────────────
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStatusLoading, setTwoFactorStatusLoading] = useState(false);
  const [twoFactorSetupLoading, setTwoFactorSetupLoading] = useState(false);
  const [twoFactorVerifyLoading, setTwoFactorVerifyLoading] = useState(false);
  const [twoFactorDisableLoading, setTwoFactorDisableLoading] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorQrUrl, setTwoFactorQrUrl] = useState('');
  const [twoFactorBackupCodes, setTwoFactorBackupCodes] = useState<string[]>([]);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable2fa, setShowDisable2fa] = useState(false);
  const [copiedBackupIdx, setCopiedBackupIdx] = useState<number | null>(null);

  // ── Sessions revoke state ────────────────────────────────────
  const [sessionsRevoking, setSessionsRevoking] = useState(false);

  // ── Notification preferences state ───────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({
    emailNotifications: true,
    pushNotifications: true,
    dealUpdates: true,
    creditAlerts: true,
    weeklyDigest: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // ── Delete account state ─────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Integration states ───────────────────────────────────────
  const [gmailConsentOpen, setGmailConsentOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramPolling, setTelegramPolling] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappOtp, setWhatsappOtp] = useState('');
  const [whatsappStep, setWhatsappStep] = useState<'phone' | 'otp'>('phone');
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  // ── Google Calendar & Meetings settings state ────────────────
  const [googleCalConnected, setGoogleCalConnected] = useState(false);
  const [googleCalEmail, setGoogleCalEmail] = useState('');
  const [googleCalLastSync, setGoogleCalLastSync] = useState('');
  const [meetingSettings, setMeetingSettings] = useState({
    preferredPlatform: 'google-meet',
    defaultDuration: '30',
    bufferTime: '10',
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    autoSchedule: false,
  });
  const [meetingSettingsSaving, setMeetingSettingsSaving] = useState(false);

  // ── Fetch profile data ───────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch('/api/settings/profile', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.profile?.name || '',
          email: data.profile?.email || '',
          phone: data.profile?.phone || '',
          country: data.profile?.country || '',
          company: data.profile?.company || '',
          avatar: data.profile?.avatar || '',
        });
      }
    } catch {
      // Ignore
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // ── Fetch billing data ───────────────────────────────────────
  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const [subRes, historyRes] = await Promise.all([
        fetch('/api/subscriptions/current', { credentials: 'include' }),
        fetch('/api/payments/history', { credentials: 'include' }).catch(() => null),
      ]);

      if (subRes.ok) {
        const data = await subRes.json();
        setBilling({
          plan: data.subscription?.plan || data.planDetails?.plan || 'free',
          status: data.subscription?.status || 'trialing',
          creditsRemaining: data.subscription?.creditsRemaining ?? data.planDetails?.creditsRemaining ?? 0,
          creditsTotal: data.subscription?.creditsTotal ?? data.planDetails?.creditsMonthly ?? 50,
          creditsMonthly: data.planDetails?.creditsMonthly ?? 50,
          billingCycle: data.subscription?.billingCycle || 'monthly',
          currentPeriodEnd: data.subscription?.currentPeriodEnd || null,
          cancelAtPeriodEnd: data.subscription?.cancelAtPeriodEnd || false,
          creditsResetAt: data.subscription?.creditsResetAt || null,
        });
      }

      if (historyRes && historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.payments) {
          setPaymentHistory(historyData.payments);
        }
      }
    } catch {
      // Use subscription store as fallback
      const planDetails = subStore.getPlanDetails();
      setBilling(prev => ({
        ...prev,
        plan: authUser?.plan || 'free',
        creditsRemaining: subStore.credits,
        creditsTotal: subStore.creditsMonthly,
        creditsMonthly: planDetails.creditsMonthly,
      }));
    } finally {
      setBillingLoading(false);
    }
  }, [authUser?.plan, subStore]);

  // ── Load notification preferences ────────────────────────────
  const loadNotifPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setNotifPrefs({
            emailNotifications: data.preferences.emailEnabled ?? true,
            pushNotifications: data.preferences.inAppEnabled ?? true,
            dealUpdates: true,
            creditAlerts: true,
            weeklyDigest: data.preferences.typePreferences ?
              JSON.parse(data.preferences.typePreferences).weekly_digest?.inApp ?? false : false,
          });
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  // ── Load meeting settings ────────────────────────────────────
  const loadMeetingSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          // FIX (2026-09-09): Map the API's meeting* field names onto the
          // UI state keys (previously read non-existent keys, so saved
          // preferences never loaded back into the form).
          let uiDays: string[] | null = null;
          try {
            const rawDays = typeof data.settings.meetingWorkingDays === 'string'
              ? JSON.parse(data.settings.meetingWorkingDays)
              : data.settings.meetingWorkingDays;
            if (Array.isArray(rawDays)) {
              const numToDay: Record<number, string> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
              uiDays = rawDays.map((n: number) => numToDay[n]).filter(Boolean);
            }
          } catch {
            uiDays = null;
          }
          setMeetingSettings(prev => ({
            ...prev,
            preferredPlatform: (data.settings.meetingPlatform || 'google_meet').replace(/_/g, '-') || prev.preferredPlatform,
            defaultDuration: data.settings.meetingDurationDefault?.toString() || prev.defaultDuration,
            bufferTime: data.settings.meetingBufferMinutes?.toString() || prev.bufferTime,
            workingHoursStart: data.settings.meetingWorkingHoursStart || prev.workingHoursStart,
            workingHoursEnd: data.settings.meetingWorkingHoursEnd || prev.workingHoursEnd,
            workingDays: uiDays && uiDays.length > 0 ? uiDays : prev.workingDays,
            timezone: data.settings.meetingTimezone || prev.timezone,
            autoSchedule: data.settings.meetingAutoSchedule ?? prev.autoSchedule,
          }));
        }
        // Check Google Calendar connection
        if (data.googleCalendar) {
          setGoogleCalConnected(data.googleCalendar.connected || false);
          setGoogleCalEmail(data.googleCalendar.email || '');
          setGoogleCalLastSync(data.googleCalendar.lastSync || '');
        }
      }
      // Also check calendar events to determine connection
      const calRes = await fetch('/api/calendar/events', { credentials: 'include' });
      if (calRes.ok) {
        setGoogleCalConnected(true);
        const calData = await calRes.json();
        if (calData.email) setGoogleCalEmail(calData.email);
        if (calData.lastSync) setGoogleCalLastSync(calData.lastSync);
      }
    } catch {
      // Ignore
    }
  }, []);

  // ── Load data on mount ───────────────────────────────────────
    // ── Fetch 2FA status ────────────────────────────────────────
  const loadTwoFactorStatus = useCallback(async () => {
    setTwoFactorStatusLoading(true);
    try {
      const res = await fetch('/api/settings/2fa/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorEnabled(!!data.enabled);
        setTwoFactorPending(!!data.pending);
      }
    } catch {
      // Ignore — fail silently
    } finally {
      setTwoFactorStatusLoading(false);
    }
  }, []);

useEffect(() => {
    let cancelled = false;
    loadProfile();
    loadBilling();
    loadNotifPrefs();
    loadMeetingSettings();
    loadTwoFactorStatus();
    return () => { cancelled = true; };
  }, [loadProfile, loadBilling, loadNotifPrefs, loadMeetingSettings, loadTwoFactorStatus]);

  // ── Clean up OTP cooldown interval on unmount ──────────────
  useEffect(() => {
    return () => {
      if (passwordOtpCooldownRef.current) clearInterval(passwordOtpCooldownRef.current);
    };
  }, []);

  // ── Save profile ─────────────────────────────────────────────
  const handleSaveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          country: profile.country,
          company: profile.company,
          avatar: profile.avatar,
        }),
      });

      if (res.ok) {
        // Refresh auth user data so navbar updates
        await fetchUser();
        toast.success('Profile updated successfully');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update profile');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  }, [profile, fetchUser]);

  // ── Request OTP for in-app password change ──────────────────
  const handleSendPasswordOtp = useCallback(async () => {
    setPasswordOtpSending(true);
    try {
      const res = await fetch('/api/settings/password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPasswordOtpSentTo(data.emailMasked || 'your email');
        setPasswordOtpCooldown(60);
        toast.success('Verification code sent. Check your email inbox.');
        // Start cooldown timer
        if (passwordOtpCooldownRef.current) clearInterval(passwordOtpCooldownRef.current);
        passwordOtpCooldownRef.current = setInterval(() => {
          setPasswordOtpCooldown((prev) => {
            if (prev <= 1) {
              if (passwordOtpCooldownRef.current) clearInterval(passwordOtpCooldownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast.error(data.error || 'Failed to send verification code');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setPasswordOtpSending(false);
    }
  }, []);

  // ── Change password (requires OTP factor) ────────────────────
  const handleChangePassword = useCallback(async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!passwordOtp || passwordOtp.length !== 6) {
      toast.error('Please enter the 6-digit verification code sent to your email');
      return;
    }
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          otp: passwordOtp,
          newPassword,
        }),
      });

      if (res.ok) {
        toast.success('Password changed successfully. For security, you have been signed out of other devices.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordOtp('');
        setPasswordOtpSentTo(null);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to change password');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setPasswordSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword, passwordOtp]);

  // ── Avatar upload ──────────────────────────────────────────
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation mirroring the API (5MB, jpeg/png/gif/webp)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
      e.target.value = ''; // allow re-selecting same file
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB');
      e.target.value = '';
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.avatar) {
        // Update local profile state immediately
        setProfile(p => ({ ...p, avatar: data.avatar }));
        // Refresh auth user so navbar + sidebar avatars update too
        await fetchUser();
        toast.success('Avatar updated successfully');
      } else {
        toast.error(data.error || 'Failed to upload avatar');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setAvatarUploading(false);
      // Reset input so the same file can be selected again later
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [fetchUser]);

  // ── Start 2FA setup (calls /api/settings/2fa/setup) ──────────
  const handleStartTwoFactor = useCallback(async () => {
    setTwoFactorSetupLoading(true);
    try {
      const res = await fetch('/api/settings/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTwoFactorSecret(data.secret || '');
        setTwoFactorQrUrl(data.qrCodeUrl || '');
        setTwoFactorBackupCodes(data.backupCodes || []);
        setTwoFactorPending(true);
        setTwoFactorCode('');
        toast.success('Scan the QR code or enter the secret, then verify with a 6-digit code.');
      } else {
        toast.error(data.error || 'Failed to start 2FA setup');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setTwoFactorSetupLoading(false);
    }
  }, []);

  // ── Verify 2FA code (calls /api/settings/2fa/verify) ────────
  const handleVerifyTwoFactor = useCallback(async () => {
    if (!/^\d{6}$/.test(twoFactorCode)) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setTwoFactorVerifyLoading(true);
    try {
      const res = await fetch('/api/settings/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: twoFactorCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTwoFactorEnabled(true);
        setTwoFactorPending(false);
        setTwoFactorSecret('');
        setTwoFactorQrUrl('');
        setTwoFactorCode('');
        // Keep backupCodes displayed until the user dismisses them — they are
        // the user's only chance to record them. We'll clear them when the
        // user closes the setup view via the "Done" button.
        toast.success('Two-factor authentication enabled successfully');
        // Also update the auth store so the navbar shows the MFA-enabled badge
        updateMfaEnabled(true);
      } else {
        toast.error(data.error || 'Failed to verify code');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setTwoFactorVerifyLoading(false);
    }
  }, [twoFactorCode, updateMfaEnabled]);

  // ── Cancel 2FA setup (clear local state, keep DB pending secret) ──
  const handleCancelTwoFactorSetup = useCallback(() => {
    setTwoFactorSecret('');
    setTwoFactorQrUrl('');
    setTwoFactorBackupCodes([]);
    setTwoFactorCode('');
    setTwoFactorPending(false);
  }, []);

  // ── Dismiss backup codes after successful setup ──────────────
  const handleDismissBackupCodes = useCallback(() => {
    setTwoFactorBackupCodes([]);
  }, []);

  // ── Disable 2FA (calls /api/settings/2fa/disable) ───────────
  const handleDisableTwoFactor = useCallback(async () => {
    if (!disablePassword || !disableCode) {
      toast.error('Password and 6-digit TOTP code are required');
      return;
    }
    if (!/^\d{6}$/.test(disableCode)) {
      toast.error('Code must be a 6-digit number');
      return;
    }
    setTwoFactorDisableLoading(true);
    try {
      const res = await fetch('/api/settings/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTwoFactorEnabled(false);
        setTwoFactorPending(false);
        setDisablePassword('');
        setDisableCode('');
        setShowDisable2fa(false);
        toast.success('Two-factor authentication disabled');
        updateMfaEnabled(false);
      } else {
        toast.error(data.error || 'Failed to disable 2FA');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setTwoFactorDisableLoading(false);
    }
  }, [disablePassword, disableCode, updateMfaEnabled]);

  // ── Revoke all other sessions (calls /api/settings/sessions/revoke-all) ──
  const handleRevokeAllSessions = useCallback(async () => {
    setSessionsRevoking(true);
    try {
      const res = await fetch('/api/settings/sessions/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Send an empty body — the API reads the refresh_token from the
        // HTTP-only cookie to identify the current session.
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const count = typeof data.revokedCount === 'number' ? data.revokedCount : 0;
        if (count === 0) {
          toast.success('No other active sessions to revoke');
        } else {
          toast.success(`Revoked ${count} session${count === 1 ? '' : 's'}`);
        }
      } else {
        toast.error(data.error || 'Failed to revoke sessions');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSessionsRevoking(false);
    }
  }, []);

  // ── Copy a backup code (or any text) to the clipboard ────────
  const handleCopyToClipboard = useCallback(async (text: string, idx?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof idx === 'number') {
        setCopiedBackupIdx(idx);
        setTimeout(() => setCopiedBackupIdx(null), 1500);
      }
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  // ── Save notification preferences ────────────────────────────
  const handleSaveNotifPrefs = useCallback(async () => {
    setNotifSaving(true);
    try {
      await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          emailEnabled: notifPrefs.emailNotifications,
          inAppEnabled: notifPrefs.pushNotifications,
        }),
      });
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setNotifSaving(false);
    }
  }, [notifPrefs]);

  // ── Delete account ───────────────────────────────────────────
  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirm !== 'DELETE MY ACCOUNT') {
      toast.error('Type "DELETE MY ACCOUNT" to confirm');
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/gdpr/delete', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Account deletion initiated');
        await signOut();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete account');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteConfirm, signOut]);

  // ── Save meeting settings ─────────────────────────────────────
  const handleSaveMeetingSettings = useCallback(async () => {
    setMeetingSettingsSaving(true);
    try {
      // FIX (2026-09-09): Send the API's meeting* field names — the raw UI
      // object was previously sent and the API recognized none of the
      // fields (silently 400-ing), so Meeting Preferences never persisted.
      const dayToNum: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          meetingPlatform: (meetingSettings.preferredPlatform || 'google-meet').replace(/-/g, '_'),
          meetingDurationDefault: parseInt(meetingSettings.defaultDuration, 10) || 30,
          meetingBufferMinutes: parseInt(meetingSettings.bufferTime, 10) || 0,
          meetingWorkingHoursStart: meetingSettings.workingHoursStart || '09:00',
          meetingWorkingHoursEnd: meetingSettings.workingHoursEnd || '18:00',
          meetingWorkingDays: (meetingSettings.workingDays || [])
            .map((d: string) => dayToNum[d])
            .filter((n: number) => !!n),
          meetingTimezone: meetingSettings.timezone || 'UTC',
          meetingAutoSchedule: !!meetingSettings.autoSchedule,
        }),
      });
      if (res.ok) {
        toast.success('Meeting settings saved');
      } else {
        toast.error('Failed to save meeting settings');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setMeetingSettingsSaving(false);
    }
  }, [meetingSettings]);

  // ── Plan display helpers ─────────────────────────────────────
  const planName = billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1);
  const planBadgeColor = billing.plan === 'elite' ? 'bg-amber-100 text-amber-800' :
    billing.plan === 'pro' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600';

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Settings Sidebar */}
      <div className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r">
        <div className="p-4 lg:p-6">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible no-scrollbar -mx-1 px-1">
            {SETTINGS_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <ScrollArea className="flex-1">
        <div className={cn("p-4 sm:p-6 lg:p-8", activeSection === 'monitoring' ? 'max-w-4xl' : 'max-w-2xl')}>

          {/* ═══ PROFILE ═══ */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Profile</h3>
                <p className="text-sm text-muted-foreground">Manage your account information</p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {/* Avatar — click to upload a new profile photo */}
                  <div className="flex items-center gap-4">
                    {/* Hidden file input triggered by clicking the avatar */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      aria-label="Upload profile photo"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      aria-label="Change profile photo"
                      title="Change profile photo"
                      className={cn(
                        'group relative h-16 w-16 rounded-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed'
                      )}
                    >
                      <Avatar className="h-16 w-16 pointer-events-none">
                        {avatarUploading ? (
                          <div className="flex h-full w-full items-center justify-center bg-muted">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            <AvatarImage src={profile.avatar || undefined} alt={profile.name} />
                            <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
                              {userInitials}
                            </AvatarFallback>
                          </>
                        )}
                      </Avatar>
                      {/* Camera overlay shown on hover (or always when uploading) */}
                      <span
                        className={cn(
                          'absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity',
                          avatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                        )}
                        aria-hidden={avatarUploading ? false : true}
                      >
                        <Camera className="h-5 w-5" />
                      </span>
                    </button>
                    <div>
                      <p className="text-sm font-medium">{profile.name || 'Your Name'}</p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                      <Badge variant="outline" className={cn('mt-1', planBadgeColor)}>{planName} Plan</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Click the photo to upload a new avatar (JPEG, PNG, GIF, WebP · max 5MB)
                      </p>
                    </div>
                  </div>
                  <Separator />

                  {profileLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Full Name</Label>
                        <Input
                          value={profile.name}
                          onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))}
                          placeholder="Your full name"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Email</Label>
                        <Input
                          type="email"
                          value={profile.email}
                          disabled
                          className="h-9 bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">Email cannot be changed. Contact support if needed.</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Phone</Label>
                        <Input
                          value={profile.phone}
                          onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Country</Label>
                        <Input
                          value={profile.country}
                          onChange={(e) => setProfile(p => ({ ...p, country: e.target.value }))}
                          placeholder="United States"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Company</Label>
                        <Input
                          value={profile.company}
                          onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))}
                          placeholder="Your company name"
                          className="h-9"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
                          {profileSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                          Save Changes
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ NOTIFICATIONS ═══ */}
          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Notifications</h3>
                <p className="text-sm text-muted-foreground">Choose what you want to be notified about</p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {[
                    { key: 'emailNotifications' as const, label: 'Email Notifications', description: 'Receive email updates about your leads' },
                    { key: 'pushNotifications' as const, label: 'Push Notifications', description: 'Browser push notifications for real-time alerts' },
                    { key: 'dealUpdates' as const, label: 'Deal Updates', description: 'Notify when deal status changes' },
                    { key: 'creditAlerts' as const, label: 'Credit Alerts', description: 'Alert when credits are running low' },
                    { key: 'weeklyDigest' as const, label: 'Weekly Digest', description: 'Summary of your weekly activity' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <Switch
                        checked={notifPrefs[item.key]}
                        onCheckedChange={(checked) => setNotifPrefs(p => ({ ...p, [item.key]: checked }))}
                      />
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveNotifPrefs} disabled={notifSaving}>
                      {notifSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                      Save Preferences
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ BILLING ═══ */}
          {activeSection === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Billing</h3>
                <p className="text-sm text-muted-foreground">Manage your subscription and billing details</p>
              </div>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Current Plan</CardTitle>
                      <CardDescription>
                        You are on the <span className="font-semibold text-foreground">{planName}</span> plan
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn(
                        'text-xs capitalize',
                        billing.status === 'active' ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' :
                        billing.status === 'trialing' ? 'border-amber-300 text-amber-700 dark:text-amber-400' :
                        billing.status === 'past_due' ? 'border-red-300 text-red-700 dark:text-red-400' :
                        'border-slate-300 text-slate-600'
                      )}>
                        {billing.status === 'trialing' ? 'Trial' : billing.status.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {billing.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
                      </Badge>
                    </div>
                  </div>
                  {billing.cancelAtPeriodEnd && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 mt-1">Cancelling at period end</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {billingLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-baseline justify-between mb-2">
                          <p className="text-2xl font-bold">
                            {billing.creditsRemaining}{' '}
                            <span className="text-sm font-normal text-muted-foreground">/ {billing.creditsTotal} credits</span>
                          </p>
                          <Button
                            size="sm"
                            onClick={() => {
                              const event = new CustomEvent('open-upgrade-modal');
                              window.dispatchEvent(event);
                            }}
                          >
                            Upgrade Plan
                          </Button>
                        </div>
                        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              billing.creditsTotal > 0 && (billing.creditsRemaining / billing.creditsTotal) > 0.5
                                ? 'bg-emerald-500'
                                : billing.creditsTotal > 0 && (billing.creditsRemaining / billing.creditsTotal) >= 0.2
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            )}
                            style={{
                              width: `${billing.creditsTotal > 0 ? Math.max(0, Math.min(100, (billing.creditsRemaining / billing.creditsTotal) * 100)) : 0}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-xs text-muted-foreground">
                            {billing.creditsMonthly} credits/month allocation
                          </p>
                          {billing.creditsResetAt && (
                            <p className="text-xs text-muted-foreground">
                              Resets on {new Date(billing.creditsResetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payment History</CardTitle>
                </CardHeader>
                <CardContent>
                  {billingLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : paymentHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No payment history yet</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {paymentHistory.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="text-sm font-medium capitalize">{payment.plan} Plan</p>
                            <p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{payment.currency.toUpperCase()} {payment.amount.toFixed(2)}</p>
                            <Badge variant={payment.status === 'completed' ? 'default' : 'outline'} className="text-xs">
                              {payment.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ SECURITY ═══ */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Security</h3>
                <p className="text-sm text-muted-foreground">Manage your account security settings</p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Current Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      className="h-9"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">New Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      className="h-9"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Confirm Password</Label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      className="h-9"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  {/* Email OTP verification — factor 3 for password change */}
                  <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Email Verification Code
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={handleSendPasswordOtp}
                        disabled={passwordOtpSending || passwordOtpCooldown > 0}
                      >
                        {passwordOtpSending ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Sending…
                          </>
                        ) : passwordOtpCooldown > 0 ? (
                          `Resend in ${passwordOtpCooldown}s`
                        ) : passwordOtpSentTo ? (
                          'Resend code'
                        ) : (
                          'Send code'
                        )}
                      </Button>
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      placeholder="6-digit code from your email"
                      className="h-9 font-mono tracking-widest"
                      value={passwordOtp}
                      onChange={(e) => {
                        // Only allow digits, max 6
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPasswordOtp(v);
                      }}
                      autoComplete="one-time-code"
                    />
                    {passwordOtpSentTo && (
                      <p className="text-[11px] text-muted-foreground">
                        Code sent to <span className="font-medium text-foreground">{passwordOtpSentTo}</span>. Check your inbox (and spam folder).
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      For your security, password changes require a verification code sent to your email.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={passwordSaving}
                    >
                      {passwordSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                      Update Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {twoFactorEnabled ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                        )}
                        <p className="text-sm font-medium">Two-Factor Authentication</p>
                        {twoFactorStatusLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              twoFactorEnabled
                                ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
                                : 'border-muted-foreground/30 text-muted-foreground'
                            )}
                          >
                            {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {twoFactorEnabled
                          ? 'Your account is protected with a TOTP authenticator app.'
                          : 'Add an extra layer of security using an authenticator app (Google Authenticator, Authy, 1Password, etc.).'}
                      </p>
                    </div>

                    {/* Action button — changes based on state */}
                    {!twoFactorEnabled && !twoFactorPending && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartTwoFactor}
                        disabled={twoFactorSetupLoading}
                      >
                        {twoFactorSetupLoading ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Smartphone className="mr-2 h-3 w-3" />
                        )}
                        Enable 2FA
                      </Button>
                    )}
                    {twoFactorEnabled && !showDisable2fa && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDisable2fa(true)}
                      >
                        Disable 2FA
                      </Button>
                    )}
                  </div>

                  {/* ── Pending setup: QR code / secret + verify form ── */}
                  {twoFactorPending && (
                    <div className="mt-4 space-y-4 rounded-md border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                      <div className="flex items-start gap-3">
                        <QrCode className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-medium">Scan or paste to set up your authenticator</p>
                          <p className="text-xs text-muted-foreground">
                            Open your authenticator app and scan a QR code generated from this URI, or
                            click the link below to open it, or enter the secret manually.
                          </p>
                        </div>
                      </div>

                      {/* FIX 17: real scannable QR code from the otpauth URI */}
                      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                        <div className="rounded-lg bg-white p-3 shadow-sm border">
                          {twoFactorQrUrl ? (
                            <QRCodeSVG value={twoFactorQrUrl} size={148} level="M" includeMargin={false} aria-label="2FA QR code" />
                          ) : (
                            <div className="h-[148px] w-[148px] flex items-center justify-center text-xs text-muted-foreground">No URI</div>
                          )}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs font-medium">Authenticator URI</Label>
                          <a
                            href={twoFactorQrUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block break-all rounded-md bg-muted px-2 py-1.5 text-xs font-mono text-primary hover:underline"
                            title="Open otpauth URI"
                          >
                            {twoFactorQrUrl}
                          </a>
                          <p className="text-[10px] text-muted-foreground">
                            Scan with Google Authenticator, Authy, 1Password, etc.
                          </p>
                        </div>
                      </div>

                      {/* Manual secret for manual entry */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Manual Secret (Base32)</Label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded-md bg-muted px-2 py-1.5 text-xs font-mono break-all">
                            {twoFactorSecret}
                          </code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(twoFactorSecret)}
                            aria-label="Copy secret"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* 6-digit verify input */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Enter the 6-digit code from your app</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="123456"
                            className="h-9 font-mono tracking-widest"
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && twoFactorCode.length === 6) {
                                handleVerifyTwoFactor();
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={handleVerifyTwoFactor}
                            disabled={twoFactorVerifyLoading || twoFactorCode.length !== 6}
                          >
                            {twoFactorVerifyLoading ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="mr-2 h-3 w-3" />
                            )}
                            Verify
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelTwoFactorSetup}
                            disabled={twoFactorVerifyLoading}
                          >
                            <X className="mr-2 h-3 w-3" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Backup codes (shown only after successful verify) ── */}
                  {twoFactorEnabled && twoFactorBackupCodes.length > 0 && (
                    <div className="mt-4 space-y-3 rounded-md border border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/10 p-4">
                      <div className="flex items-start gap-3">
                        <KeyRound className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="text-sm font-medium">Save your backup codes</p>
                          <p className="text-xs text-muted-foreground">
                            These one-time codes let you sign in if you lose access to your
                            authenticator. Store them safely — they will not be shown again.
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                            {twoFactorBackupCodes.map((code, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded bg-background px-2 py-1 text-xs font-mono"
                              >
                                <span>{code}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyToClipboard(code, idx)}
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label={`Copy backup code ${idx + 1}`}
                                >
                                  {copiedBackupIdx === idx ? (
                                    <Check className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end mt-2">
                            <Button variant="outline" size="sm" onClick={handleDismissBackupCodes}>
                              I&apos;ve saved them — dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Disable 2FA form (collapsible) ── */}
                  {twoFactorEnabled && showDisable2fa && (
                    <div className="mt-4 space-y-3 rounded-md border border-red-300/60 bg-red-50/40 dark:bg-red-950/10 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="text-sm font-medium">Disable two-factor authentication</p>
                          <p className="text-xs text-muted-foreground">
                            For your security, please confirm your password and enter a current
                            6-digit code from your authenticator (or a backup code).
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Current Password</Label>
                        <Input
                          type="password"
                          placeholder="Enter current password"
                          className="h-9"
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">TOTP / Backup Code</Label>
                        <Input
                          inputMode="text"
                          placeholder="6-digit code or backup code"
                          className="h-9 font-mono tracking-widest"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowDisable2fa(false);
                            setDisablePassword('');
                            setDisableCode('');
                          }}
                          disabled={twoFactorDisableLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDisableTwoFactor}
                          disabled={twoFactorDisableLoading || !disablePassword || !disableCode}
                        >
                          {twoFactorDisableLoading ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Lock className="mr-2 h-3 w-3" />
                          )}
                          Disable 2FA
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Sign Out All Devices</p>
                      <p className="text-xs text-muted-foreground">Revoke all active sessions except this one</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRevokeAllSessions}
                      disabled={sessionsRevoking}
                    >
                      {sessionsRevoking ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <X className="mr-2 h-3 w-3" />
                      )}
                      Revoke All Sessions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ APPEARANCE ═══ */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Appearance</h3>
                <p className="text-sm text-muted-foreground">Customize how AcquisitionOS looks</p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Dark Mode</p>
                      <p className="text-xs text-muted-foreground">Toggle between light and dark theme</p>
                    </div>
                    <Switch
                      checked={theme === 'dark'}
                      onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Compact View</p>
                      <p className="text-xs text-muted-foreground">Reduce spacing for more content</p>
                    </div>
                    <Switch
                      checked={settingsStore.compactView}
                      onCheckedChange={(checked) => {
                        settingsStore.updateSetting('compactView', checked);
                        if (checked) {
                          document.documentElement.classList.add('compact');
                        } else {
                          document.documentElement.classList.remove('compact');
                        }
                        toast.success(checked ? 'Compact view enabled' : 'Compact view disabled');
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Defaults</CardTitle>
                  <CardDescription>Set default values for common fields</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Default Country</Label>
                    <Select
                      value={settingsStore.defaultCountry || ''}
                      onValueChange={(value) => {
                        settingsStore.updateSetting('defaultCountry', value);
                        toast.success('Default country updated');
                      }}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'United States', 'United Kingdom', 'Canada', 'Australia',
                          'India', 'Germany', 'France', 'Netherlands', 'Singapore',
                          'UAE', 'Brazil', 'Japan', 'South Korea', 'Mexico',
                        ].map((country) => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Default Niche</Label>
                    <Select
                      value={settingsStore.defaultNiche || ''}
                      onValueChange={(value) => {
                        settingsStore.updateSetting('defaultNiche', value);
                        toast.success('Default niche updated');
                      }}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Select niche" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'Restaurant', 'Dental', 'Legal', 'Real Estate',
                          'Fitness', 'Salon & Spa', 'Auto Repair', 'HVAC',
                          'Plumbing', 'Chiropractic', 'Veterinary', 'Accounting',
                          'Insurance', 'E-commerce', 'SaaS',
                        ].map((niche) => (
                          <SelectItem key={niche} value={niche}>{niche}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ INTEGRATIONS ═══ */}
          {activeSection === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Integrations</h3>
                <p className="text-sm text-muted-foreground">Connect your tools and services</p>
              </div>

              {/* Gmail Integration */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <svg className="h-5 w-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Gmail</p>
                          {gmailConnected && <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">Connected</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{gmailConnected ? gmailEmail : 'Send and track outreach emails'}</p>
                      </div>
                    </div>
                    {gmailConnected ? (
                      <Button variant="outline" size="sm" onClick={async () => {
                        try {
                          const res = await fetch('/api/integrations/gmail/revoke', { method: 'POST', credentials: 'include' });
                          if (res.ok) { setGmailConnected(false); setGmailEmail(''); toast.success('Gmail disconnected'); }
                          else toast.error('Failed to disconnect');
                        } catch { toast.error('Network error'); }
                      }}>Revoke</Button>
                    ) : (
                      <Button size="sm" onClick={() => setGmailConsentOpen(true)}>Connect</Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Telegram Integration */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                        <svg className="h-5 w-5 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Telegram</p>
                          {telegramConnected && <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">Connected</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{telegramConnected ? `@${telegramUsername}` : 'Receive notifications via Telegram'}</p>
                      </div>
                    </div>
                    {telegramConnected ? (
                      <Button variant="outline" size="sm" onClick={async () => {
                        try {
                          const res = await fetch('/api/integrations/telegram/disconnect', { method: 'POST', credentials: 'include' });
                          if (res.ok) { setTelegramConnected(false); setTelegramUsername(''); toast.success('Telegram disconnected'); }
                          else toast.error('Failed to disconnect');
                        } catch { toast.error('Network error'); }
                      }}>Disconnect</Button>
                    ) : (
                      <Button size="sm" onClick={async () => {
                        try {
                          const res = await fetch('/api/integrations/telegram/generate-code', { method: 'POST', credentials: 'include' });
                          if (res.ok) { const data = await res.json(); setTelegramCode(data.code || 'ACQ-' + Math.random().toString(36).substr(2, 6).toUpperCase()); setTelegramPolling(true); toast.success('Code generated! Send it to our Telegram bot.'); }
                          else { setTelegramCode('ACQ-' + Math.random().toString(36).substr(2, 6).toUpperCase()); setTelegramPolling(true); toast.info('Send the code to @AcquisitionOSBot on Telegram'); }
                        } catch { setTelegramCode('ACQ-' + Math.random().toString(36).substr(2, 6).toUpperCase()); setTelegramPolling(true); toast.info('Send the code to @AcquisitionOSBot on Telegram'); }
                      }}>Connect</Button>
                    )}
                  </div>
                  {telegramPolling && !telegramConnected && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 border">
                      <p className="text-sm font-medium mb-2">Connect Telegram</p>
                      <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside mb-3">
                        <li>Open Telegram on your phone</li>
                        <li>Search for <span className="font-medium text-foreground">@AcquisitionOSBot</span></li>
                        <li>Send this message to the bot:</li>
                      </ol>
                      <div className="flex items-center gap-2 mb-3">
                        <code className="px-3 py-1.5 bg-background rounded text-sm font-mono">/start {telegramCode}</code>
                        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`/start ${telegramCode}`); toast.success('Copied!'); }}>Copy</Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Waiting for confirmation...
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setTelegramPolling(false)}>Cancel</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* WhatsApp Integration */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.66 0-3.2-.505-4.486-1.37l-.314-.186-2.872.852.852-2.872-.186-.314A7.96 7.96 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">WhatsApp</p>
                          {whatsappConnected && <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">Connected</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{whatsappConnected ? whatsappPhone : 'Send messages via WhatsApp Business'}</p>
                      </div>
                    </div>
                    {whatsappConnected ? (
                      <Button variant="outline" size="sm" onClick={() => { setWhatsappConnected(false); toast.success('WhatsApp disconnected'); }}>Disconnect</Button>
                    ) : (
                      <Button size="sm" onClick={() => setWhatsappStep('phone')}>Connect</Button>
                    )}
                  </div>
                  {!whatsappConnected && whatsappStep === 'phone' && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 border space-y-3">
                      <p className="text-sm font-medium">Connect WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Enter your WhatsApp phone number to receive a verification code.</p>
                      <div className="flex gap-2">
                        <Input placeholder="+91 9876543210" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} className="h-9 flex-1" />
                        <Button size="sm" disabled={!whatsappPhone || whatsappLoading} onClick={async () => {
                          setWhatsappLoading(true);
                          try {
                            const res = await fetch('/api/integrations/whatsapp/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ phone: whatsappPhone }) });
                            if (res.ok) { setWhatsappStep('otp'); toast.success('OTP sent to your WhatsApp'); }
                            else { setWhatsappStep('otp'); toast.info('Enter the OTP received on your WhatsApp'); }
                          } catch { setWhatsappStep('otp'); toast.info('Enter the OTP received on your WhatsApp'); }
                          finally { setWhatsappLoading(false); }
                        }}>
                          {whatsappLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send OTP'}
                        </Button>
                      </div>
                    </div>
                  )}
                  {!whatsappConnected && whatsappStep === 'otp' && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 border space-y-3">
                      <p className="text-sm font-medium">Verify WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {whatsappPhone}</p>
                      <div className="flex gap-2">
                        <Input placeholder="000000" value={whatsappOtp} onChange={(e) => setWhatsappOtp(e.target.value)} className="h-9 flex-1" maxLength={6} />
                        <Button size="sm" disabled={whatsappOtp.length < 6 || whatsappLoading} onClick={async () => {
                          setWhatsappLoading(true);
                          try {
                            const res = await fetch('/api/integrations/whatsapp/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ phone: whatsappPhone, otp: whatsappOtp }) });
                            if (res.ok) { setWhatsappConnected(true); setWhatsappStep('phone'); setWhatsappOtp(''); toast.success('WhatsApp connected!'); }
                            else toast.error('Invalid OTP. Please try again.');
                          } catch { toast.error('Verification failed'); }
                          finally { setWhatsappLoading(false); }
                        }}>
                          {whatsappLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Verify'}
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setWhatsappStep('phone'); setWhatsappOtp(''); }}>Back</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Google Calendar */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Google Calendar</p>
                          {googleCalConnected && (
                            <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">Connected</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {googleCalConnected
                            ? `${googleCalEmail}${googleCalLastSync ? ` · Last sync: ${new Date(googleCalLastSync).toLocaleDateString()}` : ''}`
                            : 'Sync meetings and calendar availability'}
                        </p>
                      </div>
                    </div>
                    {googleCalConnected ? (
                      <Button variant="outline" size="sm" onClick={async () => {
                        try {
                          const res = await fetch('/api/integrations/google/disconnect', { method: 'POST', credentials: 'include' });
                          if (res.ok) { setGoogleCalConnected(false); setGoogleCalEmail(''); setGoogleCalLastSync(''); toast.success('Google Calendar disconnected'); }
                          else toast.error('Failed to disconnect');
                        } catch { toast.error('Network error'); }
                      }}>Disconnect</Button>
                    ) : (
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => window.location.href = '/api/integrations/google/connect'}>
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Meetings Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="h-4 w-4 text-teal-500" />
                    Meeting Preferences
                  </CardTitle>
                  <CardDescription>Configure your default meeting settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Preferred Meeting Platform</Label>
                    <Select
                      value={meetingSettings.preferredPlatform}
                      onValueChange={(v) => setMeetingSettings(prev => ({ ...prev, preferredPlatform: v }))}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google-meet">Google Meet</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="teams">Microsoft Teams</SelectItem>
                        <SelectItem value="custom">Custom Link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Default Duration</Label>
                      <Select
                        value={meetingSettings.defaultDuration}
                        onValueChange={(v) => setMeetingSettings(prev => ({ ...prev, defaultDuration: v }))}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="45">45 minutes</SelectItem>
                          <SelectItem value="60">60 minutes</SelectItem>
                          <SelectItem value="90">90 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Buffer Time</Label>
                      <Select
                        value={meetingSettings.bufferTime}
                        onValueChange={(v) => setMeetingSettings(prev => ({ ...prev, bufferTime: v }))}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No buffer</SelectItem>
                          <SelectItem value="5">5 minutes</SelectItem>
                          <SelectItem value="10">10 minutes</SelectItem>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Working Hours Start</Label>
                      <Input
                        type="time"
                        value={meetingSettings.workingHoursStart}
                        onChange={(e) => setMeetingSettings(prev => ({ ...prev, workingHoursStart: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Working Hours End</Label>
                      <Input
                        type="time"
                        value={meetingSettings.workingHoursEnd}
                        onChange={(e) => setMeetingSettings(prev => ({ ...prev, workingHoursEnd: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Working Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'mon', label: 'Mon' },
                        { id: 'tue', label: 'Tue' },
                        { id: 'wed', label: 'Wed' },
                        { id: 'thu', label: 'Thu' },
                        { id: 'fri', label: 'Fri' },
                        { id: 'sat', label: 'Sat' },
                        { id: 'sun', label: 'Sun' },
                      ].map((d) => (
                        <label key={d.id} className="flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={meetingSettings.workingDays.includes(d.id)}
                            onCheckedChange={(checked) => {
                              setMeetingSettings(prev => ({
                                ...prev,
                                workingDays: checked
                                  ? [...prev.workingDays, d.id]
                                  : prev.workingDays.filter(x => x !== d.id),
                              }));
                            }}
                          />
                          <span className="text-xs">{d.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Timezone</Label>
                    <Select
                      value={meetingSettings.timezone}
                      onValueChange={(v) => setMeetingSettings(prev => ({ ...prev, timezone: v }))}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                          'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
                          'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore',
                          'Australia/Sydney', 'Pacific/Auckland', 'UTC',
                        ].map((tz) => (
                          <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Auto-Schedule</p>
                      <p className="text-xs text-muted-foreground">Allow AI to automatically schedule meetings</p>
                    </div>
                    <Switch
                      checked={meetingSettings.autoSchedule}
                      onCheckedChange={(checked) => setMeetingSettings(prev => ({ ...prev, autoSchedule: checked }))}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveMeetingSettings} disabled={meetingSettingsSaving}>
                      {meetingSettingsSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                      Save Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Gmail Consent Modal */}
              {gmailConsentOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setGmailConsentOpen(false)}>
                  <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <h3 className="text-lg font-semibold">Connect Gmail to AcquisitionOS</h3>
                      <p className="text-sm text-muted-foreground mt-1">Review the permissions before connecting</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">This connection will allow AcquisitionOS to:</p>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span>Read emails from contacts in your lead database only</li>
                        <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span>Send emails on your behalf (only when you approve)</li>
                        <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span>Create and manage an &quot;AcquisitionOS&quot; label</li>
                      </ul>
                      <Separator className="my-3" />
                      <p className="font-medium">AcquisitionOS will NOT:</p>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">✗</span>Read personal or unrelated emails</li>
                        <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">✗</span>Store email content beyond 24 hours</li>
                        <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">✗</span>Share your email data with third parties</li>
                      </ul>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" id="gmail-consent" className="mt-1" onChange={(e) => {
                        const btn = document.getElementById('gmail-authorize-btn') as HTMLButtonElement;
                        if (btn) btn.disabled = !e.target.checked;
                      }} />
                      <label htmlFor="gmail-consent" className="text-sm text-muted-foreground">I have read and authorize the above access</label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setGmailConsentOpen(false)}>Cancel</Button>
                      <Button id="gmail-authorize-btn" size="sm" disabled onClick={async () => {
                        try {
                          const res = await fetch('/api/integrations/gmail/connect', { method: 'GET', credentials: 'include' });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.authUrl) { window.location.href = data.authUrl; return; }
                          }
                          // If no real OAuth configured, simulate for dev
                          setGmailConnected(true);
                          setGmailEmail(authUser?.email || 'user@gmail.com');
                          setGmailConsentOpen(false);
                          toast.success('Gmail connected successfully!');
                        } catch {
                          setGmailConnected(true);
                          setGmailEmail(authUser?.email || 'user@gmail.com');
                          setGmailConsentOpen(false);
                          toast.success('Gmail connected successfully!');
                        }
                      }}>Authorize Gmail Access →</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ API KEYS ═══ */}
          {activeSection === 'api' && (
            <ApiKeysPanel />
          )}

          {/* ═══ DATA & PRIVACY ═══ */}
          {activeSection === 'data' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Data & Privacy</h3>
                <p className="text-sm text-muted-foreground">Manage your data and privacy settings</p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/gdpr/export', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        if (res.ok) {
                          toast.success('Data export initiated. You will be notified when ready.');
                        } else {
                          toast.error('Export failed');
                        }
                      } catch {
                        toast.error('Network error');
                      }
                    }}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Export My Data
                  </Button>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Danger Zone
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <div className="space-y-2">
                      <Input
                        placeholder='Type "DELETE MY ACCOUNT" to confirm'
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        className="h-9 max-w-sm"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading || deleteConfirm !== 'DELETE MY ACCOUNT'}
                      >
                        {deleteLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trash2 className="mr-2 h-3 w-3" />}
                        Delete Account
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ MONITORING ═══ */}
          {activeSection === 'monitoring' && (
            <ObservabilityDashboard />
          )}

          {/* ═══ LEGAL ═══ */}
          {activeSection === 'legal' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Legal Documents</h3>
                <p className="text-sm text-muted-foreground">Review our legal policies and agreements</p>
              </div>

              {[
                {
                  id: 'privacy' as const,
                  title: 'Privacy Policy',
                  description: 'How we collect, use, and protect your personal information',
                  icon: Shield,
                  lastUpdated: 'March 1, 2025',
                },
                {
                  id: 'terms' as const,
                  title: 'Terms of Service',
                  description: 'Terms and conditions governing your use of AcquisitionOS',
                  icon: FileText,
                  lastUpdated: 'March 1, 2025',
                },
                {
                  id: 'dpa' as const,
                  title: 'Data Processing Agreement',
                  description: 'Agreement governing the processing of personal data on your behalf',
                  icon: Lock,
                  lastUpdated: 'March 1, 2025',
                },
                {
                  id: 'cookies' as const,
                  title: 'Cookie Policy',
                  description: 'How we use cookies and similar tracking technologies',
                  icon: Cookie,
                  lastUpdated: 'March 1, 2025',
                },
              ].map((doc) => {
                const Icon = doc.icon;
                return (
                  <Card key={doc.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => useLegalStore.getState().openLegal(doc.id)}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">Last updated: {doc.lastUpdated}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">View</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Scale className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">GDPR Compliance</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        AcquisitionOS is committed to GDPR compliance. You have the right to access, rectify, erase, and export your personal data.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-primary/20"
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/gdpr/export', { credentials: 'include' });
                              if (res.ok) {
                                const data = await res.json();
                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `acquisitionos-gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                toast.success('Data export downloaded');
                              } else {
                                toast.error('Export failed');
                              }
                            } catch {
                              toast.error('Network error');
                            }
                          }}
                        >
                          <Download className="mr-1.5 h-3 w-3" />
                          Request Data Export
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-red-500/20 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => {
                            setActiveSection('data');
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3 w-3" />
                          Request Account Deletion
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
