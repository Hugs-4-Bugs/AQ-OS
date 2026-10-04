'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  CalendarDays,
  Bell,
  Video,
  Shield,
  ShieldAlert,
  Zap,
  MonitorSmartphone,
  MessageSquare,
  Link2,
  Phone,
  MapPin,
  Mail,
  RefreshCw,
  Radio,
  Info,
  Plus,
  X,
  AlertTriangle,
} from 'lucide-react';

// ── Types ──

interface MeetingSettings {
  meetingPlatform: string;
  meetingDurationDefault: number;
  meetingBufferMinutes: number;
  meetingWorkingHoursStart: string;
  meetingWorkingHoursEnd: string;
  meetingWorkingDays: number[];
  meetingTimezone: string;
  meetingAutoSchedule: boolean;
  meetingAutonomyMode: string;
  meetingRemindersEnabled: boolean;
  meetingReminderMinutes: number[];
  meetingEmailConfirmation: boolean;
  meetingEmailReminder: boolean;
  calendarSyncEnabled: boolean;
  calendarWatchEnabled: boolean;
  googleCalendarConnected: boolean;
}

// ── Constants ──

const PLATFORM_OPTIONS = [
  { value: 'google_meet', label: 'Google Meet', description: 'Integrated with Google Calendar', icon: Video },
  { value: 'zoom', label: 'Zoom', description: 'Coming soon', icon: MonitorSmartphone, disabled: true },
  { value: 'teams', label: 'Microsoft Teams', description: 'Coming soon', icon: MessageSquare, disabled: true },
  { value: 'custom', label: 'Custom URL', description: 'Use your own meeting link', icon: Link2 },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];

const DAY_LABELS = [
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
  { value: 7, label: 'Sun', full: 'Sunday' },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

const REMINDER_PRESET_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 1440, label: '1 day' },
];

const AUTONOMY_MODES = [
  {
    value: 'approval',
    label: 'Approval Mode',
    description: 'AI suggests meetings, but you must approve each one before it\'s scheduled.',
    icon: Shield,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    badgeLabel: 'Safest',
  },
  {
    value: 'assisted',
    label: 'Assisted Mode',
    description: 'AI auto-schedules meetings and notifies you for review. You can override anytime.',
    icon: Zap,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-700',
    badgeLabel: 'Balanced',
  },
  {
    value: 'autonomous',
    label: 'Autonomous Mode',
    description: 'AI auto-schedules and manages meetings without approval. Full automation.',
    icon: ShieldAlert,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeColor: 'bg-red-100 text-red-700',
    badgeLabel: 'Use with caution',
    warning: true,
  },
] as const;

// ── Component ──

export default function MeetingSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<MeetingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAutonomyMode, setPendingAutonomyMode] = useState<string | null>(null);

  // Form state
  const [platform, setPlatform] = useState('google_meet');
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(15);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timezone, setTimezone] = useState('UTC');
  const [autonomyMode, setAutonomyMode] = useState('approval');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState<number[]>([10, 60]);
  const [emailConfirmation, setEmailConfirmation] = useState(true);
  const [emailReminder, setEmailReminder] = useState(true);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(true);
  const [calendarWatchEnabled, setCalendarWatchEnabled] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      const s = data.settings as MeetingSettings;
      setSettings(s);
      setPlatform(s.meetingPlatform);
      setDuration(s.meetingDurationDefault);
      setBuffer(s.meetingBufferMinutes);
      setWorkStart(s.meetingWorkingHoursStart);
      setWorkEnd(s.meetingWorkingHoursEnd);
      setWorkingDays(s.meetingWorkingDays);
      setTimezone(s.meetingTimezone);
      setAutonomyMode(s.meetingAutonomyMode);
      setRemindersEnabled(s.meetingRemindersEnabled);
      setReminderMinutes(s.meetingReminderMinutes);
      setEmailConfirmation(s.meetingEmailConfirmation);
      setEmailReminder(s.meetingEmailReminder);
      setCalendarSyncEnabled(s.calendarSyncEnabled);
      setCalendarWatchEnabled(s.calendarWatchEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggleWorkingDay = (day: number) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addReminderMinute = (value: number) => {
    if (!reminderMinutes.includes(value)) {
      setReminderMinutes((prev) => [...prev, value].sort((a, b) => a - b));
    }
  };

  const removeReminderMinute = (value: number) => {
    setReminderMinutes((prev) => prev.filter((m) => m !== value));
  };

  const handleAutonomyModeChange = (mode: string) => {
    if (mode === 'autonomous') {
      setPendingAutonomyMode(mode);
    } else {
      setAutonomyMode(mode);
    }
  };

  const confirmAutonomousMode = () => {
    setAutonomyMode('autonomous');
    setPendingAutonomyMode(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      if (workStart >= workEnd) {
        throw new Error('Working hours end must be after start');
      }
      if (workingDays.length === 0) {
        throw new Error('Select at least one working day');
      }

      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingPlatform: platform,
          meetingDurationDefault: duration,
          meetingBufferMinutes: buffer,
          meetingWorkingHoursStart: workStart,
          meetingWorkingHoursEnd: workEnd,
          meetingWorkingDays: workingDays,
          meetingTimezone: timezone,
          meetingAutonomyMode: autonomyMode,
          meetingRemindersEnabled: remindersEnabled,
          meetingReminderMinutes: reminderMinutes,
          meetingEmailConfirmation: emailConfirmation,
          meetingEmailReminder: emailReminder,
          calendarSyncEnabled: calendarSyncEnabled,
          calendarWatchEnabled: calendarWatchEnabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const res = await fetch('/api/calendar/connect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to connect');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setError('Failed to initiate Google Calendar connection');
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      const res = await fetch('/api/calendar/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect');
      fetchSettings();
    } catch {
      setError('Failed to disconnect Google Calendar');
    }
  };

  // ── Loading State ──

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/meetings')}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Meeting Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure your meeting preferences, autonomy mode, and calendar integration
            </p>
          </div>
        </div>

        {/* ── Success / Error Messages ── */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            Settings saved successfully
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Section 1: Meeting Platform
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Video className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Meeting Platform</CardTitle>
                <CardDescription>Choose your preferred video conferencing platform</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORM_OPTIONS.map((opt) => {
                const IconComp = opt.icon;
                const isSelected = platform === opt.value;
                const isDisabled = opt.disabled;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setPlatform(opt.value)}
                    className={`
                      relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
                      ${isSelected
                        ? 'border-teal-500 bg-teal-50/50 shadow-sm'
                        : isDisabled
                          ? 'border-gray-100 bg-gray-50/50 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer'
                      }
                    `}
                  >
                    <div className={`
                      h-10 w-10 rounded-lg flex items-center justify-center shrink-0
                      ${isSelected ? 'bg-teal-100' : 'bg-gray-100'}
                    `}>
                      <IconComp className={`h-5 w-5 ${isSelected ? 'text-teal-600' : 'text-gray-500'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isSelected ? 'text-teal-900' : 'text-gray-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{opt.description}</p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    {isDisabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Soon</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            Section 2: Default Meeting Settings
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Clock className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Default Meeting Settings</CardTitle>
                <CardDescription>Duration, buffer time, and timezone for new meetings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration" className="text-sm font-medium">Duration</Label>
                <Select
                  value={String(duration)}
                  onValueChange={(v) => setDuration(Number(v))}
                >
                  <SelectTrigger id="duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer" className="text-sm font-medium">Buffer Time</Label>
                <Input
                  id="buffer"
                  type="number"
                  min={0}
                  max={120}
                  value={buffer}
                  onChange={(e) => setBuffer(Number(e.target.value))}
                  placeholder="Minutes"
                />
                <p className="text-xs text-gray-500">Between meetings (min)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-sm font-medium">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            Section 3: Working Hours
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Working Hours</CardTitle>
                <CardDescription>Define your available hours for meeting scheduling</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workStart" className="text-sm font-medium">Start Time</Label>
                <Input
                  id="workStart"
                  type="time"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workEnd" className="text-sm font-medium">End Time</Label>
                <Input
                  id="workEnd"
                  type="time"
                  value={workEnd}
                  onChange={(e) => setWorkEnd(e.target.value)}
                />
              </div>
            </div>

            {workStart >= workEnd && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                End time must be after start time
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Working Days</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((day) => {
                  const isActive = workingDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWorkingDay(day.value)}
                      className={`
                        h-10 min-w-[48px] px-3 rounded-lg border-2 text-sm font-medium transition-all
                        ${isActive
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }
                      `}
                      aria-label={`Toggle ${day.full}`}
                    >
                      <span className="hidden sm:inline">{day.full}</span>
                      <span className="sm:hidden">{day.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                {workingDays.length} day{workingDays.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            Section 4: Autonomy Mode
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Radio className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Autonomy Mode</CardTitle>
                <CardDescription>Control how the AI schedules and manages your meetings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <RadioGroup
              value={autonomyMode}
              onValueChange={handleAutonomyModeChange}
              className="space-y-3"
            >
              {AUTONOMY_MODES.map((mode) => {
                const IconComp = mode.icon;
                const isSelected = autonomyMode === mode.value;

                return (
                  <label
                    key={mode.value}
                    className={`
                      relative flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${isSelected
                        ? `${mode.borderColor} ${mode.bgColor} shadow-sm`
                        : 'border-gray-200 bg-white hover:border-gray-300'
                      }
                    `}
                  >
                    <RadioGroupItem value={mode.value} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isSelected ? mode.bgColor : 'bg-gray-100'}`}>
                          <IconComp className={`h-4 w-4 ${isSelected ? mode.color : 'text-gray-500'}`} />
                        </div>
                        <p className={`text-sm font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                          {mode.label}
                        </p>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${mode.badgeColor}`}>
                          {mode.badgeLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                        {mode.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            {/* Autonomous Mode Confirmation Dialog */}
            <AlertDialog open={pendingAutonomyMode === 'autonomous'} onOpenChange={(open) => !open && setPendingAutonomyMode(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    Enable Autonomous Mode?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 pt-2">
                    <p>
                      In <strong>Autonomous Mode</strong>, the AI will automatically schedule and manage
                      meetings without requiring your approval. This includes:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Auto-scheduling meetings when leads express interest</li>
                      <li>Sending confirmation emails on your behalf</li>
                      <li>Rescheduling meetings based on conflicts</li>
                      <li>Managing calendar invites automatically</li>
                    </ul>
                    <p className="text-red-600 font-medium">
                      You will not be asked to approve these actions before they happen.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingAutonomyMode(null)}>
                    Keep Current Mode
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmAutonomousMode}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    I Understand, Enable Autonomous
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            Section 5: Notification Settings
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Bell className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Notification Settings</CardTitle>
                <CardDescription>Configure reminders and email notifications</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            {/* Reminders Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Meeting Reminders</p>
                  <p className="text-xs text-gray-500">Get notified before your meetings start</p>
                </div>
              </div>
              <Switch
                checked={remindersEnabled}
                onCheckedChange={setRemindersEnabled}
              />
            </div>

            {/* Reminder Minutes */}
            {remindersEnabled && (
              <div className="space-y-3 pl-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Remind me before</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Add or remove reminder times. <br/>Click the X to remove a time.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="flex flex-wrap gap-2">
                  {reminderMinutes.map((mins) => (
                    <Badge
                      key={mins}
                      variant="secondary"
                      className="pl-2.5 pr-1.5 py-1 text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200"
                    >
                      {mins >= 1440
                        ? `${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) > 1 ? 's' : ''}`
                        : mins >= 60
                          ? `${mins / 60} hour${mins / 60 > 1 ? 's' : ''}`
                          : `${mins} min`
                      }
                      <button
                        type="button"
                        onClick={() => removeReminderMinute(mins)}
                        className="ml-1.5 h-4 w-4 rounded-full hover:bg-teal-200 inline-flex items-center justify-center transition-colors"
                        aria-label={`Remove ${mins} minute reminder`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {reminderMinutes.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No reminders set</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_PRESET_OPTIONS.filter((opt) => !reminderMinutes.includes(opt.value)).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => addReminderMinute(opt.value)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-md hover:border-teal-300 hover:text-teal-600 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Email Confirmation */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Email Confirmation</p>
                  <p className="text-xs text-gray-500">Send confirmation emails to attendees when meetings are scheduled</p>
                </div>
              </div>
              <Switch
                checked={emailConfirmation}
                onCheckedChange={setEmailConfirmation}
              />
            </div>

            {/* Email Reminder */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Email Reminders</p>
                  <p className="text-xs text-gray-500">Send reminder emails to attendees before meetings</p>
                </div>
              </div>
              <Switch
                checked={emailReminder}
                onCheckedChange={setEmailReminder}
              />
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            Section 6: Calendar Sync Settings
        ══════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Globe className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Calendar Sync</CardTitle>
                <CardDescription>Google Calendar integration and sync preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            {/* Google Calendar Connection */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${settings?.googleCalendarConnected ? 'bg-green-50' : 'bg-gray-100'}`}>
                  <CalendarDays className={`h-4 w-4 ${settings?.googleCalendarConnected ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700">Google Calendar</p>
                    <div className={`h-2 w-2 rounded-full ${settings?.googleCalendarConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {settings?.googleCalendarConnected
                      ? 'Connected and syncing'
                      : 'Connect to enable availability checking and Meet integration'}
                  </p>
                </div>
              </div>
              {settings?.googleCalendarConnected ? (
                <Button variant="outline" size="sm" onClick={handleDisconnectCalendar}>
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={handleConnectCalendar} className="bg-teal-600 hover:bg-teal-700">
                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                  Connect
                </Button>
              )}
            </div>

            {/* Calendar Sync Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center">
                  <RefreshCw className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Sync Meetings to Calendar</p>
                  <p className="text-xs text-gray-500">
                    Automatically create calendar events for scheduled meetings
                  </p>
                </div>
              </div>
              <Switch
                checked={calendarSyncEnabled}
                onCheckedChange={setCalendarSyncEnabled}
                disabled={!settings?.googleCalendarConnected}
              />
            </div>

            {/* Calendar Watch / Push Notifications Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Push Notifications</p>
                  <p className="text-xs text-gray-500">
                    Get real-time updates when your Google Calendar changes
                  </p>
                </div>
              </div>
              <Switch
                checked={calendarWatchEnabled}
                onCheckedChange={setCalendarWatchEnabled}
                disabled={!settings?.googleCalendarConnected}
              />
            </div>

            {!settings?.googleCalendarConnected && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Connect Google Calendar first to enable sync and push notification features.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Save Button ── */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <p className="text-xs text-gray-400">
            Changes are applied when you save
          </p>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
