'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Video,
  Phone,
  MapPin,
  ChevronDown,
  ChevronRight,
  X,
  Timer,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  fetchReminders,
  completeReminder,
  fetchMeetingReminders,
  dismissMeetingReminder,
  snoozeMeetingReminder,
} from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { FollowUpReminder, MeetingReminderInfo } from '@/lib/types';
import { toast } from 'sonner';

// ─── Lead Reminder Helpers ───────────────────────────────

function getRelativeDueTime(dueAt: string): { text: string; isOverdue: boolean; isUrgent: boolean } {
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const isOverdue = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);
  const absDiffMins = Math.floor(absDiffMs / 60000);
  const absDiffHours = Math.floor(absDiffMins / 60);
  const absDiffDays = Math.floor(absDiffHours / 24);

  if (isOverdue) {
    if (absDiffDays > 0) return { text: `Overdue by ${absDiffDays}d`, isOverdue: true, isUrgent: true };
    if (absDiffHours > 0) return { text: `Overdue by ${absDiffHours}h`, isOverdue: true, isUrgent: true };
    return { text: 'Overdue', isOverdue: true, isUrgent: true };
  }

  // Not overdue yet
  if (absDiffMins <= 60) return { text: `Due in ${absDiffMins}m`, isOverdue: false, isUrgent: absDiffMins <= 60 };
  if (absDiffHours <= 24) return { text: `Due in ${absDiffHours}h`, isOverdue: false, isUrgent: absDiffHours <= 1 };
  return { text: `Due in ${absDiffDays}d`, isOverdue: false, isUrgent: false };
}

function getReminderColor(reminder: FollowUpReminder): { bg: string; border: string; text: string; dot: string } {
  const { isOverdue, isUrgent } = getRelativeDueTime(reminder.dueAt);
  if (isOverdue) return { bg: 'bg-red-500/5', border: 'border-l-red-500', text: 'text-red-500', dot: 'bg-red-500' };
  if (isUrgent) return { bg: 'bg-amber-500/5', border: 'border-l-amber-500', text: 'text-amber-500', dot: 'bg-amber-500' };
  return { bg: 'bg-emerald-500/5', border: 'border-l-emerald-500', text: 'text-emerald-500', dot: 'bg-emerald-500' };
}

// ─── Meeting Reminder Helpers ───────────────────────────────

function getMeetingCountdown(startDateTime: string): { text: string; urgency: 'urgent' | 'warning' | 'normal' } {
  const now = new Date();
  const start = new Date(startDateTime);
  const diffMs = start.getTime() - now.getTime();

  if (diffMs < 0) return { text: 'Started', urgency: 'urgent' };

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins <= 15) return { text: `In ${diffMins}m`, urgency: 'urgent' };
  if (diffMins <= 60) return { text: `In ${diffMins}m`, urgency: 'warning' };
  if (diffHours < 24) return { text: `In ${diffHours}h ${diffMins % 60}m`, urgency: 'normal' };
  return { text: `In ${diffDays}d`, urgency: 'normal' };
}

function getMeetingUrgencyStyles(urgency: 'urgent' | 'warning' | 'normal'): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  badge: string;
} {
  switch (urgency) {
    case 'urgent':
      return {
        bg: 'bg-red-500/5',
        border: 'border-l-red-500',
        text: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
        badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
      };
    case 'warning':
      return {
        bg: 'bg-amber-500/5',
        border: 'border-l-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      };
    case 'normal':
      return {
        bg: 'bg-teal-500/5',
        border: 'border-l-teal-500',
        text: 'text-teal-600 dark:text-teal-400',
        dot: 'bg-teal-500',
        badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
      };
  }
}

function getPlatformIcon(platform: string) {
  const lower = platform?.toLowerCase() || '';
  if (lower.includes('google') || lower.includes('meet') || lower.includes('video')) {
    return <Video className="h-3 w-3" />;
  }
  if (lower.includes('phone') || lower.includes('call')) {
    return <Phone className="h-3 w-3" />;
  }
  if (lower.includes('in-person') || lower.includes('office')) {
    return <MapPin className="h-3 w-3" />;
  }
  return <Video className="h-3 w-3" />;
}

// ─── Main Component ───────────────────────────────────────

export default function FollowUpReminders() {
  const queryClient = useQueryClient();
  const { setSelectedLeadId, setActiveTab } = useAppStore();
  const [meetingRemindersOpen, setMeetingRemindersOpen] = useState(true);

  // ─── Lead Follow-up Reminders ───
  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => fetchReminders(),
    refetchInterval: 60000,
  });

  const { data: overdueReminders = [] } = useQuery({
    queryKey: ['reminders', 'overdue'],
    queryFn: () => fetchReminders(true),
    refetchInterval: 60000,
  });

  // ─── Meeting Reminders ───
  const { data: meetingReminders = [], isLoading: meetingRemindersLoading } = useQuery({
    queryKey: ['meeting-reminders'],
    queryFn: () => fetchMeetingReminders(10),
    refetchInterval: 60000,
  });

  // ─── Mutations ───
  const completeMutation = useMutation({
    mutationFn: ({ reminderId, leadId }: { reminderId: string; leadId: string }) =>
      completeReminder(reminderId, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const dismissMeetingMutation = useMutation({
    mutationFn: (reminderId: string) => dismissMeetingReminder(reminderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-reminders'] });
      toast.success('Reminder dismissed');
    },
    onError: () => {
      toast.error('Failed to dismiss reminder');
    },
  });

  const snoozeMeetingMutation = useMutation({
    mutationFn: ({ reminderId, minutes }: { reminderId: string; minutes: number }) =>
      snoozeMeetingReminder(reminderId, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-reminders'] });
      toast.success('Reminder snoozed for 10 minutes');
    },
    onError: () => {
      toast.error('Failed to snooze reminder');
    },
  });

  const displayedReminders = reminders.slice(0, 5);
  const overdueCount = overdueReminders.length;

  // Count meeting reminders by urgency
  const meetingUrgentCount = meetingReminders.filter((r) => {
    const start = new Date(r.startDateTime);
    const diffMins = (start.getTime() - Date.now()) / 60000;
    return diffMins <= 15;
  }).length;

  const handleLeadClick = (leadId: string) => {
    setSelectedLeadId(leadId);
    setActiveTab('leads');
  };

  // ─── Loading State ───
  if (isLoading && meetingRemindersLoading) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Reminders</span>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-md bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty State ───
  // Render nothing when there are no pending reminders: the reference shell
  // shows only Credits + Notifications in the lower sidebar. The widget (and
  // all of its actions) still renders whenever any reminder exists.
  if (reminders.length === 0 && meetingReminders.length === 0) {
    return null;
  }

  return (
    <div className="p-3">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Reminders</span>
        </div>
        <div className="flex items-center gap-1.5">
          {overdueCount > 0 && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/20 text-[10px] px-1.5 py-0">
              {overdueCount} overdue
            </Badge>
          )}
          {meetingUrgentCount > 0 && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/20 text-[10px] px-1.5 py-0">
              {meetingUrgentCount} soon
            </Badge>
          )}
        </div>
      </div>

      {/* ─── Lead Follow-up Reminders Section ─── */}
      {reminders.length > 0 && (
        <ScrollArea className="max-h-72 custom-scrollbar">
          <div className="space-y-1.5">
            {displayedReminders.map((reminder) => {
              const { text: dueText, isOverdue } = getRelativeDueTime(reminder.dueAt);
              const colors = getReminderColor(reminder);

              return (
                <div
                  key={reminder.id}
                  className={cn(
                    'relative flex items-start gap-2 p-2.5 rounded-lg border-l-2 transition-all duration-200',
                    'hover:bg-accent/50 cursor-pointer group',
                    colors.bg,
                    colors.border
                  )}
                  onClick={() => handleLeadClick(reminder.leadId)}
                >
                  {/* Dot indicator */}
                  <div className={cn(
                    'mt-1.5 h-2 w-2 rounded-full shrink-0',
                    isOverdue ? 'animate-pulse' : '',
                    colors.dot
                  )} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                      {reminder.lead?.businessName ?? 'Unknown Lead'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {reminder.message}
                    </p>
                    <p className={cn('text-[10px] font-medium mt-0.5', colors.text)}>
                      {dueText}
                    </p>
                  </div>

                  {/* Complete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      completeMutation.mutate({ reminderId: reminder.id, leadId: reminder.leadId });
                    }}
                    aria-label="Mark as complete"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {reminders.length > 5 && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          +{reminders.length - 5} more reminders
        </p>
      )}

      {/* ─── Section Divider ─── */}
      {reminders.length > 0 && meetingReminders.length > 0 && (
        <div className="my-3 flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-medium">Meetings</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* ─── Meeting Reminders Section ─── */}
      {meetingReminders.length > 0 && (
        <div>
          {/* Collapsible header */}
          <button
            className="flex items-center gap-1.5 w-full mb-2 group"
            onClick={() => setMeetingRemindersOpen(!meetingRemindersOpen)}
          >
            {meetingRemindersOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
            <Calendar className="h-3.5 w-3.5 text-teal-500" />
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Meeting Reminders
            </span>
            <Badge className="ml-auto bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 text-[9px] px-1.5 py-0 h-4">
              {meetingReminders.length}
            </Badge>
          </button>

          {meetingRemindersOpen && (
            <ScrollArea className="max-h-72 custom-scrollbar">
              <div className="space-y-1.5">
                {meetingReminders.map((reminder) => {
                  const { text: countdownText, urgency } = getMeetingCountdown(reminder.startDateTime);
                  const styles = getMeetingUrgencyStyles(urgency);

                  const formatTime = (dateStr: string) => {
                    const d = new Date(dateStr);
                    return d.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                  };

                  return (
                    <div
                      key={reminder.id}
                      className={cn(
                        'relative flex items-start gap-2 p-2.5 rounded-lg border-l-2 transition-all duration-200',
                        'hover:bg-accent/50 group',
                        styles.bg,
                        styles.border
                      )}
                    >
                      {/* Dot indicator */}
                      <div className={cn(
                        'mt-1.5 h-2 w-2 rounded-full shrink-0',
                        urgency === 'urgent' ? 'animate-pulse' : '',
                        styles.dot
                      )} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                            {reminder.meetingTitle}
                          </p>
                        </div>

                        {/* Meeting details row */}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            {getPlatformIcon(reminder.platform)}
                            {formatTime(reminder.startDateTime)}
                          </span>
                          {reminder.leadName && (
                            <span className="text-[10px] text-muted-foreground/70 truncate">
                              · {reminder.leadName}
                            </span>
                          )}
                        </div>

                        {/* Countdown badge */}
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={cn('text-[9px] px-1.5 py-0 h-4 font-semibold border', styles.badge)}
                          >
                            <Timer className="h-2.5 w-2.5 mr-0.5" />
                            {countdownText}
                          </Badge>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => dismissMeetingMutation.mutate(reminder.id)}
                          aria-label="Dismiss reminder"
                          disabled={dismissMeetingMutation.isPending}
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => snoozeMeetingMutation.mutate({ reminderId: reminder.id, minutes: 10 })}
                          aria-label="Snooze reminder 10 min"
                          disabled={snoozeMeetingMutation.isPending}
                        >
                          <Timer className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {meetingReminders.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              +{meetingReminders.length - 5} more meeting reminders
            </p>
          )}
        </div>
      )}

      {/* ─── Both Empty but still show section ─── */}
      {reminders.length === 0 && meetingReminders.length === 0 && (
        <div className="text-center py-4">
          <Bell className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No upcoming reminders</p>
        </div>
      )}
    </div>
  );
}
