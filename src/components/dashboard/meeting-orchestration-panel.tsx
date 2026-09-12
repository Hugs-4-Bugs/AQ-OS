'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Users,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Settings2,
  Link2,
  Unplug,
  Sparkles,
  Shield,
  Zap,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Ban,
  Eye,
  Copy,
  Bell,
  Globe,
  Quote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isToday, isTomorrow, isThisWeek, startOfWeek, addDays, isSameDay } from 'date-fns';
import ScheduleMeetingDialog from '@/components/dashboard/schedule-meeting-dialog';
import MeetingDetailPanel from '@/components/dashboard/meeting-detail-panel';
import MeetingSettingsDialog from '@/components/dashboard/meeting-settings-dialog';

/* ===== Types ===== */
type MeetingType = 'video' | 'phone' | 'in-person';
type MeetingStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'pending_approval';
type AutonomyMode = 'approval' | 'assisted' | 'autonomous';

interface Attendee {
  email: string;
  name: string;
  rsvpStatus?: string;
}

interface Meeting {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: MeetingType;
  status: MeetingStatus;
  platform?: string;
  meetLink?: string;
  customLink?: string;
  timezone?: string;
  attendees?: Attendee[];
  leadName?: string;
  leadId?: string;
  dealId?: string;
  notes?: string;
  agenda?: string[];
  calendarEventId?: string;
  createdAt: string;
  updatedAt: string;
  // Pending approval specific
  confidence?: number;
  detectedIntent?: string;
  originalText?: string;
  sourceConversation?: string;
  // Autonomy
  autonomyMode?: AutonomyMode;
  calendarSynced?: boolean;
  reminderSent?: boolean;
}

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
  autonomyMode?: AutonomyMode;
}

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' as const } },
};

/* ===== Helpers ===== */
const getPlatformBadge = (platform?: string) => {
  switch (platform) {
    case 'google_meet':
    case 'google-meet':
      return { label: 'Google Meet', className: 'bg-teal-500/10 text-teal-600 border-teal-500/20', icon: Video };
    case 'zoom':
      return { label: 'Zoom', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: Video };
    case 'teams':
      return { label: 'Teams', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Video };
    default:
      return null;
  }
};

const getTypeIcon = (type: MeetingType) => {
  switch (type) {
    case 'video': return Video;
    case 'phone': return Phone;
    case 'in-person': return MapPin;
  }
};

const getAutonomyBadge = (mode: AutonomyMode) => {
  switch (mode) {
    case 'approval':
      return { label: 'Approval', icon: Shield, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
    case 'assisted':
      return { label: 'Assisted', icon: Sparkles, className: 'bg-teal-500/10 text-teal-600 border-teal-500/20' };
    case 'autonomous':
      return { label: 'Autonomous', icon: Zap, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
  }
};

const formatDateLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
};

/* ===== Platform Badge Component ===== */
function PlatformBadge({ platform }: { platform?: string }) {
  const badge = getPlatformBadge(platform);
  if (!badge) return null;
  const Icon = badge.icon;
  return (
    <Badge className={cn('text-[8px] h-5 px-1.5 border flex items-center gap-1', badge.className)}>
      <Icon className="h-2.5 w-2.5" />
      {badge.label}
    </Badge>
  );
}

/* ===== Autonomy Mode Badge ===== */
function AutonomyModeBadge({ mode }: { mode: AutonomyMode }) {
  const config = getAutonomyBadge(mode);
  const Icon = config.icon;
  return (
    <Badge className={cn('text-[8px] h-5 px-1.5 border flex items-center gap-1', config.className)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

/* ===== Stat Card ===== */
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
    >
      <div className={cn('rounded-xl p-2 w-fit mb-2', bgColor)}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </motion.div>
  );
}

/* ===== Upcoming Meeting Card ===== */
function UpcomingMeetingCard({
  meeting,
  onMeetingClick,
  onCancel,
  onReschedule,
  onComplete,
  actionLoading,
}: {
  meeting: Meeting;
  onMeetingClick: (id: string) => void;
  onCancel: (id: string) => void;
  onReschedule: (id: string) => void;
  onComplete: (id: string) => void;
  actionLoading: string | null;
}) {
  const dateLabel = formatDateLabel(meeting.date);
  const typeInfo = getTypeIcon(meeting.type);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.005 }}
      onClick={() => onMeetingClick(meeting.id)}
      className={cn(
        'p-4 rounded-xl border transition-all cursor-pointer',
        'bg-muted/5 border-border/20 hover:border-teal-500/25'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Time Block */}
        <div className="flex flex-col items-center shrink-0 bg-muted/50 rounded-lg px-2.5 py-1.5 min-w-[56px]">
          <span className="text-[11px] font-bold tabular-nums">{meeting.startTime}</span>
          <span className="text-[8px] text-muted-foreground tabular-nums">{meeting.endTime}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[12px] font-semibold truncate">{meeting.title}</span>
            <PlatformBadge platform={meeting.platform} />
            <Badge className="text-[8px] h-5 px-1.5 bg-muted/30 border-border/30">
              {dateLabel}
            </Badge>
            <Badge className="text-[8px] h-5 px-1.5 bg-muted/30 border-border/30">
              {meeting.duration}m
            </Badge>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              {React.createElement(typeInfo, { className: 'h-3 w-3 text-muted-foreground' })}
              <span className="text-[10px] text-muted-foreground capitalize">{meeting.type}</span>
            </div>
            {meeting.leadName && (
              <Badge className="text-[7px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                {meeting.leadName}
              </Badge>
            )}
            {meeting.calendarSynced && (
              <div className="flex items-center gap-1 text-[9px] text-teal-600">
                <Calendar className="h-2.5 w-2.5" />
                Synced
              </div>
            )}
            {meeting.reminderSent && (
              <div className="flex items-center gap-1 text-[9px] text-amber-600">
                <Bell className="h-2.5 w-2.5" />
                Reminded
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {(meeting.meetLink || meeting.customLink) && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[9px] gap-1 border-teal-500/30 text-teal-600 hover:bg-teal-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(meeting.meetLink || meeting.customLink, '_blank');
                }}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Join
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[9px] gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onReschedule(meeting.id);
              }}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Reschedule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[9px] gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(meeting.id);
              }}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Complete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[9px] gap-1 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(meeting.id);
              }}
              disabled={actionLoading === meeting.id}
            >
              {actionLoading === meeting.id ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Ban className="h-2.5 w-2.5" />
              )}
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Pending Approval Card ===== */
function PendingApprovalCard({
  meeting,
  onApprove,
  onReject,
  actionLoading,
}: {
  meeting: Meeting;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actionLoading: string | null;
}) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="p-4 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20"
    >
      <div className="flex items-start gap-3">
        {/* AI Icon */}
        <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[12px] font-semibold">{meeting.title}</span>
            {meeting.confidence != null && (
              <Badge className="text-[8px] h-5 px-1.5 border bg-amber-500/10 text-amber-600 border-amber-500/20">
                {Math.round(meeting.confidence * 100)}% confidence
              </Badge>
            )}
            {meeting.detectedIntent && (
              <Badge className="text-[8px] h-5 px-1.5 bg-teal-500/10 text-teal-600 border-teal-500/20">
                {meeting.detectedIntent}
              </Badge>
            )}
            <PlatformBadge platform={meeting.platform} />
          </div>

          {/* Original Text Quote */}
          {meeting.originalText && (
            <div className="flex items-start gap-1.5 mb-2 p-2 rounded-lg bg-muted/20 border border-border/20">
              <Quote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground italic line-clamp-2">{meeting.originalText}</p>
            </div>
          )}

          {/* Meeting Details */}
          <div className="flex items-center gap-3 mb-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateLabel(meeting.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {meeting.startTime} - {meeting.endTime}
            </span>
            <span>{meeting.duration}m</span>
            {meeting.leadName && (
              <span className="flex items-center gap-1 text-emerald-600">
                <Users className="h-3 w-3" />
                {meeting.leadName}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onApprove(meeting.id)}
              disabled={actionLoading === meeting.id}
            >
              {actionLoading === meeting.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={() => onReject(meeting.id)}
              disabled={actionLoading === meeting.id}
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Completed Meeting Card ===== */
function CompletedMeetingCard({
  meeting,
  onMeetingClick,
}: {
  meeting: Meeting;
  onMeetingClick: (id: string) => void;
}) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.005 }}
      onClick={() => onMeetingClick(meeting.id)}
      className="p-4 rounded-xl border bg-muted/5 border-border/20 hover:border-slate-500/20 cursor-pointer transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold truncate">{meeting.title}</span>
            <PlatformBadge platform={meeting.platform} />
            <Badge className="text-[8px] h-5 px-1.5 bg-slate-500/10 text-slate-600 border-slate-500/20">
              Completed
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1">
            <span>{formatDateLabel(meeting.date)}</span>
            <span>{meeting.startTime} - {meeting.endTime}</span>
            <span>{meeting.duration}m</span>
            {meeting.leadName && (
              <span className="text-emerald-600">{meeting.leadName}</span>
            )}
          </div>
          {meeting.notes && (
            <p className="text-[10px] text-muted-foreground line-clamp-2">{meeting.notes}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ===== Calendar View Week Grid ===== */
function CalendarWeekView({
  meetings,
  onMeetingClick,
}: {
  meetings: Meeting[];
  onMeetingClick: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const now = new Date();
  const weekStart = startOfWeek(addDays(now, weekOffset * 7), { weekStartsOn: 1 });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      map.set(key, []);
    });
    meetings.forEach(m => {
      if (!m.date) return;
      const key = format(new Date(m.date), 'yyyy-MM-dd');
      if (map.has(key)) {
        map.get(key)!.push(m);
      }
    });
    return map;
  }, [meetings, days]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground">
          {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </h4>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-2 py-1 rounded-lg text-[10px] font-medium hover:bg-muted/50 transition-colors text-muted-foreground"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayMeetings = meetingsByDay.get(key) || [];
          const today = isToday(day);

          return (
            <div
              key={key}
              className={cn(
                'min-h-[100px] p-2 rounded-lg border transition-all',
                today
                  ? 'bg-teal-500/5 border-teal-500/20'
                  : 'bg-card/50 border-border/30'
              )}
            >
              <div className={cn(
                'text-[10px] font-semibold mb-1.5',
                today ? 'text-teal-600' : 'text-muted-foreground'
              )}>
                {format(day, 'EEE')}
                <div className={cn(
                  'text-sm font-bold',
                  today ? 'text-teal-600' : 'text-foreground'
                )}>
                  {format(day, 'd')}
                </div>
              </div>
              <div className="space-y-1">
                {dayMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m.id)}
                    className="w-full text-left p-1 rounded bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/15 transition-colors"
                  >
                    <p className="text-[8px] font-medium truncate">{m.title}</p>
                    <p className="text-[7px] text-muted-foreground">{m.startTime}</p>
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <p className="text-[8px] text-muted-foreground text-center">
                    +{dayMeetings.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function MeetingOrchestrationPanel() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pendingMeetings, setPendingMeetings] = useState<Meeting[]>([]);
  const [completedMeetings, setCompletedMeetings] = useState<Meeting[]>([]);
  const [settings, setSettings] = useState<MeetingSettings | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('approval');

  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [upcomingRes, pendingRes, completedRes, settingsRes, calendarRes] = await Promise.allSettled([
        fetch('/api/meetings?status=scheduled', { credentials: 'include' }),
        fetch('/api/meetings/pending-approvals', { credentials: 'include' }),
        fetch('/api/meetings?status=completed', { credentials: 'include' }),
        fetch('/api/meetings/settings', { credentials: 'include' }),
        fetch('/api/calendar/intelligence', { credentials: 'include' }),
      ]);

      // Upcoming
      if (upcomingRes.status === 'fulfilled' && upcomingRes.value.ok) {
        const data = await upcomingRes.value.json();
        const raw = data.meetings || data || [];
        setMeetings(normalizeMeetings(raw));
      }

      // Pending
      if (pendingRes.status === 'fulfilled' && pendingRes.value.ok) {
        const data = await pendingRes.value.json();
        const raw = data.pendingApprovals || data.meetings || data || [];
        setPendingMeetings(normalizeMeetings(raw));
      }

      // Completed
      if (completedRes.status === 'fulfilled' && completedRes.value.ok) {
        const data = await completedRes.value.json();
        const raw = data.meetings || data || [];
        setCompletedMeetings(normalizeMeetings(raw));
      }

      // Settings
      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        const data = await settingsRes.value.json();
        setSettings(data.settings);
        setAutonomyMode(data.settings?.autonomyMode || 'approval');
        setCalendarConnected(data.settings?.googleCalendarConnected || false);
      }

      // Calendar
      if (calendarRes.status === 'fulfilled' && calendarRes.value.ok) {
        const data = await calendarRes.value.json();
        setCalendarConnected(true);
        setCalendarEmail(data.email || data.calendarEmail || '');
      } else {
        setCalendarConnected(false);
      }
    } catch {
      toast.error('Failed to load meeting data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllData();
    return () => { cancelled = true; };
  }, [fetchAllData]);

  // Normalize meeting data from API
  const normalizeMeetings = (raw: Record<string, unknown>[]): Meeting[] => {
    return raw.map((m) => ({
      id: (m.id as string) || '',
      title: (m.title as string) || 'Untitled Meeting',
      description: (m.description as string) || '',
      date: (m.date as string) || (m.scheduledDate as string) || (m.startDateTime as string) || '',
      startTime: (m.startTime as string) || '',
      endTime: (m.endTime as string) || '',
      duration: (m.duration as number) || (m.durationMinutes as number) || 30,
      type: (m.type as MeetingType) || (m.meetingType as MeetingType) || 'video',
      status: (m.status as MeetingStatus) || 'scheduled',
      platform: (m.platform as string) || (m.meetingPlatform as string) || undefined,
      meetLink: (m.meetLink as string) || undefined,
      customLink: (m.customLink as string) || undefined,
      timezone: (m.timezone as string) || undefined,
      attendees: ((m.attendees as Array<Record<string, unknown>>) || []).map((a) => ({
        email: (a.email as string) || '',
        name: (a.name as string) || '',
        rsvpStatus: (a.rsvpStatus as string) || undefined,
      })),
      leadName: (m.leadName as string) || undefined,
      leadId: (m.leadId as string) || undefined,
      dealId: (m.dealId as string) || undefined,
      notes: (m.notes as string) || undefined,
      agenda: (m.agenda as string[]) || undefined,
      calendarEventId: (m.calendarEventId as string) || (m.googleCalendarEventId as string) || undefined,
      createdAt: (m.createdAt as string) || new Date().toISOString(),
      updatedAt: (m.updatedAt as string) || new Date().toISOString(),
      confidence: (m.confidence as number) ?? (m.aiConfidence as number) ?? undefined,
      detectedIntent: (m.detectedIntent as string) || (m.intentType as string) || undefined,
      originalText: (m.originalText as string) || (m.sourceText as string) || undefined,
      sourceConversation: (m.sourceConversation as string) || undefined,
      autonomyMode: (m.autonomyMode as AutonomyMode) || undefined,
      calendarSynced: (m.calendarSynced as boolean) ?? !!m.calendarEventId,
      reminderSent: (m.reminderSent as boolean) ?? false,
    }));
  };

  // Stats
  const now = new Date();
  const todayMeetings = meetings.filter(m => {
    if (!m.date) return false;
    return isToday(new Date(m.date));
  });
  const weekMeetings = meetings.filter(m => {
    if (!m.date) return false;
    return isThisWeek(new Date(m.date), { weekStartsOn: 1 });
  });
  const upcomingCount = meetings.filter(m => m.status !== 'cancelled').length;
  const avgDuration = meetings.length > 0
    ? Math.round(meetings.reduce((sum, m) => sum + m.duration, 0) / meetings.length)
    : 0;
  const pendingCount = pendingMeetings.length;

  // Handle approve
  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/meetings/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) {
        toast.success('Meeting approved');
        fetchAllData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to approve meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle reject
  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/meetings/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject' }),
      });
      if (res.ok) {
        toast.success('Meeting rejected');
        fetchAllData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to reject meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle cancel
  const handleCancel = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Meeting cancelled');
        fetchAllData();
      } else {
        toast.error('Failed to cancel meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle reschedule - open detail panel
  const handleReschedule = (id: string) => {
    setSelectedMeetingId(id);
    setDetailPanelOpen(true);
  };

  // Handle complete - open detail panel
  const handleComplete = (id: string) => {
    setSelectedMeetingId(id);
    setDetailPanelOpen(true);
  };

  // Handle meeting click
  const handleMeetingClick = (id: string) => {
    setSelectedMeetingId(id);
    setDetailPanelOpen(true);
  };

  // Autonomy mode change
  const handleAutonomyChange = async (mode: AutonomyMode) => {
    setAutonomyMode(mode);
    try {
      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          autonomyMode: mode,
          meetingAutoSchedule: mode !== 'approval',
        }),
      });
      if (res.ok) {
        toast.success(`Autonomy mode set to ${mode}`);
      } else {
        toast.error('Failed to update autonomy mode');
        setAutonomyMode(autonomyMode);
      }
    } catch {
      toast.error('Network error');
      setAutonomyMode(autonomyMode);
    }
  };

  // Connect Google Calendar
  const handleConnectCalendar = () => {
    window.location.href = '/api/integrations/google/connect';
  };

  // Disconnect Google Calendar
  const handleDisconnectCalendar = async () => {
    try {
      const res = await fetch('/api/calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Google Calendar disconnected');
        setCalendarConnected(false);
        setCalendarEmail('');
      } else {
        toast.error('Failed to disconnect calendar');
      }
    } catch {
      toast.error('Network error');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Meetings</h2>
                {upcomingCount > 0 && (
                  <Badge className="bg-teal-500/10 text-teal-600 border-teal-500/20 text-[10px]">
                    {upcomingCount} upcoming
                  </Badge>
                )}
                {pendingCount > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    {pendingCount} pending
                  </Badge>
                )}
                {todayMeetings.length > 0 && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    {todayMeetings.length} today
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Orchestrate, schedule, and track your meetings</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Autonomy Mode Selector */}
            <Select value={autonomyMode} onValueChange={(v) => handleAutonomyChange(v as AutonomyMode)}>
              <SelectTrigger className="h-8 w-[140px] text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approval">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-amber-500" />
                    Approval
                  </div>
                </SelectItem>
                <SelectItem value="assisted">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-teal-500" />
                    Assisted
                  </div>
                </SelectItem>
                <SelectItem value="autonomous">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-emerald-500" />
                    Autonomous
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1"
              onClick={() => setSettingsDialogOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </Button>

            <Button
              size="sm"
              className="text-xs gap-1.5 bg-teal-600 hover:bg-teal-700"
              onClick={() => setScheduleDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Schedule Meeting
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Google Calendar Connection Banner ── */}
      <AnimatePresence>
        {!calendarConnected && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            className="flex items-center justify-between p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-teal-800 dark:text-teal-200">Connect Google Calendar</p>
                <p className="text-xs text-teal-600 dark:text-teal-400">Sync meetings and enable auto-scheduling</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              onClick={handleConnectCalendar}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Connect
            </Button>
          </motion.div>
        )}

        {calendarConnected && calendarEmail && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                Connected to {calendarEmail}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground h-7"
              onClick={handleDisconnectCalendar}
            >
              <Unplug className="h-3 w-3 mr-1" />
              Disconnect
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Today"
          value={todayMeetings.length}
          icon={Calendar}
          color="text-teal-500"
          bgColor="bg-teal-500/10"
        />
        <StatCard
          label="This Week"
          value={weekMeetings.length}
          icon={Users}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Avg Duration"
          value={`${avgDuration}m`}
          icon={Clock}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          label="Upcoming"
          value={upcomingCount}
          icon={Globe}
          color="text-teal-500"
          bgColor="bg-teal-500/10"
        />
        <StatCard
          label="Pending"
          value={pendingCount}
          icon={Sparkles}
          color={pendingCount > 0 ? 'text-amber-500' : 'text-emerald-500'}
          bgColor={pendingCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-xl h-auto">
          <TabsTrigger value="upcoming" className="text-xs gap-1.5 rounded-lg data-[state=active]:bg-teal-500/10 data-[state=active]:text-teal-600">
            <Clock className="h-3 w-3" />
            Upcoming
            {upcomingCount > 0 && (
              <Badge className="text-[8px] h-4 px-1 bg-teal-500/10 text-teal-600 border-teal-500/20">
                {upcomingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs gap-1.5 rounded-lg data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600">
            <Sparkles className="h-3 w-3" />
            Pending Approval
            {pendingCount > 0 && (
              <Badge className="text-[8px] h-4 px-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs gap-1.5 rounded-lg data-[state=active]:bg-slate-500/10 data-[state=active]:text-slate-600">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs gap-1.5 rounded-lg data-[state=active]:bg-teal-500/10 data-[state=active]:text-teal-600">
            <Calendar className="h-3 w-3" />
            Calendar View
          </TabsTrigger>
        </TabsList>

        {/* ── Upcoming Tab ── */}
        <TabsContent value="upcoming">
          <Card className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-500" />
                Upcoming Meetings
                <AutonomyModeBadge mode={autonomyMode} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : meetings.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">No upcoming meetings</p>
                  <p className="text-xs opacity-60 mt-1">Schedule your first meeting to get started</p>
                  <Button
                    size="sm"
                    className="mt-4 text-xs gap-1.5 bg-teal-600 hover:bg-teal-700"
                    onClick={() => setScheduleDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Schedule Meeting
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2.5 pr-1">
                    {meetings
                      .filter(m => m.status !== 'cancelled')
                      .sort((a, b) => {
                        const dateA = new Date(a.date).getTime();
                        const dateB = new Date(b.date).getTime();
                        if (dateA !== dateB) return dateA - dateB;
                        return a.startTime.localeCompare(b.startTime);
                      })
                      .map((meeting) => (
                        <UpcomingMeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          onMeetingClick={handleMeetingClick}
                          onCancel={handleCancel}
                          onReschedule={handleReschedule}
                          onComplete={handleComplete}
                          actionLoading={actionLoading}
                        />
                      ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pending Approval Tab ── */}
        <TabsContent value="pending">
          <Card className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                AI-Suggested Meetings
                <Badge className="text-[8px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                  {pendingCount} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingMeetings.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">No pending approvals</p>
                  <p className="text-xs opacity-60 mt-1">AI-suggested meetings will appear here for your review</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3 pr-1">
                    {pendingMeetings.map((meeting) => (
                      <PendingApprovalCard
                        key={meeting.id}
                        meeting={meeting}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Completed Tab ── */}
        <TabsContent value="completed">
          <Card className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
                Completed Meetings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : completedMeetings.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">No completed meetings yet</p>
                  <p className="text-xs opacity-60 mt-1">Mark meetings as complete to see them here</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2.5 pr-1">
                    {completedMeetings
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((meeting) => (
                        <CompletedMeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          onMeetingClick={handleMeetingClick}
                        />
                      ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Calendar View Tab ── */}
        <TabsContent value="calendar">
          <Card className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal-500" />
                Calendar View
                <AutonomyModeBadge mode={autonomyMode} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <CalendarWeekView
                  meetings={[...meetings, ...completedMeetings]}
                  onMeetingClick={handleMeetingClick}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs & Panels ── */}
      <ScheduleMeetingDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onMeetingCreated={fetchAllData}
      />

      <MeetingSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onSettingsSaved={fetchAllData}
      />

      <MeetingDetailPanel
        meetingId={selectedMeetingId}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        onMeetingUpdated={fetchAllData}
      />
    </div>
  );
}
