'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Video,
  Phone,
  Users,
  AlertTriangle,
  X,
  Check,
  MoreHorizontal,
  Loader2,
  ExternalLink,
  Copy,
  Link2,
  Bell,
  Sparkles,
  Settings2,
  Shield,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import ScheduleMeetingDialog from '@/components/dashboard/schedule-meeting-dialog';
import MeetingIntentBanner, { type MeetingIntent } from '@/components/dashboard/meeting-intent-banner';
import MeetingDetailPanel from '@/components/dashboard/meeting-detail-panel';
import MeetingSettingsDialog from '@/components/dashboard/meeting-settings-dialog';

/* ===== Types ===== */
type MeetingType = 'video' | 'in-person' | 'phone';
type MeetingStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'pending_approval';
type FilterTab = 'all' | MeetingType;
type AutonomyMode = 'approval' | 'assisted' | 'autonomous';

interface Attendee {
  name: string;
  email?: string;
  initials: string;
  rsvpStatus?: string;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: MeetingType;
  status: MeetingStatus;
  attendees: Attendee[];
  description: string;
  meetLink?: string;
  customLink?: string;
  platform?: string;
  leadName?: string;
  leadId?: string;
  dealId?: string;
  timezone?: string;
  hasConflict: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'calendar';
  source: string;
}

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' as const } },
};

/* ===== Meeting Type Badge ===== */
function MeetingTypeBadge({ type }: { type: MeetingType }) {
  const config = {
    video: { className: 'bg-teal-500/10 text-teal-600 border-teal-500/20', label: 'Video', icon: Video },
    'in-person': { className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'In-Person', icon: Users },
    phone: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Phone', icon: Phone },
  };
  const c = config[type];
  const Icon = c.icon;
  return (
    <Badge className={cn('text-[8px] h-5 px-2 border flex items-center gap-1', c.className)}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </Badge>
  );
}

/* ===== Meeting Status Badge ===== */
function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const config = {
    scheduled: { className: 'bg-teal-500/10 text-teal-600 border-teal-500/20', label: 'Scheduled' },
    confirmed: { className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Confirmed' },
    completed: { className: 'bg-slate-500/10 text-slate-600 border-slate-500/20', label: 'Completed' },
    cancelled: { className: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Cancelled' },
  };
  const c = config[status];
  return (
    <Badge className={cn('text-[7px] h-4 px-1.5 border', c.className)}>{c.label}</Badge>
  );
}

/* ===== Avatar Stack ===== */
function AvatarStack({ attendees, maxShow = 3 }: { attendees: Attendee[]; maxShow?: number }) {
  const shown = attendees.slice(0, maxShow);
  const remaining = attendees.length - maxShow;
  const colorPool = [
    'from-teal-500 to-emerald-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-purple-600',
  ];
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((att, i) => (
        <div
          key={att.name + i}
          className={cn(
            'w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center border-2 border-card shrink-0 shadow-sm',
            colorPool[i % colorPool.length]
          )}
          style={{ zIndex: 10 - i }}
        >
          <span className="text-[7px] font-bold text-white">{att.initials}</span>
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center shrink-0 z-0">
          <span className="text-[7px] font-medium text-muted-foreground">+{remaining}</span>
        </div>
      )}
    </div>
  );
}

/* ===== Mini Calendar Grid ===== */
function MiniCalendarGrid({
  currentMonth,
  currentYear,
  selectedDay,
  onSelectDay,
  meetingDays,
}: {
  currentMonth: number;
  currentYear: number;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
  meetingDays: Set<number>;
}) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayDate = new Date();
  const isCurrentMonth = todayDate.getMonth() === currentMonth && todayDate.getFullYear() === currentYear;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const totalCells = Math.ceil(cells.length / 7) * 7;
  for (let i = cells.length; i < totalCells; i++) cells.push(null);

  return (
    <svg viewBox="0 0 280 220" className="w-full h-auto">
      {dayNames.map((name, i) => (
        <text
          key={name}
          x={20 + i * 40}
          y={18}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="10"
          fontWeight="600"
        >
          {name}
        </text>
      ))}
      {cells.map((cell, idx) => {
        if (cell === null) return null;
        const row = Math.floor(idx / 7);
        const col = idx % 7;
        const cx = 20 + col * 40;
        const cy = 36 + row * 36;
        const isToday = isCurrentMonth && cell === todayDate.getDate();
        const isSelected = cell === selectedDay;
        const hasMeeting = meetingDays.has(cell);

        return (
          <g key={`cell-${idx}`} onClick={() => onSelectDay(cell)} style={{ cursor: 'pointer' }}>
            <motion.circle
              cx={cx}
              cy={cy}
              r={isSelected ? 16 : isToday ? 16 : 14}
              fill={
                isSelected
                  ? '#0d9488'
                  : isToday
                    ? 'rgba(13, 148, 136, 0.15)'
                    : 'transparent'
              }
              stroke={isSelected ? '#0d9488' : isToday ? 'rgba(13, 148, 136, 0.4)' : 'transparent'}
              strokeWidth={1.5}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, delay: idx * 0.01 }}
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              className={isSelected ? 'fill-white' : isToday ? 'fill-teal-400' : 'fill-foreground'}
              fontSize="12"
              fontWeight={isToday || isSelected ? '700' : '400'}
            >
              {cell}
            </text>
            {hasMeeting && !isSelected && (
              <circle cx={cx} cy={cy + 13} r={2.5} fill="#0d9488" opacity={0.7} />
            )}
            {isToday && !isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={16}
                fill="none"
                stroke="rgba(13, 148, 136, 0.3)"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ===== Day Detail View ===== */
function DayDetailView({
  meetings,
  onClose,
  onMeetingClick,
}: {
  meetings: Meeting[];
  onClose: () => void;
  onMeetingClick: (id: string) => void;
}) {
  const sortedMeetings = [...meetings].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="relative border-t border-border/30 pt-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} scheduled
          </h4>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-2">
          {sortedMeetings.map((meeting, i) => (
            <motion.div
              key={meeting.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onMeetingClick(meeting.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer',
                meeting.status === 'cancelled'
                  ? 'bg-red-500/5 border-red-500/20 opacity-60'
                  : meeting.hasConflict
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-muted/5 border-border/20 hover:border-teal-500/30 hover:bg-teal-500/5'
              )}
            >
              <div className="flex flex-col items-center shrink-0 w-14">
                <span className="text-[10px] font-semibold text-foreground">{meeting.startTime}</span>
                <span className="text-[9px] text-muted-foreground">{meeting.endTime}</span>
                <div className="w-px h-4 bg-border/40 my-1" />
                <span className="text-[8px] text-muted-foreground">{meeting.duration}m</span>
              </div>
              <div className={cn('w-0.5 self-stretch rounded-full',
                meeting.status === 'cancelled' ? 'bg-red-500/40' :
                meeting.hasConflict ? 'bg-red-500/40' : 'bg-border/40'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold truncate">{meeting.title}</span>
                  {meeting.hasConflict && meeting.status !== 'cancelled' && (
                    <Badge className="text-[7px] h-4 px-1.5 bg-red-500/10 text-red-500 border-red-500/20 shrink-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      Conflict
                    </Badge>
                  )}
                  <MeetingTypeBadge type={meeting.type} />
                  <MeetingStatusBadge status={meeting.status} />
                </div>
                <p className="text-[9px] text-muted-foreground mb-1.5 truncate">{meeting.description}</p>
                <div className="flex items-center gap-2">
                  {meeting.meetLink && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(meeting.meetLink!); toast.success('Link copied'); }}
                      className="flex items-center gap-1 text-[8px] text-teal-600 hover:text-teal-700"
                    >
                      <Video className="h-2.5 w-2.5" />
                      Meet Link
                    </button>
                  )}
                  <AvatarStack attendees={meeting.attendees} maxShow={2} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Main Component ===== */
export default function MeetingSchedulerCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  const [viewMonth, setViewMonth] = useState(month);
  const [viewYear, setViewYear] = useState(year);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Data state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog/Panel state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Intent state
  const [meetingIntents, setMeetingIntents] = useState<MeetingIntent[]>([]);

  // Settings state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('approval');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'video', label: 'Video' },
    { id: 'in-person', label: 'In-Person' },
    { id: 'phone', label: 'Phone' },
  ];

  // Fetch meetings
  const fetchMeetings = useCallback(async () => {
    setMeetingsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const rawMeetings = data.meetings || data || [];
        // Normalize the data
        const normalized: Meeting[] = rawMeetings.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          title: (m.title as string) || 'Untitled Meeting',
          date: (m.date as string) || m.scheduledDate as string || '',
          startTime: (m.startTime as string) || '',
          endTime: (m.endTime as string) || '',
          duration: (m.duration as number) || 30,
          type: (m.type as MeetingType) || 'video',
          status: (m.status as MeetingStatus) || 'scheduled',
          attendees: ((m.attendees as Array<Record<string, unknown>>) || []).map((a: Record<string, unknown>) => ({
            name: (a.name as string) || (a.email as string)?.split('@')[0] || '',
            email: (a.email as string) || '',
            initials: ((a.name as string) || (a.email as string) || '??').slice(0, 2).toUpperCase(),
            rsvpStatus: (a.rsvpStatus as string) || undefined,
          })),
          description: (m.description as string) || '',
          meetLink: (m.meetLink as string) || undefined,
          customLink: (m.customLink as string) || undefined,
          platform: (m.platform as string) || undefined,
          leadName: (m.leadName as string) || undefined,
          leadId: (m.leadId as string) || undefined,
          dealId: (m.dealId as string) || undefined,
          timezone: (m.timezone as string) || undefined,
          hasConflict: (m.hasConflict as boolean) || false,
        }));
        setMeetings(normalized);
      } else {
        setError('Failed to load meetings');
      }
    } catch {
      setError('Network error loading meetings');
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  // Fetch Google Calendar events
  const fetchCalendarEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/events', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCalendarConnected(true);
        if (data.events) {
          setCalendarEvents(data.events.map((e: Record<string, unknown>) => ({
            id: e.id as string,
            title: e.title as string || e.summary as string || '',
            date: e.date as string || e.start as string || '',
            startTime: e.startTime as string || '',
            endTime: e.endTime as string || '',
            type: 'calendar' as const,
            source: 'google',
          })));
        }
      } else {
        setCalendarConnected(false);
      }
    } catch {
      setCalendarConnected(false);
    }
  }, []);

  // Fetch meeting intents
  const fetchIntents = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings/detect-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ context: 'dashboard' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.intents && data.intents.length > 0) {
          setMeetingIntents(data.intents);
        }
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Fetch settings & pending approvals
  const fetchSettings = useCallback(async () => {
    try {
      const [settingsRes, pendingRes] = await Promise.allSettled([
        fetch('/api/meetings/settings', { credentials: 'include' }),
        fetch('/api/meetings/pending-approvals', { credentials: 'include' }),
      ]);
      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        const data = await settingsRes.value.json();
        setAutonomyMode(data.settings?.autonomyMode || 'approval');
        setCalendarConnected(data.settings?.googleCalendarConnected || false);
      }
      if (pendingRes.status === 'fulfilled' && pendingRes.value.ok) {
        const data = await pendingRes.value.json();
        setPendingApprovalsCount(data.count || data.pendingApprovals?.length || 0);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Load all data on mount
  useEffect(() => {
    let cancelled = false;
    fetchMeetings();
    fetchCalendarEvents();
    fetchIntents();
    fetchSettings();
    return () => { cancelled = true; };
  }, [fetchMeetings, fetchCalendarEvents, fetchIntents, fetchSettings]);

  // Meeting days for calendar view
  const meetingDays = useMemo(() => {
    const days = new Set<number>();
    meetings.forEach(m => {
      if (!m.date) return;
      const d = new Date(m.date);
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        days.add(d.getDate());
      }
    });
    // Also mark calendar event days
    calendarEvents.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        days.add(d.getDate());
      }
    });
    return days;
  }, [meetings, calendarEvents, viewMonth, viewYear]);

  // Get meetings for selected day
  const selectedDayMeetings = useMemo(() => {
    if (selectedDay === null) return [];
    return meetings
      .filter(m => {
        if (!m.date) return false;
        const d = new Date(m.date);
        return d.getMonth() === viewMonth && d.getFullYear() === viewYear && d.getDate() === selectedDay;
      })
      .filter(m => activeFilter === 'all' || m.type === activeFilter);
  }, [selectedDay, viewMonth, viewYear, meetings, activeFilter]);

  // Upcoming meetings (today onward, excluding cancelled)
  const upcomingMeetings = useMemo(() => {
    const todayStart = new Date(year, month, day, 0, 0, 0);
    return meetings
      .filter(m => {
        if (!m.date) return false;
        return new Date(m.date) >= todayStart && m.status !== 'cancelled';
      })
      .filter(m => activeFilter === 'all' || m.type === activeFilter)
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      })
      .slice(0, 8);
  }, [meetings, activeFilter, year, month, day]);

  // Stats
  const todayMeetings = meetings.filter(m => {
    if (!m.date) return false;
    const d = new Date(m.date);
    return d.getMonth() === month && d.getFullYear() === year && d.getDate() === day && m.status !== 'cancelled';
  });
  const weekStart = new Date(year, month, day - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeekMeetings = meetings.filter(m => {
    if (!m.date || m.status === 'cancelled') return false;
    const d = new Date(m.date);
    return d >= weekStart && d < weekEnd;
  });
  const avgDuration = meetings.length > 0
    ? Math.round(meetings.filter(m => m.status !== 'cancelled').reduce((sum, m) => sum + m.duration, 0) / Math.max(meetings.filter(m => m.status !== 'cancelled').length, 1))
    : 0;
  const conflictCount = meetings.filter(m => m.hasConflict && m.status !== 'cancelled').length;

  // Navigate months
  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
    setSelectedDay(null);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
    setSelectedDay(null);
  };

  // Handle meeting click
  const handleMeetingClick = (id: string) => {
    setSelectedMeetingId(id);
    setDetailPanelOpen(true);
  };

  // Handle meeting created
  const handleMeetingCreated = () => {
    fetchMeetings();
  };

  // Handle intent schedule
  const handleIntentSchedule = (intent: MeetingIntent) => {
    setScheduleDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Meeting Intent Banner */}
      <MeetingIntentBanner
        intents={meetingIntents}
        onScheduleMeeting={handleIntentSchedule}
        onDismiss={(id) => setMeetingIntents(prev => prev.filter(i => i.id !== id))}
      />

      {/* Connect Google Calendar Banner */}
      {!calendarConnected && !meetingsLoading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <svg className="h-5 w-5 text-teal-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-teal-800 dark:text-teal-200">Connect Google Calendar</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">Sync your meetings and see calendar availability</p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => window.location.href = '/api/integrations/google/connect'}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </Button>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/20">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Meeting Scheduler</h2>
              <p className="text-xs text-muted-foreground">Manage your calendar, schedule, and track meetings</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Autonomy Mode Indicator */}
            <Badge className={cn('text-[9px] h-6 px-2 border gap-1',
              autonomyMode === 'approval'
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : autonomyMode === 'assisted'
                  ? 'bg-teal-500/10 text-teal-600 border-teal-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            )}>
              {autonomyMode === 'approval' && <Shield className="h-3 w-3" />}
              {autonomyMode === 'assisted' && <Sparkles className="h-3 w-3" />}
              {autonomyMode === 'autonomous' && <Zap className="h-3 w-3" />}
              {autonomyMode.charAt(0).toUpperCase() + autonomyMode.slice(1)}
            </Badge>
            {conflictCount > 0 && (
              <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {pendingApprovalsCount > 0 && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] gap-1">
                <Sparkles className="h-3 w-3" />
                {pendingApprovalsCount} pending
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1 h-8 w-8 p-0"
              onClick={() => setSettingsDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="sm" className="text-xs gap-1.5 bg-teal-600 hover:bg-teal-700" onClick={() => setScheduleDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Schedule Meeting
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Meeting Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Meetings Today', value: todayMeetings.length.toString(), color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
          { label: 'This Week', value: thisWeekMeetings.length.toString(), color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
          { label: 'Avg Duration', value: `${avgDuration} min`, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
          { label: 'Conflicts', value: conflictCount > 0 ? `${conflictCount}` : 'None', color: conflictCount > 0 ? 'text-red-500' : 'text-emerald-500', bgColor: conflictCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: i * 0.05 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
          >
            <div className={cn('rounded-xl p-2 w-fit mb-2', stat.bgColor)}>
              <Clock className={cn('h-4 w-4', stat.color)} />
            </div>
            <p className="text-xl font-bold tabular-nums">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">
              {monthNames[viewMonth]} {viewYear}
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={goToPrevMonth} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setViewMonth(month); setViewYear(year); setSelectedDay(null); }}
                className="px-2 py-1 rounded-lg text-[10px] font-medium hover:bg-muted/50 transition-colors text-muted-foreground"
              >
                Today
              </button>
              <button onClick={goToNextMonth} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <MiniCalendarGrid
            currentMonth={viewMonth}
            currentYear={viewYear}
            selectedDay={selectedDay}
            onSelectDay={(d) => setSelectedDay(d === selectedDay ? null : d)}
            meetingDays={meetingDays}
          />
          <AnimatePresence>
            {selectedDay !== null && selectedDayMeetings.length > 0 && (
              <DayDetailView
                meetings={selectedDayMeetings}
                onClose={() => setSelectedDay(null)}
                onMeetingClick={handleMeetingClick}
              />
            )}
            {selectedDay !== null && selectedDayMeetings.length === 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-4 mt-2 border-t border-border/30"
              >
                <div className="flex flex-col items-center py-4">
                  <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-[11px] text-muted-foreground">No meetings on {monthNames[viewMonth]} {selectedDay}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] mt-2 gap-1"
                    onClick={() => setScheduleDialogOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Schedule one
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Upcoming Meetings List */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-500" />
              <h3 className="text-sm font-bold">Upcoming Meetings</h3>
              <Badge className="bg-teal-500/10 text-teal-600 border-teal-500/20 text-[10px]">
                {upcomingMeetings.length} upcoming
              </Badge>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all shrink-0',
                  activeFilter === tab.id
                    ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20 border border-transparent'
                )}
              >
                {tab.label}
                {tab.id === 'video' && <Video className="h-2.5 w-2.5" />}
                {tab.id === 'in-person' && <Users className="h-2.5 w-2.5" />}
                {tab.id === 'phone' && <Phone className="h-2.5 w-2.5" />}
              </button>
            ))}
          </div>

          {/* Loading State */}
          {meetingsLoading && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-3" />
              <p className="text-xs text-muted-foreground">Loading meetings...</p>
            </div>
          )}

          {/* Error State */}
          {!meetingsLoading && error && (
            <div className="flex flex-col items-center py-12">
              <AlertTriangle className="h-8 w-8 text-red-400 mb-3" />
              <p className="text-xs text-red-500">{error}</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={fetchMeetings}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!meetingsLoading && !error && upcomingMeetings.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No upcoming meetings</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Schedule your first meeting to get started</p>
              <Button
                size="sm"
                className="mt-4 text-xs gap-1.5 bg-teal-600 hover:bg-teal-700"
                onClick={() => setScheduleDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Schedule Meeting
              </Button>
            </div>
          )}

          {/* Meeting Cards */}
          {!meetingsLoading && !error && (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {upcomingMeetings.map((meeting, index) => {
                const meetingDate = new Date(meeting.date);
                const isTodayMeeting = meetingDate.getDate() === day && meetingDate.getMonth() === month && meetingDate.getFullYear() === year;
                const meetingDateStr = isTodayMeeting
                  ? 'Today'
                  : meetingDate.getDate() === day + 1 && meetingDate.getMonth() === month
                    ? 'Tomorrow'
                    : `${monthNames[meetingDate.getMonth()].slice(0, 3)} ${meetingDate.getDate()}`;

                return (
                  <motion.div
                    key={meeting.id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => handleMeetingClick(meeting.id)}
                    className={cn(
                      'p-4 rounded-xl border transition-all cursor-pointer',
                      meeting.status === 'cancelled'
                        ? 'bg-red-500/5 border-red-500/10 opacity-60'
                        : meeting.hasConflict
                          ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/30'
                          : isTodayMeeting
                            ? 'bg-teal-500/5 border-teal-500/15 hover:border-teal-500/25'
                            : 'bg-muted/5 border-border/20 hover:border-teal-500/25'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center shrink-0 bg-muted/50 rounded-lg px-2 py-1.5 min-w-[52px]">
                        <span className="text-[11px] font-bold tabular-nums">{meeting.startTime}</span>
                        <span className="text-[8px] text-muted-foreground tabular-nums">{meeting.endTime}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[12px] font-semibold truncate">{meeting.title}</span>
                          {meeting.hasConflict && meeting.status !== 'cancelled' && (
                            <Badge className="text-[7px] h-4 px-1.5 bg-red-500/10 text-red-500 border-red-500/20 shrink-0">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                              Conflict
                            </Badge>
                          )}
                          <MeetingTypeBadge type={meeting.type} />
                          <MeetingStatusBadge status={meeting.status} />
                          {/* Platform Badge */}
                          {meeting.platform && (() => {
                            const pConfig: Record<string, { label: string; className: string }> = {
                              'google_meet': { label: 'Meet', className: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
                              'google-meet': { label: 'Meet', className: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
                              'zoom': { label: 'Zoom', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
                              'teams': { label: 'Teams', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
                            };
                            const pc = pConfig[meeting.platform];
                            return pc ? <Badge className={cn('text-[7px] h-4 px-1.5 border', pc.className)}>{pc.label}</Badge> : null;
                          })()}
                        </div>
                        <p className="text-[9px] text-muted-foreground mb-2 truncate">{meeting.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AvatarStack attendees={meeting.attendees} maxShow={3} />
                            <span className="text-[9px] text-muted-foreground">
                              {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}
                            </span>
                            {meeting.leadName && (
                              <Badge className="text-[7px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                {meeting.leadName}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {meeting.meetLink && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(meeting.meetLink, '_blank');
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/10 text-[8px] font-medium text-teal-600 hover:bg-teal-500/20 transition-colors"
                              >
                                <Video className="h-2.5 w-2.5" />
                                Join
                              </button>
                            )}
                            <Badge className="text-[8px] h-4 px-1.5 bg-muted/30 border-border/30">
                              {meetingDateStr}
                            </Badge>
                            <Badge className="text-[8px] h-4 px-1.5 bg-muted/30 border-border/30">
                              {meeting.duration}m
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Dialogs & Panels */}
      <ScheduleMeetingDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onMeetingCreated={handleMeetingCreated}
      />

      <MeetingDetailPanel
        meetingId={selectedMeetingId}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        onMeetingUpdated={fetchMeetings}
      />

      <MeetingSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onSettingsSaved={() => { fetchSettings(); fetchMeetings(); }}
      />
    </div>
  );
}
