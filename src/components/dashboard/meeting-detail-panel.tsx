'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Video,
  Phone,
  MapPin,
  Users,
  Clock,
  Calendar,
  Copy,
  ExternalLink,
  X,
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  FileText,
  UserPlus,
  ArrowRight,
  XCircle,
  Ban,
  Edit3,
  RotateCcw,
  Shield,
  Sparkles,
  Zap,
  Bell,
  Globe,
  CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';

/* ===== Types ===== */
type MeetingType = 'video' | 'phone' | 'in-person';
type MeetingStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'pending_approval';
type AutonomyMode = 'approval' | 'assisted' | 'autonomous';

interface AttendeeInfo {
  email: string;
  name: string;
  rsvpStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}

interface MeetingDetail {
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
  timezone: string;
  attendees: AttendeeInfo[];
  leadId?: string;
  leadName?: string;
  dealId?: string;
  dealName?: string;
  agenda?: string[];
  notes?: string;
  calendarEventId?: string;
  autonomyMode?: AutonomyMode;
  calendarSynced?: boolean;
  reminderSent?: boolean;
  createdAt: string;
  updatedAt: string;
  activityLog?: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
}

interface MeetingDetailPanelProps {
  meetingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMeetingUpdated?: () => void;
}

/* ===== Autonomy Mode Badge ===== */
function AutonomyBadge({ mode }: { mode?: AutonomyMode }) {
  if (!mode) return null;
  const config = {
    approval: { label: 'Approval Required', icon: Shield, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    assisted: { label: 'Assisted', icon: Sparkles, className: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
    autonomous: { label: 'Autonomous', icon: Zap, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  };
  const c = config[mode];
  const Icon = c.icon;
  return (
    <Badge className={cn('text-[8px] h-5 px-1.5 border flex items-center gap-1', c.className)}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </Badge>
  );
}

/* ===== Status Timeline ===== */
function StatusTimeline({ status }: { status: MeetingStatus }) {
  const steps = [
    { id: 'scheduled', label: 'Scheduled', icon: Calendar },
    { id: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
    { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  ];

  const currentIndex = steps.findIndex(s => s.id === status);
  const isCancelled = status === 'cancelled';
  const isPendingApproval = status === 'pending_approval';

  if (isPendingApproval) {
    return (
      <div className="flex items-center gap-2 text-amber-600">
        <Sparkles className="h-4 w-4" />
        <span className="text-xs font-medium">Pending Your Approval</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {isCancelled ? (
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Cancelled</span>
        </div>
      ) : (
        steps.map((s, i) => {
          const Icon = s.icon;
          const isCompleted = i <= currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-1">
                {isCompleted ? (
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center',
                    isCurrent ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-600'
                  )}>
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
                <span className={cn(
                  'text-[9px] font-medium',
                  isCompleted ? 'text-foreground' : 'text-muted-foreground/50'
                )}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn('h-px w-4', i < currentIndex ? 'bg-emerald-400' : 'bg-border')} />
              )}
            </React.Fragment>
          );
        })
      )}
    </div>
  );
}

/* ===== RSVP Badge ===== */
function RsvpBadge({ status }: { status?: string }) {
  if (!status || status === 'needsAction') {
    return <Badge className="text-[8px] bg-muted/30 text-muted-foreground border-border/30">Pending</Badge>;
  }
  const config = {
    accepted: { className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Accepted' },
    declined: { className: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Declined' },
    tentative: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Tentative' },
  };
  const c = config[status as keyof typeof config] || config.tentative;
  return <Badge className={cn('text-[8px] border', c.className)}>{c.label}</Badge>;
}

/* ===== Main Component ===== */
export default function MeetingDetailPanel({
  meetingId,
  open,
  onOpenChange,
  onMeetingUpdated,
}: MeetingDetailPanelProps) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeFollowUp, setCompleteFollowUp] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reschedule dialog state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState(30);

  // Fetch meeting details
  const fetchMeeting = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const m = data.meeting || data;
        setMeeting({
          ...m,
          autonomyMode: m.autonomyMode || undefined,
          calendarSynced: m.calendarSynced ?? !!m.calendarEventId,
          reminderSent: m.reminderSent ?? false,
        });
        setRescheduleDuration(m.duration || 30);
      } else {
        toast.error('Failed to load meeting details');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    let cancelled = false;
    if (open && meetingId) fetchMeeting();
    return () => { cancelled = true; };
  }, [open, meetingId, fetchMeeting]);

  // Copy meet link
  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard');
  };

  // Cancel meeting
  const handleCancel = async () => {
    if (!meeting) return;
    setActionLoading('cancel');
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Meeting cancelled');
        if (onMeetingUpdated) onMeetingUpdated();
        onOpenChange(false);
      } else {
        toast.error('Failed to cancel meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Complete meeting
  const handleComplete = async () => {
    if (!meeting) return;
    setActionLoading('complete');
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: completeNotes, followUpActions: completeFollowUp }),
      });
      if (res.ok) {
        toast.success('Meeting marked as complete');
        setShowCompleteForm(false);
        if (onMeetingUpdated) onMeetingUpdated();
        fetchMeeting();
      } else {
        toast.error('Failed to complete meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Approve meeting
  const handleApprove = async () => {
    if (!meeting) return;
    setActionLoading('approve');
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) {
        toast.success('Meeting approved and scheduled');
        if (onMeetingUpdated) onMeetingUpdated();
        fetchMeeting();
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

  // Reject meeting
  const handleReject = async () => {
    if (!meeting) return;
    setActionLoading('reject');
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject' }),
      });
      if (res.ok) {
        toast.success('Meeting rejected');
        if (onMeetingUpdated) onMeetingUpdated();
        onOpenChange(false);
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

  // Reschedule meeting
  const handleReschedule = async () => {
    if (!meeting || !rescheduleDate || !rescheduleTime) {
      toast.error('Please select a date and time');
      return;
    }

    setActionLoading('reschedule');
    try {
      const startDate = new Date(`${rescheduleDate}T${rescheduleTime}`);
      const endDate = new Date(startDate.getTime() + rescheduleDuration * 60000);

      const res = await fetch(`/api/meetings/${meeting.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          newStartDateTime: startDate.toISOString(),
          newEndDateTime: endDate.toISOString(),
        }),
      });

      if (res.ok) {
        toast.success('Meeting rescheduled successfully');
        setRescheduleDialogOpen(false);
        if (onMeetingUpdated) onMeetingUpdated();
        fetchMeeting();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to reschedule meeting');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Open reschedule dialog
  const openRescheduleDialog = () => {
    if (meeting) {
      setRescheduleDate(meeting.date || '');
      setRescheduleTime(meeting.startTime || '');
      setRescheduleDuration(meeting.duration || 30);
    }
    setRescheduleDialogOpen(true);
  };

  // Get meeting type info
  const getTypeInfo = (type: MeetingType) => {
    switch (type) {
      case 'video': return { label: 'Video Call', icon: Video, color: 'text-teal-600 bg-teal-500/10' };
      case 'phone': return { label: 'Phone Call', icon: Phone, color: 'text-amber-600 bg-amber-500/10' };
      case 'in-person': return { label: 'In-Person', icon: MapPin, color: 'text-rose-600 bg-rose-500/10' };
    }
  };

  // Get status badge
  const getStatusBadge = (status: MeetingStatus) => {
    const config = {
      scheduled: { className: 'bg-teal-500/10 text-teal-600 border-teal-500/20', label: 'Scheduled' },
      confirmed: { className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Confirmed' },
      completed: { className: 'bg-slate-500/10 text-slate-600 border-slate-500/20', label: 'Completed' },
      cancelled: { className: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Cancelled' },
      pending_approval: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Pending Approval' },
    };
    const c = config[status];
    return <Badge className={cn('text-[9px] border', c.className)}>{c.label}</Badge>;
  };

  // Get platform badge
  const getPlatformBadge = (platform?: string) => {
    switch (platform) {
      case 'google_meet':
      case 'google-meet':
        return { label: 'Google Meet', className: 'bg-teal-500/10 text-teal-600 border-teal-500/20' };
      case 'zoom':
        return { label: 'Zoom', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
      case 'teams':
        return { label: 'Teams', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' };
      default:
        return null;
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
                <Calendar className="h-4 w-4" />
              </div>
              Meeting Details
            </SheetTitle>
            <SheetDescription>View and manage your meeting</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : meeting ? (
            <div className="mt-6 space-y-6">
              {/* Title & Status */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-lg font-semibold leading-tight">{meeting.title}</h3>
                  {getStatusBadge(meeting.status)}
                </div>
                {meeting.description && (
                  <p className="text-sm text-muted-foreground">{meeting.description}</p>
                )}
              </div>

              {/* Autonomy Mode Badge */}
              {meeting.autonomyMode && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mode</span>
                  <AutonomyBadge mode={meeting.autonomyMode} />
                </div>
              )}

              {/* Status Timeline */}
              <StatusTimeline status={meeting.status} />

              <Separator />

              {/* Time & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', getTypeInfo(meeting.type).color)}>
                    {React.createElement(getTypeInfo(meeting.type).icon, { className: 'h-4 w-4' })}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                    <p className="text-xs font-medium">{getTypeInfo(meeting.type).label}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
                    <p className="text-xs font-medium">{meeting.duration} min</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Date</p>
                    <p className="text-xs font-medium">{meeting.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</p>
                    <p className="text-xs font-medium">{meeting.startTime} - {meeting.endTime}</p>
                  </div>
                </div>
              </div>

              {/* Platform Badge */}
              {meeting.platform && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Platform</span>
                  {(() => {
                    const pBadge = getPlatformBadge(meeting.platform);
                    if (!pBadge) return <Badge className="text-[9px] border bg-muted/30">{meeting.platform}</Badge>;
                    return <Badge className={cn('text-[9px] border', pBadge.className)}>{pBadge.label}</Badge>;
                  })()}
                </div>
              )}

              {/* Calendar Sync & Reminder Status */}
              <div className="flex items-center gap-3 flex-wrap">
                {meeting.calendarSynced !== undefined && (
                  <div className={cn(
                    'flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border',
                    meeting.calendarSynced
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-muted/30 text-muted-foreground border-border/30'
                  )}>
                    <Calendar className="h-3 w-3" />
                    {meeting.calendarSynced ? 'Calendar Synced' : 'Not Synced'}
                  </div>
                )}
                {meeting.reminderSent !== undefined && (
                  <div className={cn(
                    'flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border',
                    meeting.reminderSent
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-muted/30 text-muted-foreground border-border/30'
                  )}>
                    <Bell className="h-3 w-3" />
                    {meeting.reminderSent ? 'Reminder Sent' : 'No Reminder'}
                  </div>
                )}
              </div>

              {/* Google Meet Link */}
              {(meeting.meetLink || meeting.customLink) && (
                <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-teal-600" />
                      <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
                        {meeting.platform === 'zoom' ? 'Zoom Link' : meeting.platform === 'teams' ? 'Teams Link' : 'Google Meet Link'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-teal-700 dark:text-teal-300 break-all mb-2">
                    {meeting.meetLink || meeting.customLink}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-[10px] bg-teal-600 hover:bg-teal-700"
                      onClick={() => window.open(meeting.meetLink || meeting.customLink, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Join Meeting
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => copyLink(meeting.meetLink || meeting.customLink || '')}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Link
                    </Button>
                  </div>
                </div>
              )}

              {/* Open in Google Calendar */}
              {meeting.calendarEventId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 h-8"
                  onClick={() => window.open(`https://calendar.google.com/calendar/event?eid=${meeting.calendarEventId}`, '_blank')}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Open in Google Calendar
                </Button>
              )}

              {/* Attendees */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Attendees ({meeting.attendees?.length || 0})
                </h4>
                {meeting.attendees && meeting.attendees.length > 0 ? (
                  <div className="space-y-2">
                    {meeting.attendees.map((att, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-500/10 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-teal-600">
                              {(att.name || att.email).slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-medium">{att.name || att.email.split('@')[0]}</p>
                            <p className="text-[10px] text-muted-foreground">{att.email}</p>
                          </div>
                        </div>
                        <RsvpBadge status={att.rsvpStatus} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No attendees added</p>
                )}
              </div>

              {/* Linked Lead/Deal */}
              {(meeting.leadName || meeting.dealName) && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Records</h4>
                  <div className="flex flex-wrap gap-2">
                    {meeting.leadName && (
                      <Badge variant="outline" className="text-xs gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-600">
                        <UserPlus className="h-3 w-3" />
                        Lead: {meeting.leadName}
                      </Badge>
                    )}
                    {meeting.dealName && (
                      <Badge variant="outline" className="text-xs gap-1 bg-amber-500/5 border-amber-500/20 text-amber-600">
                        <ArrowRight className="h-3 w-3" />
                        Deal: {meeting.dealName}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {meeting.agenda && meeting.agenda.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Agenda</h4>
                  <ol className="space-y-1.5">
                    {meeting.agenda.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground font-mono shrink-0">{i + 1}.</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Notes */}
              {meeting.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{meeting.notes}</p>
                </div>
              )}

              {/* Activity History */}
              {meeting.activityLog && meeting.activityLog.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Activity</h4>
                  <div className="space-y-2">
                    {meeting.activityLog.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium">{log.action}</p>
                          {log.details && <p className="text-[9px] text-muted-foreground">{log.details}</p>}
                          <p className="text-[9px] text-muted-foreground/60">
                            {new Date(log.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Pending Approval Actions */}
              {meeting.status === 'pending_approval' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">AI-Suggested Meeting</span>
                    </div>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300">
                      This meeting was suggested by AI. Approve to schedule it or reject to dismiss.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleApprove}
                      disabled={actionLoading === 'approve'}
                    >
                      {actionLoading === 'approve' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={handleReject}
                      disabled={actionLoading === 'reject'}
                    >
                      {actionLoading === 'reject' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Complete Meeting Form */}
              <AnimatePresence>
                {showCompleteForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 p-3 rounded-xl bg-muted/20 border border-border/30">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Mark Meeting Complete
                      </h4>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium">Meeting Notes</Label>
                        <Textarea
                          value={completeNotes}
                          onChange={(e) => setCompleteNotes(e.target.value)}
                          placeholder="Key takeaways, outcomes, decisions..."
                          className="min-h-[80px] resize-none text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium">Follow-up Actions</Label>
                        <Textarea
                          value={completeFollowUp}
                          onChange={(e) => setCompleteFollowUp(e.target.value)}
                          placeholder="Next steps, action items..."
                          className="min-h-[60px] resize-none text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                          onClick={handleComplete}
                          disabled={actionLoading === 'complete'}
                        >
                          {actionLoading === 'complete' ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Save & Complete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => setShowCompleteForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {(meeting.meetLink || meeting.customLink) && meeting.status !== 'cancelled' && meeting.status !== 'completed' && meeting.status !== 'pending_approval' && (
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-xs gap-1"
                    onClick={() => window.open(meeting.meetLink || meeting.customLink, '_blank')}
                  >
                    <Video className="h-3.5 w-3.5" />
                    Join Meeting
                  </Button>
                )}
                {(meeting.status === 'scheduled' || meeting.status === 'confirmed') && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => setShowCompleteForm(true)}
                      disabled={showCompleteForm}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Complete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={openRescheduleDialog}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={handleCancel}
                      disabled={actionLoading === 'cancel'}
                    >
                      {actionLoading === 'cancel' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )}
                      Cancel
                    </Button>
                  </>
                )}
              </div>

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                <span>Created: {new Date(meeting.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(meeting.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Meeting not found</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-teal-600" />
              Reschedule Meeting
            </DialogTitle>
            <DialogDescription>
              Pick a new date and time for this meeting
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">New Date</Label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="h-9"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">New Time</Label>
              <Input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Duration</Label>
              <Select
                value={rescheduleDuration.toString()}
                onValueChange={(v) => setRescheduleDuration(parseInt(v))}
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
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRescheduleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1 bg-teal-600 hover:bg-teal-700"
                onClick={handleReschedule}
                disabled={actionLoading === 'reschedule' || !rescheduleDate || !rescheduleTime}
              >
                {actionLoading === 'reschedule' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Confirm Reschedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
