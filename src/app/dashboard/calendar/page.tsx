'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  CalendarDays,
  Globe,
  RefreshCw,
  Clock,
  Video,
  Phone,
  MapPin,
  Users,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  ChevronRight,
  Bell,
  BellOff,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  CalendarHeart,
  Undo2,
} from 'lucide-react';
import {
  format,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  parseISO,
  isValid,
} from 'date-fns';

// ── Types ──

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  hangoutLink?: string;
  status?: string;
  meetingType?: string;
}

interface BusySlot {
  start: string;
  end: string;
  summary?: string;
  isAllDay?: boolean;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
  reason?: string;
}

interface SuggestedSlot {
  start: string;
  end: string;
  score: number;
  reason: string;
  conflictFree?: boolean;
  bufferRespected?: boolean;
  withinWorkingHours?: boolean;
  withinOverlapWindow?: boolean;
}

interface SmartRecommendation {
  start: string;
  end: string;
  score: number;
  reason: string;
  timezone: string;
  conflictFree: boolean;
  bufferRespected: boolean;
  withinWorkingHours: boolean;
  withinOverlapWindow: boolean;
}

interface ConflictInfo {
  hasConflict: boolean;
  conflicts: Array<{
    eventId?: string;
    summary: string;
    start: string;
    end: string;
  }>;
  bufferViolations: Array<{
    summary: string;
    start: string;
    end: string;
  }>;
}

interface WatchInfo {
  id: string;
  channelId: string;
  resourceId?: string;
  calendarEmail?: string;
  expiration?: string;
  status: string;
}

// ── Helpers ──

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isAllDay(event: CalendarEvent): boolean {
  return !!event.start?.date && !event.start?.dateTime;
}

function getEventStart(event: CalendarEvent): Date {
  if (event.start?.dateTime) return new Date(event.start.dateTime);
  if (event.start?.date) return new Date(event.start.date);
  return new Date();
}

function getEventEnd(event: CalendarEvent): Date {
  if (event.end?.dateTime) return new Date(event.end.dateTime);
  if (event.end?.date) return new Date(event.end.date);
  return new Date();
}

function isUpcoming(event: CalendarEvent): boolean {
  return getEventEnd(event) >= new Date();
}

// Determine meeting type from event properties
function getMeetingType(event: CalendarEvent): 'video' | 'phone' | 'in-person' | 'other' {
  if (event.hangoutLink) return 'video';
  const loc = (event.location || '').toLowerCase();
  if (loc.includes('zoom') || loc.includes('meet.google') || loc.includes('teams')) return 'video';
  if (loc.includes('phone') || loc.includes('call') || loc.includes('tel:')) return 'phone';
  if (loc && !loc.includes('http')) return 'in-person';
  if (event.meetingType === 'video') return 'video';
  if (event.meetingType === 'phone') return 'phone';
  if (event.meetingType === 'in-person') return 'in-person';
  return 'other';
}

function getMeetingTypeBadge(type: ReturnType<typeof getMeetingType>) {
  switch (type) {
    case 'video':
      return { icon: Video, label: 'Video', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'phone':
      return { icon: Phone, label: 'Phone', color: 'bg-green-100 text-green-700 border-green-200' };
    case 'in-person':
      return { icon: MapPin, label: 'In-Person', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    default:
      return { icon: Clock, label: 'Meeting', color: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
}

// ── Component ──

export default function CalendarPage() {
  const router = useRouter();

  // Connection state
  const [connected, setConnected] = useState<boolean | null>(null);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);

  // Events state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Calendar view state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Availability state
  const [availStartDate, setAvailStartDate] = useState('');
  const [availEndDate, setAvailEndDate] = useState('');
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Suggested slots state
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Conflicts state
  const [conflicts, setConflicts] = useState<ConflictInfo | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);

  // Push notifications state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [watchInfo, setWatchInfo] = useState<WatchInfo | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Fetch Connection Status ──
  const fetchConnectionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connection-status' }),
      });
      if (!res.ok) throw new Error('Failed to check connection');
      const data = await res.json();
      setConnected(data.connected);
      setCalendarEmail(data.email || null);
      setLastSyncAt(data.lastSyncAt || null);
    } catch {
      setConnected(false);
    } finally {
      setLoadingConnection(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionStatus();
    return () => { cancelled = true; };
  }, [fetchConnectionStatus]);

  // ── Set default dates ──
  useEffect(() => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    setAvailStartDate(today.toISOString().split('T')[0]);
    setAvailEndDate(nextWeek.toISOString().split('T')[0]);
  }, []);

  // ── Fetch events when connected ──
  useEffect(() => {
    let cancelled = false;
    if (connected) {
      fetchEvents();
      fetchWatchStatus();
    }
    return () => { cancelled = true; };
  }, [connected]);

  // ── Fetch Calendar Events (extended range for calendar view) ──
  const fetchEvents = async () => {
    setLoadingEvents(true);
    setError(null);
    try {
      const startOfMonthDate = startOfMonth(currentMonth);
      const endOfMonthDate = endOfMonth(addMonths(currentMonth, 1));
      const res = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(startOfMonthDate.toISOString())}&timeMax=${encodeURIComponent(endOfMonthDate.toISOString())}`
      );
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      const evts = (data.events || []).filter(
        (e: CalendarEvent) => e.status !== 'cancelled'
      );
      evts.sort((a: CalendarEvent, b: CalendarEvent) => getEventStart(a).getTime() - getEventStart(b).getTime());
      setEvents(evts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  };

  // ── Fetch watch status ──
  const fetchWatchStatus = async () => {
    try {
      const res = await fetch('/api/calendar/watch');
      if (!res.ok) return;
      const data = await res.json();
      const activeWatch = (data.watches || []).find(
        (w: WatchInfo) => w.status === 'active' && (!w.expiration || new Date(w.expiration) > new Date())
      );
      if (activeWatch) {
        setPushEnabled(true);
        setWatchInfo(activeWatch);
      } else {
        setPushEnabled(false);
        setWatchInfo(null);
      }
    } catch {
      // Silently fail - non-critical
    }
  };

  // ── Check Availability (via /api/meetings/check-availability) ──
  const checkAvailability = async () => {
    if (!availStartDate || !availEndDate) {
      setError('Please select a date range');
      return;
    }
    setLoadingAvailability(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: new Date(availStartDate).toISOString(),
          end: new Date(availEndDate).toISOString(),
          durationMinutes: 30,
        }),
      });
      if (!res.ok) throw new Error('Failed to check availability');
      const data = await res.json();
      setAvailabilitySlots(data.slots || []);
      setBusySlots(
        (data.slots || [])
          .filter((s: AvailabilitySlot) => !s.available)
          .map((s: AvailabilitySlot) => ({
            start: s.start,
            end: s.end,
            summary: s.reason || 'Busy',
          }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check availability');
    } finally {
      setLoadingAvailability(false);
    }
  };

  // ── Get Suggested Slots (via /api/meetings/suggest-slots) ──
  const getSuggestedSlots = async () => {
    setLoadingSuggested(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings/suggest-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: 30 }),
      });
      if (!res.ok) throw new Error('Failed to get suggested slots');
      const data = await res.json();
      setSuggestedSlots(data.suggestedSlots || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get suggested slots');
    } finally {
      setLoadingSuggested(false);
    }
  };

  // ── Get Recommendations (via /api/calendar/intelligence) ──
  const getRecommendations = async () => {
    setLoadingRecommendations(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recommendations', durationMinutes: 30 }),
      });
      if (!res.ok) throw new Error('Failed to get recommendations');
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get recommendations');
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // ── Check Conflicts (via /api/calendar/intelligence) ──
  const checkConflicts = async () => {
    if (!availStartDate || !availEndDate) return;
    setLoadingConflicts(true);
    try {
      const res = await fetch('/api/calendar/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'conflicts',
          newEventStart: new Date(availStartDate + 'T09:00:00').toISOString(),
          newEventEnd: new Date(availStartDate + 'T10:00:00').toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Failed to check conflicts');
      const data = await res.json();
      setConflicts(data);
    } catch {
      // Silently fail
    } finally {
      setLoadingConflicts(false);
    }
  };

  // ── Connect ──
  const handleConnect = async () => {
    setError(null);
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

  // ── Disconnect ──
  const handleDisconnect = async () => {
    setError(null);
    try {
      const res = await fetch('/api/calendar/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect');
      setConnected(false);
      setCalendarEmail(null);
      setEvents([]);
      setPushEnabled(false);
      setWatchInfo(null);
      setRecommendations([]);
      setSuggestedSlots([]);
      setAvailabilitySlots([]);
      setBusySlots([]);
      setConflicts(null);
      setSuccess('Google Calendar disconnected');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to disconnect Google Calendar');
    }
  };

  // ── Push Notifications Toggle ──
  const handlePushToggle = async (enabled: boolean) => {
    setPushLoading(true);
    setError(null);
    try {
      if (enabled) {
        const res = await fetch('/api/calendar/watch', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to enable push notifications');
        const data = await res.json();
        setPushEnabled(true);
        setWatchInfo(data.watch || null);
        setSuccess('Push notifications enabled — you will be notified of calendar changes');
      } else {
        const res = await fetch('/api/calendar/watch/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error('Failed to disable push notifications');
        setPushEnabled(false);
        setWatchInfo(null);
        setSuccess('Push notifications disabled');
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update push notification settings');
    } finally {
      setPushLoading(false);
    }
  };

  // ── Compute events for selected day ──
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter((event) => {
      const start = getEventStart(event);
      return isSameDay(start, selectedDate);
    });
  }, [events, selectedDate]);

  // ── Compute days with events for calendar indicators ──
  const eventDays = useMemo(() => {
    const dayMap = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const start = getEventStart(event);
      const key = format(start, 'yyyy-MM-dd');
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(event);
    });
    return dayMap;
  }, [events]);

  // ── Render ──

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/meetings')}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">Calendar</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Google Calendar integration with smart scheduling
              </p>
            </div>
          </div>
          {connected && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchEvents}
              disabled={loadingEvents}
            >
              {loadingEvents ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive text-xs font-medium">
              Dismiss
            </button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{success}</span>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            SECTION 1: Calendar Connection
        ──────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                <Globe className="h-5 w-5 text-teal-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Google Calendar Connection</CardTitle>
                <CardDescription>Sync your calendar for availability checking and Meet integration</CardDescription>
              </div>
              {/* Push Notifications Toggle */}
              {connected && (
                <div className="flex items-center gap-3 ml-auto">
                  <div className="flex items-center gap-2">
                    {pushEnabled ? (
                      <Bell className="h-4 w-4 text-teal-600" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Label htmlFor="push-toggle" className="text-sm text-muted-foreground hidden sm:inline cursor-pointer">
                      Push Notifications
                    </Label>
                    <Switch
                      id="push-toggle"
                      checked={pushEnabled}
                      onCheckedChange={handlePushToggle}
                      disabled={pushLoading}
                    />
                  </div>
                  {pushLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingConnection ? (
              <div className="flex items-center gap-3 p-4">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : connected ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Connected as <span className="text-teal-600">{calendarEmail || 'your Google account'}</span>
                    </p>
                    {lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last synced: {new Date(lastSyncAt).toLocaleString()}
                      </p>
                    )}
                    {watchInfo && pushEnabled && watchInfo.expiration && (
                      <p className="text-xs text-muted-foreground">
                        Push notifications active until {new Date(watchInfo.expiration).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDisconnect}>
                    <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 px-4">
                <div className="h-16 w-16 rounded-2xl bg-teal-50 dark:bg-teal-950 flex items-center justify-center mx-auto mb-4">
                  <CalendarDays className="h-8 w-8 text-teal-600" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Connect Google Calendar</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  Link your Google Calendar to view events, check availability, get smart meeting suggestions, and enable push notifications.
                </p>
                <Button size="lg" onClick={handleConnect} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Globe className="h-4 w-4 mr-2" />
                  Connect Google Calendar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ────────────────────────────────────────────────────────────────
            SECTION 2: Calendar View
        ──────────────────────────────────────────────────────────────── */}
        {connected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar Grid */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">Calendar View</CardTitle>
                    <CardDescription>Click a day to view meetings</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {events.length} events
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingEvents ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-48 mx-auto" />
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 35 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-md" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      month={currentMonth}
                      onMonthChange={setCurrentMonth}
                      className="rounded-md w-full"
                      modifiers={{
                        hasEvents: (date: Date) => {
                          const key = format(date, 'yyyy-MM-dd');
                          return eventDays.has(key);
                        },
                      }}
                      modifiersClassNames={{
                        hasEvents: 'has-events',
                      }}
                      components={{
                        DayButton: ({ day, modifiers, ...props }) => {
                          const key = format(day.date, 'yyyy-MM-dd');
                          const dayEvents = eventDays.get(key) || [];
                          const ref = React.useRef<HTMLButtonElement>(null);
                          
                          React.useEffect(() => {
                            if (modifiers.focused) ref.current?.focus();
                          }, [modifiers.focused]);

                          return (
                            <button
                              ref={ref}
                              {...props}
                              className={`
                                relative flex flex-col items-center justify-center aspect-square w-full min-w-8 rounded-md text-sm font-normal transition-colors
                                hover:bg-accent hover:text-accent-foreground
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                                ${modifiers.selected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
                                ${modifiers.today && !modifiers.selected ? 'bg-accent text-accent-foreground font-semibold' : ''}
                                ${modifiers.outside ? 'text-muted-foreground opacity-50' : ''}
                                ${modifiers.disabled ? 'text-muted-foreground opacity-50 cursor-not-allowed' : ''}
                              `}
                            >
                              <span>{day.date.getDate()}</span>
                              {dayEvents.length > 0 && !modifiers.selected && (
                                <div className="flex gap-0.5 mt-0.5">
                                  {dayEvents.slice(0, 3).map((evt, i) => {
                                    const type = getMeetingType(evt);
                                    const dotColor = type === 'video' ? 'bg-blue-500' : type === 'phone' ? 'bg-green-500' : type === 'in-person' ? 'bg-orange-500' : 'bg-gray-400';
                                    return <span key={i} className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />;
                                  })}
                                  {dayEvents.length > 3 && (
                                    <span className="text-[8px] text-muted-foreground leading-none">+{dayEvents.length - 3}</span>
                                  )}
                                </div>
                              )}
                              {dayEvents.length > 0 && modifiers.selected && (
                                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary-foreground/70" />
                              )}
                            </button>
                          );
                        },
                      }}
                    />
                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        Video
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Phone
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        In-Person
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Day Events */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">
                      {selectedDate ? format(selectedDate, 'EEEE') : 'Select a Day'}
                    </CardTitle>
                    <CardDescription>
                      {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Click on the calendar to view events'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {selectedDayEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarHeart className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No meetings on this day</p>
                    <p className="text-xs mt-1">Enjoy your free time!</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2 pr-2">
                      {selectedDayEvents.map((event) => {
                        const meetingType = getMeetingType(event);
                        const typeBadge = getMeetingTypeBadge(meetingType);
                        const TypeIcon = typeBadge.icon;
                        return (
                          <div
                            key={event.id}
                            className="p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <div className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${typeBadge.color.split(' ')[0]}`}>
                                <TypeIcon className={`h-4 w-4 ${typeBadge.color.split(' ')[1]}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {event.summary || '(No title)'}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {isAllDay(event)
                                      ? 'All day'
                                      : `${formatTime(event.start.dateTime || '')} - ${formatTime(event.end.dateTime || '')}`}
                                  </span>
                                  <Badge variant="secondary" className={`text-[10px] h-5 ${typeBadge.color}`}>
                                    {typeBadge.label}
                                  </Badge>
                                </div>
                                {event.location && (
                                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate">
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    {event.location}
                                  </p>
                                )}
                                {event.attendees && event.attendees.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                                  </p>
                                )}
                                {event.hangoutLink && (
                                  <a
                                    href={event.hangoutLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 mt-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Join Meeting
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            SECTION 3 & 4: Availability Checker & Smart Recommendations
        ──────────────────────────────────────────────────────────────── */}
        {connected && (
          <Tabs defaultValue="availability" className="w-full">
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
              <TabsTrigger value="availability" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Availability</span>
                <span className="sm:hidden">Free/Busy</span>
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Suggestions</span>
                <span className="sm:hidden">Suggest</span>
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Smart AI</span>
                <span className="sm:hidden">AI</span>
              </TabsTrigger>
            </TabsList>

            {/* ── Availability Tab ── */}
            <TabsContent value="availability">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Availability Checker</CardTitle>
                      <CardDescription>Check your free and busy times for a date range</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="availStart" className="text-xs font-medium">From</Label>
                      <Input
                        id="availStart"
                        type="date"
                        value={availStartDate}
                        onChange={(e) => setAvailStartDate(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="availEnd" className="text-xs font-medium">To</Label>
                      <Input
                        id="availEnd"
                        type="date"
                        value={availEndDate}
                        onChange={(e) => setAvailEndDate(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={checkAvailability}
                      disabled={loadingAvailability || !availStartDate || !availEndDate}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {loadingAvailability ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Check Availability
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        checkAvailability();
                        checkConflicts();
                      }}
                      disabled={loadingConflicts || !availStartDate}
                    >
                      {loadingConflicts ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Check Conflicts
                    </Button>
                  </div>

                  {/* Conflict Warnings */}
                  {conflicts && conflicts.hasConflict && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Scheduling Conflicts Detected
                        </span>
                      </div>
                      <div className="space-y-1">
                        {conflicts.conflicts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span className="font-medium">{c.summary}</span>
                            <span className="text-amber-500">
                              {formatDateTime(c.start)} — {formatTime(c.end)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {conflicts.bufferViolations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Buffer Violations:</p>
                          {conflicts.bufferViolations.map((v, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-amber-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              <span>{v.summary} ({formatTime(v.start)} - {formatTime(v.end)})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {conflicts && !conflicts.hasConflict && !loadingConflicts && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm text-emerald-800 dark:text-emerald-200">No scheduling conflicts found for this time</span>
                    </div>
                  )}

                  {/* Availability Results */}
                  {availabilitySlots.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Separator className="flex-1" />
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Results</span>
                        <Separator className="flex-1" />
                      </div>

                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {availabilitySlots.filter((s) => s.available).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Available</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {availabilitySlots.filter((s) => !s.available).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Busy</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {availabilitySlots.length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Total Slots</p>
                        </div>
                      </div>

                      {/* Busy Slots Detail */}
                      {busySlots.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Busy slots ({busySlots.length}):
                          </p>
                          <ScrollArea className="max-h-48">
                            <div className="space-y-1 pr-2">
                              {busySlots.map((slot, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-100 dark:border-red-900"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                  <span className="flex-1 min-w-0">
                                    {formatDateTime(slot.start)} — {formatTime(slot.end)}
                                  </span>
                                  {slot.summary && (
                                    <span className="truncate max-w-[140px] text-red-500">
                                      {slot.summary}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Available Slots */}
                      {availabilitySlots.filter((s) => s.available).length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Available slots:
                          </p>
                          <ScrollArea className="max-h-48">
                            <div className="space-y-1 pr-2">
                              {availabilitySlots
                                .filter((s) => s.available)
                                .map((slot, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 bg-emerald-50 dark:bg-emerald-950/30 rounded border border-emerald-100 dark:border-emerald-900"
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    <span className="flex-1">
                                      {formatDateTime(slot.start)} — {formatTime(slot.end)}
                                    </span>
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200">
                                      Free
                                    </Badge>
                                  </div>
                                ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Suggestions Tab ── */}
            <TabsContent value="suggestions">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                        <Lightbulb className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Meeting Slot Suggestions</CardTitle>
                        <CardDescription>AI-suggested optimal meeting times</CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={getSuggestedSlots}
                      disabled={loadingSuggested}
                    >
                      {loadingSuggested ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Suggest
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {loadingSuggested ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : suggestedSlots.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Click &quot;Suggest&quot; to get smart meeting time suggestions</p>
                      <p className="text-xs mt-1">Based on your availability and preferences</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestedSlots.map((slot, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                        >
                          <div className="flex flex-col items-center text-center min-w-[48px]">
                            <span className="text-xs font-medium text-muted-foreground">
                              {new Date(slot.start).toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <span className="text-lg font-semibold text-foreground">
                              {new Date(slot.start).getDate()}
                            </span>
                          </div>
                          <Separator orientation="vertical" className="h-12" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {formatTime(slot.start)} — {formatTime(slot.end)}
                              </span>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] h-5 ${
                                  slot.score >= 0.8
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : slot.score >= 0.6
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {Math.round(slot.score * 100)}% match
                              </Badge>
                              {slot.conflictFree && (
                                <Badge variant="secondary" className="text-[10px] h-5 bg-blue-50 text-blue-600 border-blue-200">
                                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                  No conflicts
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{slot.reason}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Smart Recommendations Tab ── */}
            <TabsContent value="recommendations">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Smart AI Recommendations</CardTitle>
                        <CardDescription>AI-powered optimal scheduling suggestions with conflict analysis</CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={getRecommendations}
                      disabled={loadingRecommendations}
                    >
                      {loadingRecommendations ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Analyze
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {loadingRecommendations ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : recommendations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Click &quot;Analyze&quot; to get AI-powered scheduling recommendations</p>
                      <p className="text-xs mt-1">Includes conflict detection, buffer analysis, and optimal time scoring</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Recommendations Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">{recommendations.length}</p>
                          <p className="text-[10px] text-muted-foreground">Suggestions</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-emerald-600">
                            {recommendations.filter((r) => r.conflictFree).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Conflict-Free</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {recommendations.filter((r) => r.withinWorkingHours).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Working Hours</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {Math.round(Math.max(...recommendations.map((r) => r.score)) * 100)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">Best Score</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Recommendation Cards */}
                      <ScrollArea className="max-h-96">
                        <div className="space-y-2 pr-2">
                          {recommendations.map((rec, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex flex-col items-center text-center min-w-[52px]">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {new Date(rec.start).toLocaleDateString('en-US', { weekday: 'short' })}
                                  </span>
                                  <span className="text-lg font-semibold text-foreground">
                                    {new Date(rec.start).getDate()}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(rec.start).toLocaleDateString('en-US', { month: 'short' })}
                                  </span>
                                </div>
                                <Separator orientation="vertical" className="h-14" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-foreground">
                                      {formatTime(rec.start)} — {formatTime(rec.end)}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className={`text-[10px] h-5 ${
                                        rec.score >= 0.8
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : rec.score >= 0.6
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      <Zap className="h-2.5 w-2.5 mr-0.5" />
                                      {Math.round(rec.score * 100)}%
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {rec.conflictFree && (
                                      <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-50 text-emerald-600 border-emerald-200">
                                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                        Conflict-free
                                      </Badge>
                                    )}
                                    {rec.bufferRespected && (
                                      <Badge variant="secondary" className="text-[10px] h-5 bg-blue-50 text-blue-600 border-blue-200">
                                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                                        Buffer OK
                                      </Badge>
                                    )}
                                    {rec.withinWorkingHours && (
                                      <Badge variant="secondary" className="text-[10px] h-5 bg-purple-50 text-purple-600 border-purple-200">
                                        <CalendarDays className="h-2.5 w-2.5 mr-0.5" />
                                        Work hours
                                      </Badge>
                                    )}
                                    {!rec.conflictFree && (
                                      <Badge variant="secondary" className="text-[10px] h-5 bg-red-50 text-red-600 border-red-200">
                                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                        Has conflict
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* ────────────────────────────────────────────────────────────────
            SECTION 5: Push Notifications Detail Card
        ──────────────────────────────────────────────────────────────── */}
        {connected && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                  {pushEnabled ? (
                    <Bell className="h-5 w-5 text-teal-600" />
                  ) : (
                    <BellOff className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Push Notifications</CardTitle>
                  <CardDescription>
                    Receive real-time notifications when your Google Calendar changes
                  </CardDescription>
                </div>
                <Switch
                  checked={pushEnabled}
                  onCheckedChange={handlePushToggle}
                  disabled={pushLoading}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {pushEnabled && watchInfo ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                      Push notifications are active
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                    {watchInfo.calendarEmail && (
                      <div>
                        <span className="text-emerald-500">Calendar: </span>
                        {watchInfo.calendarEmail}
                      </div>
                    )}
                    {watchInfo.expiration && (
                      <div>
                        <span className="text-emerald-500">Expires: </span>
                        {new Date(watchInfo.expiration).toLocaleDateString()}
                      </div>
                    )}
                    <div>
                      <span className="text-emerald-500">Channel: </span>
                      {watchInfo.channelId.slice(0, 16)}...
                    </div>
                  </div>
                </div>
              ) : !pushEnabled ? (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <BellOff className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Push notifications are disabled</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Enable push notifications to get real-time updates when events are added, changed, or cancelled in your Google Calendar.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => handlePushToggle(true)}
                        disabled={pushLoading}
                      >
                        {pushLoading ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Bell className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Enable Push Notifications
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Not Connected State - Show all sections as locked */}
        {!connected && !loadingConnection && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-muted-foreground">Calendar View</CardTitle>
                    <CardDescription>Connect to view your calendar</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Connect Google Calendar to view your schedule</p>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-muted-foreground">Availability Checker</CardTitle>
                    <CardDescription>Connect to check availability</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Connect Google Calendar to check availability</p>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-muted-foreground">Smart Recommendations</CardTitle>
                    <CardDescription>Connect for AI suggestions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Connect Google Calendar for smart scheduling</p>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-muted-foreground">Push Notifications</CardTitle>
                    <CardDescription>Connect to enable notifications</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Connect Google Calendar to enable push notifications</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
