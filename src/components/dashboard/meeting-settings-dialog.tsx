'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings2,
  Clock,
  Calendar,
  Globe,
  Bell,
  Mail,
  Shield,
  Loader2,
  Sparkles,
  CheckCircle2,
  Zap,
  Video,
  Unlink,
  Link2,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ===== Types ===== */
type AutonomyMode = 'approval' | 'assisted' | 'autonomous';

interface MeetingSettings {
  meetingPlatform: string;
  meetingDurationDefault: number;
  meetingBufferMinutes: number;
  meetingWorkingHoursStart: string;
  meetingWorkingHoursEnd: string;
  meetingWorkingDays: number[];
  meetingTimezone: string;
  meetingAutoSchedule: boolean;
  googleCalendarConnected: boolean;
  calendarEmail?: string | null;
  autonomyMode?: AutonomyMode;
  emailConfirmations?: boolean;
  emailReminders?: boolean;
  calendarSync?: boolean;
  reminderMinutes?: string;
}

interface MeetingSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: () => void;
}

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const AUTONOMY_MODES: { id: AutonomyMode; label: string; icon: React.ElementType; desc: string; color: string }[] = [
  {
    id: 'approval',
    label: 'Approval Required',
    icon: Shield,
    desc: 'Every AI-suggested meeting needs your explicit approval before being scheduled.',
    color: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'assisted',
    label: 'Assisted',
    icon: Sparkles,
    desc: 'AI schedules meetings automatically, but notifies you and allows easy changes.',
    color: 'text-teal-600 bg-teal-500/10 border-teal-500/20',
  },
  {
    id: 'autonomous',
    label: 'Autonomous',
    icon: Zap,
    desc: 'AI fully manages your calendar. You only intervene for conflicts or special cases.',
    color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  },
];

const DEFAULT_SETTINGS: MeetingSettings = {
  meetingPlatform: 'google_meet',
  meetingDurationDefault: 30,
  meetingBufferMinutes: 15,
  meetingWorkingHoursStart: '09:00',
  meetingWorkingHoursEnd: '18:00',
  meetingWorkingDays: [1, 2, 3, 4, 5],
  meetingTimezone: 'UTC',
  meetingAutoSchedule: false,
  googleCalendarConnected: false,
  autonomyMode: 'approval',
  emailConfirmations: true,
  emailReminders: true,
  calendarSync: true,
  reminderMinutes: '10, 60',
};

/* ===== Component ===== */
export default function MeetingSettingsDialog({
  open,
  onOpenChange,
  onSettingsSaved,
}: MeetingSettingsDialogProps) {
  const [settings, setSettings] = useState<MeetingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testingAvailability, setTestingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<string | null>(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          ...data.settings,
          googleCalendarConnected: data.settings.googleCalendarConnected ?? false,
          calendarEmail: data.settings.calendarEmail ?? null,
          autonomyMode: data.settings.autonomyMode || data.settings.meetingAutonomyMode || 'approval',
          emailConfirmations: data.settings.emailConfirmations ?? data.settings.meetingEmailConfirmation ?? true,
          emailReminders: data.settings.emailReminders ?? data.settings.meetingEmailReminder ?? true,
          calendarSync: data.settings.calendarSync ?? data.settings.calendarSyncEnabled ?? true,
          reminderMinutes: data.settings.reminderMinutes || (Array.isArray(data.settings.meetingReminderMinutes) ? data.settings.meetingReminderMinutes.join(', ') : '10, 60'),
        }));
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (open) fetchSettings();
    return () => { cancelled = true; };
  }, [open, fetchSettings]);

  // Toggle working day
  const toggleWorkingDay = (day: number) => {
    setSettings(prev => ({
      ...prev,
      meetingWorkingDays: prev.meetingWorkingDays.includes(day)
        ? prev.meetingWorkingDays.filter(d => d !== day)
        : [...prev.meetingWorkingDays, day].sort(),
    }));
  };

  // FIX (2026-09-09): Real-time Google Calendar connect — redirects to OAuth.
  const handleConnectCalendar = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/calendar/connect', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start Google Calendar connection');
      }
      const data = await res.json();
      if (data.authUrl) {
        // Redirect the user to Google's OAuth consent screen.
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authorization URL returned');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect Google Calendar');
      setConnecting(false);
    }
  };

  // FIX (2026-09-09): Real-time Google Calendar disconnect.
  const handleDisconnectCalendar = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to disconnect');
      }
      toast.success('Google Calendar disconnected');
      setSettings(prev => ({ ...prev, googleCalendarConnected: false, calendarEmail: null }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect Google Calendar');
    } finally {
      setDisconnecting(false);
    }
  };

  // FIX (2026-09-09): Real-time availability test — verifies the
  // connected Google Calendar can be queried for free/busy right now.
  const handleTestAvailability = async () => {
    if (!settings.googleCalendarConnected) {
      toast.error('Connect Google Calendar first to test availability');
      return;
    }
    setTestingAvailability(true);
    setAvailabilityResult(null);
    try {
      // Check today's availability using the user's working hours window.
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const res = await fetch('/api/calendar/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: dateStr,
          durationMinutes: settings.meetingDurationDefault || 30,
          startHour: parseInt(settings.meetingWorkingHoursStart?.split(':')[0] || '9', 10),
          endHour: parseInt(settings.meetingWorkingHoursEnd?.split(':')[0] || '18', 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Availability check failed');
      }
      const available = data.availableCount ?? 0;
      const total = data.totalSlots ?? 0;
      setAvailabilityResult(`✓ Google Calendar reachable — ${available} available slot${available === 1 ? '' : 's'} found today (of ${total} total).`);
      toast.success(`Google Calendar is live — ${available} available slot${available === 1 ? '' : 's'} today`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Availability test failed';
      setAvailabilityResult(`✗ ${msg}`);
      toast.error(msg);
    } finally {
      setTestingAvailability(false);
    }
  };

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          meetingPlatform: settings.meetingPlatform,
          meetingDurationDefault: settings.meetingDurationDefault,
          meetingBufferMinutes: settings.meetingBufferMinutes,
          meetingWorkingHoursStart: settings.meetingWorkingHoursStart,
          meetingWorkingHoursEnd: settings.meetingWorkingHoursEnd,
          meetingWorkingDays: settings.meetingWorkingDays,
          meetingTimezone: settings.meetingTimezone,
          meetingAutoSchedule: settings.autonomyMode !== 'approval',
          meetingAutonomyMode: settings.autonomyMode,
          meetingEmailConfirmation: settings.emailConfirmations,
          meetingEmailReminder: settings.emailReminders,
          calendarSyncEnabled: settings.calendarSync,
          meetingReminderMinutes: (settings.reminderMinutes || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0),
        }),
      });

      if (res.ok) {
        toast.success('Meeting settings saved');
        if (onSettingsSaved) onSettingsSaved();
        onOpenChange(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save settings');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
              <Settings2 className="h-4 w-4" />
            </div>
            Meeting Settings
          </DialogTitle>
          <DialogDescription>
            Configure your meeting preferences, working hours, and automation
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* ── Autonomy Mode ── */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Autonomy Mode
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {AUTONOMY_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = settings.autonomyMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setSettings(prev => ({ ...prev, autonomyMode: mode.id }))}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center',
                        isActive
                          ? cn(mode.color, 'border-current ring-1 ring-current/20')
                          : 'border-border/40 hover:border-border/60 text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[11px] font-semibold">{mode.label}</span>
                      <span className="text-[9px] leading-tight opacity-70">{mode.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* ── Meeting Platform ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Default Platform
              </Label>
              <Select
                value={settings.meetingPlatform}
                onValueChange={(v) => setSettings(prev => ({ ...prev, meetingPlatform: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Duration & Buffer ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Default Duration
                </Label>
                <Select
                  value={settings.meetingDurationDefault.toString()}
                  onValueChange={(v) => setSettings(prev => ({ ...prev, meetingDurationDefault: parseInt(v) }))}
                >
                  <SelectTrigger className="h-9">
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
                <Label className="text-xs font-medium">Buffer Minutes</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.meetingBufferMinutes}
                  onChange={(e) => setSettings(prev => ({ ...prev, meetingBufferMinutes: parseInt(e.target.value) || 0 }))}
                  className="h-9"
                />
              </div>
            </div>

            {/* ── Working Hours ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Working Hours
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Start</span>
                  <Input
                    type="time"
                    value={settings.meetingWorkingHoursStart}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingWorkingHoursStart: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">End</span>
                  <Input
                    type="time"
                    value={settings.meetingWorkingHoursEnd}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingWorkingHoursEnd: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* ── Working Days ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Working Days</Label>
              <div className="flex items-center gap-1.5">
                {WEEKDAYS.map((day) => {
                  const isActive = settings.meetingWorkingDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      onClick={() => toggleWorkingDay(day.value)}
                      className={cn(
                        'w-9 h-9 rounded-lg text-[11px] font-semibold transition-all border',
                        isActive
                          ? 'bg-teal-500/10 text-teal-600 border-teal-500/30'
                          : 'bg-muted/20 text-muted-foreground border-border/30 hover:border-border/50'
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Timezone ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Timezone
              </Label>
              <Select
                value={settings.meetingTimezone}
                onValueChange={(v) => setSettings(prev => ({ ...prev, meetingTimezone: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* ── Email & Notifications ── */}
            <div className="space-y-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" />
                Notifications
              </Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Email Confirmations</Label>
                  <p className="text-[10px] text-muted-foreground">Send confirmation emails when meetings are scheduled</p>
                </div>
                <Switch
                  checked={settings.emailConfirmations}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, emailConfirmations: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Email Reminders</Label>
                  <p className="text-[10px] text-muted-foreground">Send reminder emails before meetings</p>
                </div>
                <Switch
                  checked={settings.emailReminders}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, emailReminders: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Bell className="h-3 w-3" />
                  Reminder Minutes
                </Label>
                <Input
                  value={settings.reminderMinutes}
                  onChange={(e) => setSettings(prev => ({ ...prev, reminderMinutes: e.target.value }))}
                  placeholder="e.g., 10, 60"
                  className="h-9"
                />
                <p className="text-[9px] text-muted-foreground">Comma-separated minutes before meeting (e.g., &quot;10, 60&quot;)</p>
              </div>
            </div>

            <Separator />

            {/* ── Google Calendar Integration (real-time config) ── */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Google Calendar & Meet
              </Label>
              <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/20 to-muted/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {settings.googleCalendarConnected ? (
                      <>
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-emerald-600 block">Google Calendar Connected</span>
                          {settings.calendarEmail ? (
                            <span className="text-[10px] text-muted-foreground truncate block max-w-[200px]">{settings.calendarEmail}</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-muted-foreground block">Google Calendar Not Connected</span>
                          <span className="text-[10px] text-muted-foreground">Connect to enable real-time availability & Meet links</span>
                        </div>
                      </>
                    )}
                  </div>
                  <Badge className={cn(
                    'text-[8px] border shrink-0',
                    settings.googleCalendarConnected
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  )}>
                    {settings.googleCalendarConnected ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {/* Action buttons — Connect / Disconnect / Test Availability */}
                <div className="flex flex-wrap items-center gap-2">
                  {settings.googleCalendarConnected ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px] gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={handleTestAvailability}
                        disabled={testingAvailability}
                      >
                        {testingAvailability ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Activity className="h-3 w-3" />
                        )}
                        Test Availability
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px] gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                        onClick={handleDisconnectCalendar}
                        disabled={disconnecting}
                      >
                        {disconnecting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Unlink className="h-3 w-3" />
                        )}
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-[11px] gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleConnectCalendar}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      Connect Google Calendar
                    </Button>
                  )}
                </div>

                {/* Availability test result */}
                {availabilityResult && (
                  <div className={cn(
                    'text-[10px] rounded-md px-2.5 py-1.5 border',
                    availabilityResult.startsWith('✓')
                      ? 'bg-emerald-500/5 text-emerald-700 border-emerald-500/20'
                      : 'bg-destructive/5 text-destructive border-destructive/20'
                  )}>
                    {availabilityResult}
                  </div>
                )}

                {/* Google Meet info note */}
                <div className="flex items-start gap-1.5 pt-1 text-[10px] text-muted-foreground">
                  <Video className="h-3 w-3 mt-0.5 shrink-0 text-teal-500" />
                  <span>
                    When Google Calendar is connected, scheduling a meeting automatically checks real-time
                    availability and generates a <strong className="text-foreground/80">Google Meet</strong> link
                    for the confirmed time.
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Calendar Sync toggle ── */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Calendar Sync
                </Label>
                <p className="text-[10px] text-muted-foreground">Sync meetings with your connected calendar</p>
              </div>
              <Switch
                checked={settings.calendarSync}
                onCheckedChange={(v) => setSettings(prev => ({ ...prev, calendarSync: v }))}
              />
            </div>

            <Separator />

            {/* ── Action Buttons ── */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs bg-teal-600 hover:bg-teal-700 gap-1.5"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
