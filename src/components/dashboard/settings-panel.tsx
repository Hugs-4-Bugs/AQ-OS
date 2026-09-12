'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  CreditCard,
  Plug,
  Shield,
  Bell,
  Users,
  Code,
  AlertTriangle,
  Mail,
  MessageCircle,
  Phone,
  Smartphone,
  Lock,
  Key,
  Clock,
  Globe,
  Tag,
  Download,
  Trash2,
  Plus,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  Zap,
  RefreshCw,
  Send,
  Rocket,
  RotateCcw,
  Database,
  Calendar,
  FileUp,
  BellRing,
  MailWarning,
  Crown,
  Loader2,
  ArrowUpRight,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PlanGate from '@/components/dashboard/plan-gate';
import TrialBanner from '@/components/dashboard/trial-banner';
import CreditWarningBanner from '@/components/dashboard/credit-warning-banner';
import UpgradeModal from '@/components/dashboard/upgrade-modal';
import { useSubscriptionStore, PLAN_DETAILS } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useCredits } from '@/hooks/use-credits';
import ApiKeysPanel from '@/components/dashboard/api-keys-panel';

// ─── Types & Mock Data ───────────────────────────────────────────────────────

type PlanType = 'free' | 'pro' | 'elite';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowOnboarding?: () => void;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland',
];

// Credit add-on packs (matching backend)
const CREDIT_ADDON_PACKS = [
  { addonId: 'credits_100', credits: 100, priceINR: 199, priceUSD: 2.49 },
  { addonId: 'credits_500', credits: 500, priceINR: 799, priceUSD: 9.99 },
  { addonId: 'credits_1000', credits: 1000, priceINR: 1299, priceUSD: 15.99 },
];

// Login history loaded from API
const loginHistory: Array<{ date: string; ip: string; country: string; device: string }> = [];

// Active sessions loaded from API
const activeSessions: Array<{ device: string; location: string; lastActive: string; current: boolean }> = [];

// Team members loaded from API
const teamMembers: Array<{ avatar: string; name: string; email: string; role: string }> = [];

// Pending invites loaded from API
const pendingInvites: Array<{ email: string; role: string; sentAt: string }> = [];

// API Keys are now handled by the real ApiKeysPanel component

const NOTIFICATION_TYPES = [
  { key: 'leadReply', label: 'Lead Reply', icon: MessageCircle },
  { key: 'dealWon', label: 'Deal Won', icon: CreditCard },
  { key: 'creditLow', label: 'Credit Low', icon: Zap },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'trialEnding', label: 'Trial Ending', icon: Clock },
  { key: 'newLead', label: 'New Lead', icon: User },
  { key: 'analysisComplete', label: 'Analysis Complete', icon: Sparkles },
];

const NOTIFICATION_CHANNELS = [
  { key: 'inApp', label: 'In-App' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
];

// ─── Plan Gate Component (local) ─────────────────────────────────────────────

function LocalPlanGate({ feature, currentPlan: cPlan }: { feature: string; currentPlan: PlanType }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="h-16 w-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
        <Lock className="h-8 w-8 text-purple-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Upgrade to Elite</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        {feature} is available on the Elite plan. Upgrade to unlock this feature and more.
      </p>
      <Button className="bg-purple-600 hover:bg-purple-700 text-white">
        <Sparkles className="h-4 w-4 mr-2" />
        Upgrade to Elite
      </Button>
      <p className="text-xs text-muted-foreground mt-3">
        Current plan: <Badge variant="outline" className="ml-1 capitalize">{cPlan}</Badge>
      </p>
    </div>
  );
}

// ─── Section Header Component ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10">
          <Icon className="h-4 w-4 text-purple-500" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {description && <p className="text-sm text-muted-foreground ml-11">{description}</p>}
    </div>
  );
}

// ─── Main Settings Panel ─────────────────────────────────────────────────────

export default function SettingsPanel({ open, onOpenChange, onShowOnboarding }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('profile');

  // Profile state — initialized from auth store, loaded from API
  const authUser = useAuthStore((s) => s.user);
  const [profileForm, setProfileForm] = useState({
    name: authUser?.name || '',
    email: authUser?.email || '',
    company: '',
    country: '',
    phone: '',
    timezone: 'Asia/Kolkata',
  });

  // Load profile from API on mount
  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const res = await fetch('/api/settings/profile', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setProfileForm({
            name: data.profile?.name || authUser?.name || '',
            email: data.profile?.email || authUser?.email || '',
            company: data.profile?.company || '',
            country: data.profile?.country || '',
            phone: data.profile?.phone || '',
            timezone: 'Asia/Kolkata',
          });
        }
      } catch {
        // Keep defaults from auth store
      }
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [authUser?.name, authUser?.email]);

  // Integration state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailConsentOpen, setGmailConsentOpen] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramCodeGenerated, setTelegramCodeGenerated] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappOtp, setWhatsappOtp] = useState('');
  const [whatsappOtpSent, setWhatsappOtpSent] = useState(false);

  // ── Subscription store (real data) ──
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const subscriptionStatus = useSubscriptionStore((s) => s.subscriptionStatus);
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);
  const isTrial = useSubscriptionStore((s) => s.isTrial);
  const trialEndsAt = useSubscriptionStore((s) => s.trialEndsAt);
  const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
  const creditWarningStatus = useSubscriptionStore((s) => s.creditWarningStatus);
  const rolloverCredits = useSubscriptionStore((s) => s.rolloverCredits);
  const addonCredits = useSubscriptionStore((s) => s.addonCredits);
  const setPlan = useSubscriptionStore((s) => s.setPlan);

  // ── useCredits hook for credit operations ──
  const { isLoading: creditsLoading, refetch: refetchCredits } = useCredits();

  // ── Credit history query ──
  const { data: creditHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ['credit-history'],
    queryFn: async () => {
      const res = await fetch('/api/credits/history?limit=20', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch credit history');
      return res.json() as Promise<{
        entries: Array<{
          id: string;
          action: string;
          credits: number;
          balance: number;
          description: string | null;
          referenceId: string | null;
          createdAt: string;
        }>;
        pagination: { page: number; limit: number; total: number; hasMore: boolean };
      }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // ── Credit addon purchase mutation ──
  const addonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      const res = await fetch('/api/payments/credit-addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addonId, currency: 'INR' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to purchase addon' }));
        throw new Error(data.error || 'Failed to purchase addon');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Credit addon purchased successfully!');
      refetchCredits();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to purchase addon');
    },
  });

  // ── Coupon validation mutation ──
  const couponMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch('/api/payments/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, plan: currentPlan }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Invalid coupon code' }));
        throw new Error(data.error || 'Invalid coupon code');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Coupon applied! ${data.discountValue || data.discountAmount ? 'Discount received' : 'Code validated'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Invalid coupon code');
    },
  });

  // ── GST number state ──
  const [gstNumber, setGstNumber] = useState('');

  // ── Coupon code state ──
  const [couponCode, setCouponCode] = useState('');

  // ── Upgrade modal state ──
  // (PART 2: self-serve downgrade UI removed — the DowngradeModal is gone;
  //  lower-plan cards now show "Contact Support" per SUBSCRIPTION-PAYMENT-FIX.)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // ── Addon processing state ──
  const [processingAddonId, setProcessingAddonId] = useState<string | null>(null);

  // Security state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Notification state
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({
    leadReply: true, dealWon: true, creditLow: true, payment: true,
    trialEnding: true, newLead: false, analysisComplete: false,
  });
  const [channelPrefs, setChannelPrefs] = useState<Record<string, boolean>>({
    inApp: true, telegram: false, whatsapp: false, email: true,
  });
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('08:00');

  // Team state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  // Developer state (moved to ApiKeysPanel)

  const handleProfileSave = useCallback(() => {
    toast.success('Profile updated successfully');
  }, []);

  const handleGenerateTelegramCode = useCallback(() => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTelegramCode(code);
    setTelegramCodeGenerated(true);
    toast.success(`Link code generated: ${code}`);
  }, []);

  const handleSendWhatsappOtp = useCallback(() => {
    if (!whatsappPhone) {
      toast.error('Enter a phone number first');
      return;
    }
    setWhatsappOtpSent(true);
    toast.success('OTP sent to ' + whatsappPhone);
  }, [whatsappPhone]);

  const handleVerifyWhatsappOtp = useCallback(() => {
    if (whatsappOtp.length < 4) {
      toast.error('Enter a valid OTP');
      return;
    }
    setWhatsappConnected(true);
    toast.success('WhatsApp connected successfully');
  }, [whatsappOtp]);

  const handleGmailConnect = useCallback(() => {
    // In production, this would redirect to Google OAuth
    setGmailConsentOpen(false);
    setGmailConnected(true);
    setGmailEmail(profileForm.email);
    toast.success('Gmail connected successfully');
  }, [profileForm.email]);

  const handleGmailDisconnect = useCallback(() => {
    setGmailConnected(false);
    setGmailEmail('');
    toast.success('Gmail disconnected');
  }, []);

  const handleTelegramConnect = useCallback(() => {
    setTelegramConnected(true);
    setTelegramChatId('chat_' + Math.random().toString(36).substring(2, 10));
    toast.success('Telegram connected successfully');
  }, []);

  const handleTelegramDisconnect = useCallback(() => {
    setTelegramConnected(false);
    setTelegramChatId('');
    setTelegramCode('');
    setTelegramCodeGenerated(false);
    toast.success('Telegram disconnected');
  }, []);

  const handleWhatsappDisconnect = useCallback(() => {
    setWhatsappConnected(false);
    setWhatsappPhone('');
    setWhatsappOtp('');
    setWhatsappOtpSent(false);
    toast.success('WhatsApp disconnected');
  }, []);

  const handlePasswordChange = useCallback(() => {
    toast.success('Password changed successfully');
  }, []);

  // API key handlers moved to ApiKeysPanel component

  const toggleNotificationPref = useCallback((key: string) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleChannelPref = useCallback((key: string) => {
    setChannelPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleTestNotification = useCallback(() => {
    toast.success('Test notification sent!');
  }, []);

  const handleExportData = useCallback(() => {
    toast.success('Data export started. You will receive an email shortly.');
  }, []);

  const handleDeleteAccount = useCallback(() => {
    toast.error('Account deletion is disabled in demo mode.');
  }, []);

  // Notification preference state (email/push/weekly)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  // Clear data confirmation state
  const [clearDataOpen, setClearDataOpen] = useState(false);

  // Tab definitions
  const tabs = [
    { value: 'profile', label: 'Profile', icon: User },
    { value: 'subscription', label: 'Billing', icon: CreditCard },
    { value: 'account', label: 'Account', icon: User },
    { value: 'integrations', label: 'Integrations', icon: Plug },
    { value: 'security', label: 'Security', icon: Shield },
    { value: 'notifications', label: 'Notifications', icon: Bell },
    { value: 'data', label: 'Data', icon: Database },
    { value: 'team', label: 'Team', icon: Users },
    { value: 'developer', label: 'Developer', icon: Code },
    { value: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-0 gap-0 overflow-hidden"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10">
              <User className="h-4 w-4 text-purple-500" />
            </div>
            Settings
          </SheetTitle>
          <SheetDescription>Manage your account, integrations, and preferences</SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b md:border-b-0 md:border-r flex-shrink-0">
            {/* Mobile: horizontal scrollable */}
            <div className="md:hidden overflow-x-auto custom-scrollbar">
              <TabsList className="flex w-max bg-transparent h-auto p-2 gap-1">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 whitespace-nowrap"
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {/* Desktop: vertical tabs */}
            <div className="hidden md:flex flex-col p-3 gap-1 w-52 h-full">
              <TabsList className="flex flex-col bg-transparent h-auto gap-1 p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg justify-start data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 transition-colors w-full"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {tab.value === 'danger' && (
                      <AlertTriangle className="h-3 w-3 ml-auto text-red-500" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-8rem)]">
              <div className="p-6">

                {/* ═══════════════ PROFILE ═══════════════ */}
                <TabsContent value="profile" className="mt-0">
                  <SectionHeader icon={User} title="Profile" description="Manage your personal information" />

                  {/* Avatar */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 rounded-full bg-purple-500/20 flex items-center justify-center text-xl font-bold text-purple-600 dark:text-purple-400">
                      {profileForm.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-medium">{profileForm.name}</p>
                      <p className="text-sm text-muted-foreground">{profileForm.email}</p>
                      <Badge variant="outline" className="mt-1 capitalize">{currentPlan} Plan</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Full Name</Label>
                      <Input
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Company Name</Label>
                      <Input
                        value={profileForm.company}
                        onChange={(e) => setProfileForm({ ...profileForm, company: e.target.value })}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Country</Label>
                      <Input
                        value={profileForm.country}
                        onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Globe className="h-3 w-3" />
                        Timezone
                      </Label>
                      <Select
                        value={profileForm.timezone}
                        onValueChange={(v) => setProfileForm({ ...profileForm, timezone: v })}
                      >
                        <SelectTrigger className="border-purple-500/20 focus:ring-purple-500/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button onClick={handleProfileSave} className="bg-purple-600 hover:bg-purple-700 text-white">
                      Save Changes
                    </Button>
                  </div>
                </TabsContent>

                {/* ═══════════════ SUBSCRIPTION & BILLING ═══════════════ */}
                <TabsContent value="subscription" className="mt-0">
                  <SectionHeader icon={CreditCard} title="Subscription & Billing" description="Manage your plan and payment details" />

                  {/* Trial Banner */}
                  {isTrial && trialDaysRemaining > 0 && (
                    <div className="mb-6 -mx-6 -mt-6">
                      <TrialBanner
                        onUpgradeClick={() => setUpgradeModalOpen(true)}
                      />
                    </div>
                  )}

                  {/* Credit Warning Banner */}
                  {(creditWarningStatus === 'low' || creditWarningStatus === 'zero') && (
                    <div className="mb-6 -mx-6">
                      <CreditWarningBanner
                        onUpgradeClick={() => setUpgradeModalOpen(true)}
                      />
                    </div>
                  )}

                  {/* Current Plan Card */}
                  <Card className="mb-6 border-purple-500/20">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-purple-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base capitalize">{currentPlan} Plan</CardTitle>
                              {/* Subscription Status Badge */}
                              <Badge
                                className={
                                  subscriptionStatus === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                    : subscriptionStatus === 'trialing'
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                    : subscriptionStatus === 'past_due'
                                    ? 'bg-red-500/10 text-red-600 border-red-500/20'
                                    : subscriptionStatus === 'canceled'
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    : 'bg-muted text-muted-foreground border-muted'
                                }
                              >
                                {subscriptionStatus === 'trialing' && <Clock className="h-3 w-3 mr-1" />}
                                {subscriptionStatus === 'past_due' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                {subscriptionStatus.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {PLAN_DETAILS[currentPlan]?.priceUSD
                                ? `$${PLAN_DETAILS[currentPlan].priceUSD}/month`
                                : 'Free'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Credit Warning Indicator */}
                          {creditWarningStatus !== 'ok' && (
                            <Badge
                              className={
                                creditWarningStatus === 'zero'
                                  ? 'bg-red-500/10 text-red-600 border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              }
                            >
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              {creditWarningStatus === 'zero' ? 'No credits' : 'Low credits'}
                            </Badge>
                          )}
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                            <Zap className="h-3 w-3 mr-1" />
                            {credits.toLocaleString()} / {creditsMonthly.toLocaleString()} credits
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Credit Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Credits used this month</span>
                          <span>{Math.max(0, creditsMonthly - credits).toLocaleString()} of {creditsMonthly.toLocaleString()}</span>
                        </div>
                        <div className="relative">
                          <Progress
                            value={creditsMonthly > 0 ? Math.round((credits / creditsMonthly) * 100) : 0}
                            className="h-2"
                          />
                        </div>
                        {(rolloverCredits > 0 || addonCredits > 0) && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {rolloverCredits > 0 && (
                              <span className="flex items-center gap-1">
                                <RefreshCw className="h-3 w-3" />
                                {rolloverCredits} rollover
                              </span>
                            )}
                            {addonCredits > 0 && (
                              <span className="flex items-center gap-1">
                                <Plus className="h-3 w-3" />
                                {addonCredits} addon
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Trial Countdown */}
                      {isTrial && trialDaysRemaining > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
                          <Clock className="h-5 w-5 text-purple-500 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                              {trialDaysRemaining} days left in your trial
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {trialEndsAt
                                ? `Expires ${new Date(trialEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                                : 'Upgrade now to keep all features'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                            onClick={() => setUpgradeModalOpen(true)}
                          >
                            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                            Upgrade
                          </Button>
                        </div>
                      )}

                      {/* Change Plan Button */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="border-purple-500/20 hover:border-purple-500/40"
                          onClick={() => setUpgradeModalOpen(true)}
                        >
                          <ChevronRight className="h-4 w-4 mr-1" />
                          Change Plan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Trial Info (if trialing) */}
                  {isTrial && (
                    <Card className="mb-6 border-purple-500/10">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-purple-500" />
                          Trial Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-center">
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{trialDaysRemaining}</p>
                            <p className="text-xs text-muted-foreground">Days Remaining</p>
                          </div>
                          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-center">
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{creditsMonthly}</p>
                            <p className="text-xs text-muted-foreground">Trial Credits</p>
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-center">
                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">All</p>
                            <p className="text-xs text-muted-foreground">Pro Features</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          You have full access to all Pro features during your trial. Upgrade before it ends to keep your data and features.
                        </p>
                        <Button
                          className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
                          onClick={() => setUpgradeModalOpen(true)}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Upgrade to Pro
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Usage Summary */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Database className="h-4 w-4 text-purple-500" />
                        Usage This Month
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {creditsLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="space-y-1.5">
                              <Skeleton className="h-3 w-24" />
                              <Skeleton className="h-2 w-full" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {[
                            { label: 'Lead Discovery', used: Math.max(0, Math.round((creditsMonthly - credits) * 0.4)), total: Math.round(creditsMonthly * 0.4), color: 'bg-emerald-500' },
                            { label: 'Deep Analysis', used: Math.max(0, Math.round((creditsMonthly - credits) * 0.25)), total: Math.round(creditsMonthly * 0.25), color: 'bg-purple-500' },
                            { label: 'Outreach', used: Math.max(0, Math.round((creditsMonthly - credits) * 0.2)), total: Math.round(creditsMonthly * 0.2), color: 'bg-sky-500' },
                            { label: 'Other Actions', used: Math.max(0, Math.round((creditsMonthly - credits) * 0.15)), total: Math.round(creditsMonthly * 0.15), color: 'bg-amber-500' },
                          ].map((item) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{item.label}</span>
                                <span className="font-medium">{item.used} / {item.total}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${item.color} transition-all duration-500`}
                                  style={{ width: `${item.total > 0 ? Math.min(100, (item.used / item.total) * 100) : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Payment Method */}
                  <div className="mb-6">
                    <Label className="text-xs text-muted-foreground mb-2 block">Payment Method</Label>
                    <Card className="border-purple-500/10">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-12 rounded bg-muted flex items-center justify-center">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Not configured</p>
                            <p className="text-xs text-muted-foreground">Will be set up on first payment</p>
                          </div>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button variant="ghost" size="sm" className="text-muted-foreground" disabled>
                                  Update
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Available after first payment</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Credit Transaction History */}
                  <div className="mb-6">
                    <Label className="text-xs text-muted-foreground mb-2 block">Credit History</Label>
                    <Card className="border-purple-500/10">
                      {historyLoading ? (
                        <CardContent className="p-4 space-y-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Skeleton className="h-8 w-8 rounded-lg" />
                                <div className="space-y-1">
                                  <Skeleton className="h-3 w-32" />
                                  <Skeleton className="h-2 w-20" />
                                </div>
                              </div>
                              <Skeleton className="h-4 w-16" />
                            </div>
                          ))}
                        </CardContent>
                      ) : creditHistoryData?.entries && creditHistoryData.entries.length > 0 ? (
                        <div className="max-h-96 overflow-y-auto custom-scrollbar">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Credits</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Balance</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {creditHistoryData.entries.map((entry) => (
                                <TableRow key={entry.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className={`h-6 w-6 rounded-md flex items-center justify-center ${entry.credits > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                                        {entry.credits > 0 ? (
                                          <Plus className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                          <Zap className="h-3 w-3 text-red-500" />
                                        )}
                                      </div>
                                      <span className="text-xs font-medium truncate max-w-[120px] sm:max-w-none">
                                        {entry.description || entry.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </TableCell>
                                  <TableCell className={`text-xs font-semibold text-right ${entry.credits > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {entry.credits > 0 ? '+' : ''}{entry.credits}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground text-right hidden sm:table-cell">
                                    {entry.balance}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <CardContent className="p-6 text-center">
                          <Database className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No credit history yet</p>
                          <p className="text-xs text-muted-foreground">Credit transactions will appear here as you use features.</p>
                        </CardContent>
                      )}
                    </Card>
                  </div>

                  {/* Coupon Code */}
                  <div className="mb-6">
                    <Label className="text-xs text-muted-foreground mb-2 block">Coupon Code</Label>
                    <div className="flex gap-2 max-w-sm">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && couponCode.trim()) {
                            couponMutation.mutate(couponCode.trim());
                          }
                        }}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                      <Button
                        variant="outline"
                        className="border-purple-500/20 hover:border-purple-500/40 shrink-0"
                        disabled={!couponCode.trim() || couponMutation.isPending}
                        onClick={() => couponMutation.mutate(couponCode.trim())}
                      >
                        {couponMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Tag className="h-4 w-4 mr-1" />
                        )}
                        Apply
                      </Button>
                    </div>
                  </div>

                  {/* GST Number */}
                  <div className="mb-6">
                    <Label className="text-xs text-muted-foreground mb-2 block">GST Number (India)</Label>
                    <div className="flex gap-2 max-w-sm">
                      <Input
                        placeholder="e.g. 29AADCM1234F1Z5"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        className="border-purple-500/20 focus:ring-purple-500/30"
                      />
                      <Button
                        variant="outline"
                        className="border-purple-500/20 hover:border-purple-500/40 shrink-0"
                        onClick={() => {
                          // Save GST to profile (placeholder until profile API supports it)
                          toast.success('GST number saved');
                        }}
                      >
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Required for Indian businesses to claim GST input credit on invoices.</p>
                  </div>

                  {/* Credit Add-ons */}
                  <div id="credit-addons-section">
                    <Label className="text-xs text-muted-foreground mb-3 block">Quick Credit Add-ons</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {CREDIT_ADDON_PACKS.map((addon) => {
                        const isProcessing = processingAddonId === addon.addonId || addonMutation.isPending;
                        return (
                          <Button
                            key={addon.addonId}
                            variant="outline"
                            className="h-auto py-3 flex-col gap-1 border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/5 relative"
                            disabled={isProcessing}
                            onClick={async () => {
                              setProcessingAddonId(addon.addonId);
                              addonMutation.mutate(addon.addonId, {
                                onSettled: () => setProcessingAddonId(null),
                              });
                            }}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
                            ) : (
                              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{addon.credits}</span>
                            )}
                            <span className="text-xs text-muted-foreground">credits</span>
                            <span className="text-sm font-medium">₹{addon.priceINR}</span>
                            <span className="text-[10px] text-muted-foreground">${addon.priceUSD}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                {/* ═══════════════ ACCOUNT ═══════════════ */}
                <TabsContent value="account" className="mt-0">
                  <SectionHeader icon={User} title="Account" description="Your account information" />

                  <div className="space-y-4">
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Email</p>
                            <p className="text-xs text-muted-foreground truncate">{profileForm.email}</p>
                          </div>
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Verified</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Plan</p>
                            <p className="text-xs text-muted-foreground capitalize">{currentPlan} Plan — {PLAN_DETAILS[currentPlan]?.priceUSD ? `$${PLAN_DETAILS[currentPlan].priceUSD}/month` : 'Free'}</p>
                          </div>
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">Active</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Member Since</p>
                            <p className="text-xs text-muted-foreground">January 15, 2025</p>
                          </div>
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Last Login</p>
                            <p className="text-xs text-muted-foreground">March 1, 2025 at 09:14 AM</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══════════════ INTEGRATIONS ═══════════════ */}
                <TabsContent value="integrations" className="mt-0">
                  <SectionHeader icon={Plug} title="Integrations" description="Connect your communication channels" />

                  <div className="space-y-4">
                    {/* Gmail Card */}
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                              <Mail className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">Gmail</p>
                                {currentPlan === 'free' && (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                                    Pro+
                                  </Badge>
                                )}
                                {currentPlan !== 'free' && (
                                  <Badge
                                    className={gmailConnected
                                      ? 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5'
                                      : 'text-muted-foreground border-muted'}
                                  >
                                    {gmailConnected ? 'Connected' : 'Not Connected'}
                                  </Badge>
                                )}
                              </div>
                              {gmailConnected ? (
                                <p className="text-xs text-muted-foreground mt-0.5">{gmailEmail}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground mt-0.5">Send outreach via your Gmail account</p>
                              )}
                            </div>
                          </div>
                          {currentPlan === 'free' ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                              <Lock className="h-3 w-3 mr-1" />
                              Pro+ feature
                            </Badge>
                          ) : gmailConnected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500/20 hover:bg-red-500/5 shrink-0"
                              onClick={handleGmailDisconnect}
                            >
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                              onClick={() => setGmailConsentOpen(true)}
                            >
                              Connect Gmail
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Gmail Consent Dialog */}
                    <Dialog open={gmailConsentOpen} onOpenChange={setGmailConsentOpen}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-red-500" />
                            </div>
                            Connect Gmail Account
                          </DialogTitle>
                          <DialogDescription>
                            Grant AcquisitionOS permission to access your Gmail account for sending outreach emails.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                            <p className="text-sm font-medium mb-2">What you&apos;re consenting to:</p>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>Send outreach emails on your behalf</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>Read email replies to track responses</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>Manage email drafts for review before sending</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <span>We will <strong>never</strong> delete your emails</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <span>We will <strong>never</strong> modify your contacts</span>
                              </li>
                            </ul>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            You can revoke access at any time from your Google Account settings or by disconnecting here.
                          </p>
                        </div>
                        <DialogFooter className="flex-col sm:flex-row gap-2">
                          <Button variant="outline" onClick={() => setGmailConsentOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleGmailConnect} className="bg-red-600 hover:bg-red-700 text-white">
                            <Mail className="h-4 w-4 mr-2" />
                            Continue with Google
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Telegram Card */}
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                              <Send className="h-5 w-5 text-sky-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">Telegram</p>
                                {currentPlan === 'free' ? (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                                    Pro+
                                  </Badge>
                                ) : (
                                  <Badge
                                    className={telegramConnected
                                      ? 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5'
                                      : 'text-muted-foreground border-muted'}
                                  >
                                    {telegramConnected ? 'Connected' : 'Not Connected'}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {telegramConnected
                                  ? `Chat ID: ${telegramChatId}`
                                  : 'Receive notifications and control via Telegram bot'}
                              </p>
                            </div>
                          </div>
                          {currentPlan === 'free' ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                              <Lock className="h-3 w-3 mr-1" />
                              Pro+ feature
                            </Badge>
                          ) : telegramConnected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500/20 hover:bg-red-500/5 shrink-0"
                              onClick={handleTelegramDisconnect}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Unlink
                            </Button>
                          ) : null}
                        </div>

                        {currentPlan !== 'free' && !telegramConnected && (
                          <div className="space-y-3 ml-13">
                            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground mb-1">Setup Instructions:</p>
                              <ol className="list-decimal list-inside space-y-1 text-xs">
                                <li>Open <span className="font-mono text-sky-500">@AcquisitionOSBot</span> on Telegram</li>
                                <li>Send <span className="font-mono text-sky-500">/start CODE</span> where CODE is your link code</li>
                                <li>Generate a link code below</li>
                              </ol>
                            </div>
                            <div className="flex items-center gap-2">
                              {telegramCodeGenerated && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                                  <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">{telegramCode}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => navigator.clipboard.writeText(telegramCode).then(() => toast.success('Copied to clipboard'))}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-sky-500/20 hover:border-sky-500/40 text-sky-600 hover:text-sky-700"
                                onClick={telegramCodeGenerated ? handleTelegramConnect : handleGenerateTelegramCode}
                              >
                                {telegramCodeGenerated ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    Verify Connection
                                  </>
                                ) : (
                                  <>
                                    <Key className="h-3.5 w-3.5 mr-1.5" />
                                    Generate Link Code
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {currentPlan === 'free' && (
                          <div className="mt-3">
                            <PlanGate requiredPlan="pro" featureName="Telegram Integration">{null}</PlanGate>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* WhatsApp Card */}
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                              <MessageCircle className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">WhatsApp</p>
                                {currentPlan === 'free' ? (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                                    Pro+
                                  </Badge>
                                ) : currentPlan === 'pro' ? (
                                  <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px] px-1.5 py-0">
                                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                                    Elite for unlimited
                                  </Badge>
                                ) : (
                                  <Badge
                                    className={whatsappConnected
                                      ? 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5'
                                      : 'text-muted-foreground border-muted'}
                                  >
                                    {whatsappConnected ? 'Connected' : 'Not Connected'}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {whatsappConnected
                                  ? `Connected: ${whatsappPhone}`
                                  : 'Connect via phone number with OTP verification'}
                              </p>
                            </div>
                          </div>
                          {currentPlan === 'free' ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                              <Lock className="h-3 w-3 mr-1" />
                              Pro+ feature
                            </Badge>
                          ) : currentPlan === 'pro' ? (
                            <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 shrink-0">
                              <Lock className="h-3 w-3 mr-1" />
                              Elite for unlimited
                            </Badge>
                          ) : whatsappConnected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500/20 hover:bg-red-500/5 shrink-0"
                              onClick={handleWhatsappDisconnect}
                            >
                              Disconnect
                            </Button>
                          ) : null}
                        </div>

                        {currentPlan === 'elite' && !whatsappConnected && (
                          <div className="space-y-3 ml-13">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground shrink-0">Phone</Label>
                              <Input
                                placeholder="+1 234 567 8900"
                                value={whatsappPhone}
                                onChange={(e) => setWhatsappPhone(e.target.value)}
                                className="border-emerald-500/20 focus:ring-emerald-500/30 max-w-[200px]"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-500/20 hover:border-emerald-500/40 text-emerald-600 hover:text-emerald-700"
                                onClick={handleSendWhatsappOtp}
                              >
                                Send OTP
                              </Button>
                            </div>
                            {whatsappOtpSent && (
                              <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground shrink-0">OTP</Label>
                                <Input
                                  placeholder="Enter OTP"
                                  value={whatsappOtp}
                                  onChange={(e) => setWhatsappOtp(e.target.value)}
                                  maxLength={6}
                                  className="border-emerald-500/20 focus:ring-emerald-500/30 max-w-[140px]"
                                />
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={handleVerifyWhatsappOtp}
                                >
                                  Verify
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {currentPlan === 'free' && (
                          <div className="mt-3">
                            <PlanGate requiredPlan="pro" featureName="WhatsApp Integration">{null}</PlanGate>
                          </div>
                        )}

                        {currentPlan === 'pro' && (
                          <div className="mt-3">
                            <div className="rounded-lg border border-dashed border-purple-500/20 bg-purple-500/5 p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">
                                You have limited WhatsApp messaging on Pro.
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Upgrade to <span className="font-semibold text-purple-600 dark:text-purple-400">Elite</span> for unlimited WhatsApp messaging.
                              </p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══════════════ NOTIFICATIONS (Enhanced) ═══════════════ */}
                <TabsContent value="notifications" className="mt-0">
                  <SectionHeader icon={Bell} title="Notifications" description="Manage how you receive notifications" />

                  {/* Quick Notification Toggles */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-purple-500" />
                        Notification Channels
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Email Notifications</p>
                            <p className="text-xs text-muted-foreground">Receive notifications via email</p>
                          </div>
                        </div>
                        <Switch
                          checked={emailNotifications}
                          onCheckedChange={(v) => {
                            setEmailNotifications(v);
                            toast.success(v ? 'Email notifications enabled' : 'Email notifications disabled');
                          }}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Bell className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Push Notifications</p>
                            <p className="text-xs text-muted-foreground">Receive push notifications in your browser</p>
                          </div>
                        </div>
                        <Switch
                          checked={pushNotifications}
                          onCheckedChange={(v) => {
                            setPushNotifications(v);
                            toast.success(v ? 'Push notifications enabled' : 'Push notifications disabled');
                          }}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <MailWarning className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Weekly Digest</p>
                            <p className="text-xs text-muted-foreground">Get a weekly summary of your pipeline activity</p>
                          </div>
                        </div>
                        <Switch
                          checked={weeklyDigest}
                          onCheckedChange={(v) => {
                            setWeeklyDigest(v);
                            toast.success(v ? 'Weekly digest enabled' : 'Weekly digest disabled');
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notification Type Prefs */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Zap className="h-4 w-4 text-purple-500" />
                        Notification Types
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {NOTIFICATION_TYPES.map((nt) => {
                          const Icon = nt.icon;
                          return (
                            <div key={nt.key} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{nt.label}</span>
                              </div>
                              <Switch
                                checked={notificationPrefs[nt.key] ?? false}
                                onCheckedChange={() => toggleNotificationPref(nt.key)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Test Notification */}
                  <Button onClick={handleTestNotification} variant="outline" className="border-purple-500/20 hover:border-purple-500/40">
                    <Bell className="h-4 w-4 mr-2" />
                    Send Test Notification
                  </Button>
                </TabsContent>

                {/* ═══════════════ DATA MANAGEMENT ═══════════════ */}
                <TabsContent value="data" className="mt-0">
                  <SectionHeader icon={Database} title="Data Management" description="Export, import, and manage your data" />

                  <div className="space-y-4">
                    {/* Export All Data */}
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center mt-0.5">
                              <Download className="h-5 w-5 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Export All Data</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Download all your leads, deals, communications, and account data as CSV files.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-purple-500/20 hover:bg-purple-500/10 text-purple-600 shrink-0"
                            onClick={handleExportData}
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Export
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Import Data */}
                    <Card className="border-purple-500/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center mt-0.5">
                              <FileUp className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Import Data</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Import leads from a CSV file. Make sure your file matches the expected format.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-amber-500/20 hover:bg-amber-500/10 text-amber-600 shrink-0"
                            onClick={() => toast.info('Navigate to the Leads or Discover tab to import CSV')}
                          >
                            <FileUp className="h-3.5 w-3.5 mr-1.5" />
                            Import
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Clear All Data */}
                    <Card className="border-red-500/20 bg-red-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center mt-0.5">
                              <Trash2 className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Clear All Data</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Delete all leads, deals, and communications. This action cannot be undone.
                              </p>
                            </div>
                          </div>
                          <AlertDialog open={clearDataOpen} onOpenChange={setClearDataOpen}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-500/20 hover:bg-red-500/10 text-red-600 shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Clear
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-red-500" />
                                  Clear All Data?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete all leads, deals, communications, and activities from your account. This action is <strong>irreversible</strong>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-500 hover:bg-red-600 text-white"
                                  onClick={() => {
                                    toast.error('Data clearing is disabled in demo mode.');
                                    setClearDataOpen(false);
                                  }}
                                >
                                  Clear All Data
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══════════════ SECURITY ═══════════════ */}
                <TabsContent value="security" className="mt-0">
                  <SectionHeader icon={Shield} title="Security" description="Protect your account" />

                  {/* Password Change */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lock className="h-4 w-4 text-purple-500" />
                        Change Password
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Current Password</Label>
                        <div className="relative">
                          <Input
                            type={showCurrentPassword ? 'text' : 'password'}
                            placeholder="Enter current password"
                            className="border-purple-500/20 focus:ring-purple-500/30 pr-10"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          >
                            {showCurrentPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">New Password</Label>
                        <div className="relative">
                          <Input
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="Enter new password"
                            className="border-purple-500/20 focus:ring-purple-500/30 pr-10"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Confirm New Password</Label>
                        <Input
                          type="password"
                          placeholder="Confirm new password"
                          className="border-purple-500/20 focus:ring-purple-500/30"
                        />
                      </div>
                      <Button
                        onClick={handlePasswordChange}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        Update Password
                      </Button>
                    </CardContent>
                  </Card>

                  {/* MFA/TOTP */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-purple-500" />
                        Two-Factor Authentication
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-medium">Authenticator App (TOTP)</p>
                          <p className="text-xs text-muted-foreground">Use Google Authenticator or similar</p>
                        </div>
                        <Switch
                          checked={mfaEnabled}
                          onCheckedChange={(v) => {
                            setMfaEnabled(v);
                            toast.success(v ? 'MFA enabled' : 'MFA disabled');
                          }}
                        />
                      </div>
                      {mfaEnabled && (
                        <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3 text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground text-sm">Setup Instructions:</p>
                          <ol className="list-decimal list-inside space-y-1">
                            <li>Install Google Authenticator or Authy</li>
                            <li>Scan the QR code (shown on next screen)</li>
                            <li>Enter the 6-digit code to verify</li>
                            <li>Save your backup codes in a secure location</li>
                          </ol>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Login History */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4 text-purple-500" />
                        Login History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loginHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No login history available</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>IP</TableHead>
                              <TableHead>Country</TableHead>
                              <TableHead className="hidden sm:table-cell">Device</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {loginHistory.map((entry, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{entry.date}</TableCell>
                                <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
                                <TableCell className="text-xs">{entry.country}</TableCell>
                                <TableCell className="text-xs hidden sm:table-cell">{entry.device}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Active Sessions */}
                  <Card className="mb-6 border-purple-500/10">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Globe className="h-4 w-4 text-purple-500" />
                          Active Sessions
                        </CardTitle>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-red-500 border-red-500/20 hover:bg-red-500/5 text-xs">
                              Sign out all devices
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sign out all devices?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will sign you out of all devices except the current one. You will need to log in again on other devices.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white" onClick={() => toast.success('Signed out of all devices')}>
                                Sign Out All
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {activeSessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No active sessions</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeSessions.map((session, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                  <Globe className="h-4 w-4 text-purple-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium flex items-center gap-2">
                                    {session.device}
                                    {session.current && (
                                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                        Current
                                      </Badge>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{session.location} · {session.lastActive}</p>
                                </div>
                              </div>
                              {!session.current && (
                                <Button variant="ghost" size="sm" className="text-red-500 text-xs h-7">
                                  Revoke
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ═══════════════ TEAM ═══════════════ */}
                <TabsContent value="team" className="mt-0">
                  {currentPlan !== 'elite' ? (
                    <LocalPlanGate feature="Team management" currentPlan={currentPlan} />
                  ) : (
                    <>
                      <SectionHeader icon={Users} title="Team" description="Manage team members and invitations" />

                      {/* Team Members */}
                      <Card className="mb-6 border-purple-500/10">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Team Members</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {teamMembers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">No team members</p>
                              <p className="text-xs text-muted-foreground mt-1">Invite team members to get started.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {teamMembers.map((member, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                  <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-400">
                                      {member.avatar}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{member.name}</p>
                                      <p className="text-xs text-muted-foreground">{member.email}</p>
                                    </div>
                                  </div>
                                  <Badge
                                    className={
                                      member.role === 'owner'
                                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                        : member.role === 'admin'
                                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                          : 'bg-muted text-muted-foreground border-muted'
                                    }
                                  >
                                    {member.role}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Invite Member */}
                      <Card className="mb-6 border-purple-500/10">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Plus className="h-4 w-4 text-purple-500" />
                            Invite Member
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Input
                              placeholder="email@example.com"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              className="border-purple-500/20 focus:ring-purple-500/30 flex-1"
                            />
                            <Select value={inviteRole} onValueChange={setInviteRole}>
                              <SelectTrigger className="border-purple-500/20 focus:ring-purple-500/30 w-full sm:w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                              onClick={() => {
                                if (!inviteEmail) {
                                  toast.error('Enter an email address');
                                  return;
                                }
                                toast.success(`Invitation sent to ${inviteEmail}`);
                                setInviteEmail('');
                              }}
                            >
                              <Send className="h-4 w-4 mr-1.5" />
                              Invite
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Pending Invitations */}
                      <Card className="border-purple-500/10">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Pending Invitations</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {pendingInvites.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <Mail className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">No pending invitations</p>
                              <p className="text-xs text-muted-foreground mt-1">Send an invite using the form above.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {pendingInvites.map((inv, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                  <div>
                                    <p className="text-sm font-medium">{inv.email}</p>
                                    <p className="text-xs text-muted-foreground">Sent {inv.sentAt}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 capitalize">
                                      {inv.role}
                                    </Badge>
                                    <Button variant="ghost" size="sm" className="text-red-500 h-7 text-xs">
                                      Revoke
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>

                {/* ═══════════════ DEVELOPER ═══════════════ */}
                <TabsContent value="developer" className="mt-0">
                  <ApiKeysPanel />
                </TabsContent>

                {/* ═══════════════ DANGER ZONE ═══════════════ */}
                <TabsContent value="danger" className="mt-0">
                  <SectionHeader icon={AlertTriangle} title="Danger Zone" description="Irreversible and destructive actions" />

                  <div className="space-y-4 rounded-xl border-2 border-red-500/20 bg-gradient-to-b from-red-500/[0.02] to-red-500/[0.04] p-4 sm:p-5 relative overflow-hidden">
                    {/* Warning stripe pattern */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500/40 via-amber-500/40 to-red-500/40" />
                    {/* Re-run Onboarding */}
                    <Card className="border-purple-500/20 bg-purple-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center mt-0.5">
                              <Rocket className="h-5 w-5 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Re-run Onboarding</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Walk through the setup wizard again to update your preferences and target markets.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-purple-500/20 hover:bg-purple-500/10 text-purple-600 shrink-0"
                            onClick={() => {
                              localStorage.removeItem('acquisitionos_onboarding_completed');
                              localStorage.removeItem('acquisitionos_onboarding_data');
                              onOpenChange(false);
                              if (onShowOnboarding) {
                                setTimeout(() => onShowOnboarding(), 150);
                              }
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Restart
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Export Data */}
                    <Card className="border-amber-500/20 bg-amber-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center mt-0.5">
                              <Download className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Export My Data</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Download a copy of all your data (GDPR right to access). Includes leads, deals, communications, and account info.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-amber-500/20 hover:bg-amber-500/10 text-amber-600 shrink-0"
                            onClick={handleExportData}
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Export
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Delete Account */}
                    <Card className="border-red-500/20 bg-red-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center mt-0.5">
                              <Trash2 className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Delete Account</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Permanently delete your account and all associated data. This action cannot be undone.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-500/20 hover:bg-red-500/10 text-red-600 shrink-0 opacity-60 cursor-not-allowed"
                            disabled
                            title="Contact support to delete your account"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </Button>
                        </div>
                        <div className="mt-4 rounded-lg bg-muted/50 border border-border p-3">
                          <p className="text-xs text-muted-foreground flex items-start gap-2">
                            <Lock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/60" />
                            To delete your account, please contact our support team at <span className="font-medium text-purple-600 dark:text-purple-400">support@acquisitionos.com</span>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

              </div>
            </ScrollArea>
          </div>
        </Tabs>
      </SheetContent>
      {/* Upgrade Modal */}
      <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />

    </Sheet>
  );
}
