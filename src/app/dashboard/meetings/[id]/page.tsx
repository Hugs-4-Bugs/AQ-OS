'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft,
  ChevronDown,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  ExternalLink,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  Globe,
  FileText,
  ListTodo,
  User,
  Mail,
  Save,
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquareWarning,
  MailOpen,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import CompleteMeetingModal from '@/components/meetings/complete-meeting-modal';
import RescheduleMeetingModal from '@/components/meetings/reschedule-meeting-modal';

// ── Types ──

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  meetingType: string;
  platform: string;
  meetingUrl: string | null;
  status: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  timezone: string;
  attendees: string;
  location: string | null;
  agenda: string | null;
  notes: string | null;
  followUpActions: string | null;
  leadId: string | null;
  lead?: {
    id: string;
    businessName: string;
    ownerName: string | null;
    email: string | null;
  } | null;
  cancellationReason: string | null;
  recordingUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgendaItem {
  topic: string;
  duration: number;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface SentimentTimelinePoint {
  timestamp: string;
  sentiment: number;
  context: string;
}

interface SentimentResult {
  overall: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;
  timeline: SentimentTimelinePoint[];
}

interface ObjectionItem {
  text: string;
  type: 'price' | 'timing' | 'competitor' | 'authority' | 'need' | 'other';
  severity: 'high' | 'medium' | 'low';
  suggestedResponse: string;
}

interface FollowUpEmailResult {
  subject: string;
  body: string;
}

interface ActionItemResult {
  title: string;
  assignee: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  completed: boolean;
}

// ── Helpers ──

function formatFullDate(dateStr: string, timezone: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'scheduled':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
          <Clock className="h-3 w-3 mr-1" />
          Scheduled
        </Badge>
      );
    case 'confirmed':
      return (
        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-0">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Confirmed
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    case 'rescheduled':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
          <RefreshCw className="h-3 w-3 mr-1" />
          Rescheduled
        </Badge>
      );
    case 'pending_approval':
      return (
        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0">
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case 'google_meet': return <Video className="h-4 w-4 text-teal-600 dark:text-teal-400" />;
    case 'zoom': return <Video className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    default: return <Video className="h-4 w-4 text-muted-foreground" />;
  }
}

function getPlatformName(platform: string): string {
  switch (platform) {
    case 'google_meet': return 'Google Meet';
    case 'zoom': return 'Zoom';
    case 'teams': return 'Microsoft Teams';
    case 'phone': return 'Phone';
    default: return platform;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'high':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">High</Badge>;
    case 'medium':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">Medium</Badge>;
    case 'low':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">Low</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{priority}</Badge>;
  }
}

function getObjectionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    price: 'Price',
    timing: 'Timing',
    competitor: 'Competitor',
    authority: 'Authority',
    need: 'Need',
    other: 'Other',
  };
  return labels[type] || type;
}

function getObjectionTypeBadge(type: string) {
  const colors: Record<string, string> = {
    price: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    timing: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    competitor: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    authority: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    need: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    other: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return (
    <Badge className={`${colors[type] || colors.other} border-0 text-xs`}>
      {getObjectionTypeLabel(type)}
    </Badge>
  );
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'high':
      return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
    case 'medium':
      return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'low':
      return <Minus className="h-4 w-4 text-emerald-500 shrink-0" />;
    default:
      return null;
  }
}

function getSentimentIcon(overall: string) {
  switch (overall) {
    case 'positive':
      return <ThumbsUp className="h-5 w-5 text-emerald-500" />;
    case 'negative':
      return <ThumbsDown className="h-5 w-5 text-red-500" />;
    case 'mixed':
      return <AlertCircle className="h-5 w-5 text-amber-500" />;
    default:
      return <Minus className="h-5 w-5 text-gray-500" />;
  }
}

function getSentimentBadge(overall: string) {
  const colors: Record<string, string> = {
    positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    mixed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return (
    <Badge className={`${colors[overall] || colors.neutral} border-0 capitalize`}>
      {overall}
    </Badge>
  );
}

// ── Copy Button Component ──

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

// ── AI Result Card Wrapper ──

function AIResultCard({
  title,
  icon,
  children,
  actions,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──

export default function MeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Modals
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // AI Insights
  const [aiOpen, setAiOpen] = useState(true);

  // AI Feature States
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaResult, setAgendaResult] = useState<AgendaItem[] | null>(null);
  const [agendaError, setAgendaError] = useState<string | null>(null);

  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentResult, setSentimentResult] = useState<SentimentResult | null>(null);
  const [sentimentError, setSentimentError] = useState<string | null>(null);

  const [objectionsLoading, setObjectionsLoading] = useState(false);
  const [objectionsResult, setObjectionsResult] = useState<ObjectionItem[] | null>(null);
  const [objectionsError, setObjectionsError] = useState<string | null>(null);

  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState<FollowUpEmailResult | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [actionItemsLoading, setActionItemsLoading] = useState(false);
  const [actionItemsResult, setActionItemsResult] = useState<ActionItemResult[] | null>(null);
  const [actionItemsError, setActionItemsError] = useState<string | null>(null);

  // Checked action items
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const fetchMeeting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Meeting not found');
        } else {
          throw new Error('Failed to fetch meeting');
        }
        return;
      }
      const data = await res.json();
      setMeeting(data.meeting);
      setEditNotes(data.meeting.notes || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    let cancelled = false;
    if (meetingId) fetchMeeting();
    return () => { cancelled = true; };
  }, [meetingId, fetchMeeting]);

  // ── AI Fetch Functions ──

  const handleGenerateAgenda = async () => {
    if (!meeting) return;
    setAgendaLoading(true);
    setAgendaError(null);
    setAgendaResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/agenda`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate agenda');
      }
      setAgendaResult(data.agenda);
    } catch (err) {
      setAgendaError(err instanceof Error ? err.message : 'Failed to generate agenda');
    } finally {
      setAgendaLoading(false);
    }
  };

  const handleAnalyzeSentiment = async () => {
    if (!meeting) return;
    setSentimentLoading(true);
    setSentimentError(null);
    setSentimentResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/sentiment`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze sentiment');
      }
      setSentimentResult(data.sentiment);
    } catch (err) {
      setSentimentError(err instanceof Error ? err.message : 'Failed to analyze sentiment');
    } finally {
      setSentimentLoading(false);
    }
  };

  const handleExtractObjections = async () => {
    if (!meeting) return;
    setObjectionsLoading(true);
    setObjectionsError(null);
    setObjectionsResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/objections`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract objections');
      }
      setObjectionsResult(data.objections?.objections || []);
    } catch (err) {
      setObjectionsError(err instanceof Error ? err.message : 'Failed to extract objections');
    } finally {
      setObjectionsLoading(false);
    }
  };

  const handleGenerateFollowUpEmail = async () => {
    if (!meeting) return;
    setEmailLoading(true);
    setEmailError(null);
    setEmailResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/follow-up-email`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate follow-up email');
      }
      setEmailResult(data.email);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to generate follow-up email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGenerateActionItems = async () => {
    if (!meeting) return;
    setActionItemsLoading(true);
    setActionItemsError(null);
    setActionItemsResult(null);
    setCheckedItems(new Set());
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate action items');
      }
      setActionItemsResult(data.actionItems);
    } catch (err) {
      setActionItemsError(err instanceof Error ? err.message : 'Failed to generate action items');
    } finally {
      setActionItemsLoading(false);
    }
  };

  const toggleChecked = (idx: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleSaveNotes = async () => {
    if (!meeting) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      setMeeting({ ...meeting, notes: editNotes });
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (!meeting) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}?reason=${encodeURIComponent(cancelReason)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to cancel meeting');
      setCancelOpen(false);
      setCancelReason('');
      fetchMeeting();
    } catch (err) {
      console.error('Failed to cancel meeting:', err);
    } finally {
      setCancelling(false);
    }
  };

  const handleCompleteSuccess = () => {
    fetchMeeting();
  };

  const handleRescheduleSuccess = () => {
    fetchMeeting();
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <h2 className="text-lg font-semibold mb-1">Loading Meeting</h2>
            <p className="text-sm text-muted-foreground">Fetching meeting details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error State ──
  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-10 w-10 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-1">{error || 'Meeting not found'}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {error || 'This meeting may have been deleted or you do not have access.'}
            </p>
            <Button variant="outline" onClick={() => router.push('/dashboard/meetings')}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Meetings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const attendees = parseJSON<Array<{ email: string; name?: string; status?: string }>>(meeting.attendees, []);
  const agendaItems = parseJSON<string[] | Array<{ title: string; duration?: string }>>(meeting.agenda, []);
  const followUpActions = parseJSON<string[]>(meeting.followUpActions, []);

  const isCompleted = meeting.status === 'completed';
  const isCancelled = meeting.status === 'cancelled';
  const canModify = !isCompleted && !isCancelled;

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/meetings')}
            className="shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {meeting.title}
              </h1>
              {getStatusBadge(meeting.status)}
            </div>
            {meeting.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {meeting.description}
              </p>
            )}
          </div>
        </div>

        {/* Meet Link Button */}
        {meeting.meetingUrl && canModify && (
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white h-12 text-base gap-2">
              <Video className="h-5 w-5" />
              Join Meeting
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        )}

        {/* Meeting Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">Date / Time</span>
              </div>
              <p className="text-sm font-semibold">{formatFullDate(meeting.startDateTime, meeting.timezone)}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Duration</span>
              </div>
              <p className="text-sm font-semibold">{meeting.durationMinutes} minutes</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                {getPlatformIcon(meeting.platform)}
                <span className="text-xs font-medium">Platform</span>
              </div>
              <p className="text-sm font-semibold">{getPlatformName(meeting.platform)}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span className="text-xs font-medium">Timezone</span>
              </div>
              <p className="text-sm font-semibold">{meeting.timezone}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="text-xs font-medium">Location</span>
              </div>
              <p className="text-sm font-semibold">
                {meeting.meetingType === 'in-person'
                  ? meeting.location || 'Not specified'
                  : meeting.meetingType === 'phone'
                    ? 'Phone Call'
                    : 'Virtual'}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">Attendees</span>
              </div>
              <p className="text-sm font-semibold">
                {attendees.length} {attendees.length === 1 ? 'attendee' : 'attendees'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Attendees */}
        {attendees.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Attendees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attendees.map((attendee, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1.5">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {attendee.name || attendee.email}
                      </p>
                      {attendee.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {attendee.email}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lead Linkage */}
        {meeting.lead && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Linked Lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                    {(meeting.lead.businessName || 'L')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{meeting.lead.businessName}</p>
                  {meeting.lead.ownerName && (
                    <p className="text-xs text-muted-foreground">{meeting.lead.ownerName}</p>
                  )}
                  {meeting.lead.email && (
                    <p className="text-xs text-muted-foreground">{meeting.lead.email}</p>
                  )}
                </div>
                <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-0 text-xs shrink-0">
                  Linked
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agenda */}
        {agendaItems.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Agenda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {agendaItems.map((item, idx) => {
                  const title = typeof item === 'string' ? item : item.title;
                  return (
                    <div key={idx} className="flex items-start gap-3 py-1">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-xs font-medium shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm">{title}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Meeting Notes
              </CardTitle>
              {editNotes !== (meeting.notes || '') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="h-8 text-xs"
                >
                  {savingNotes ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Save
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add meeting notes here..."
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={4}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Follow-up Actions */}
        {followUpActions.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Follow-up Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {followUpActions.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="h-5 w-5 rounded border-2 border-amber-300 dark:border-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      {typeof action === 'string' ? (
                        <p className="text-sm">{action}</p>
                      ) : (
                        <p className="text-sm">{JSON.stringify(action)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancellation Reason */}
        {isCancelled && meeting.cancellationReason && (
          <Card className="shadow-sm border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Cancellation Reason</p>
                  <p className="text-sm text-muted-foreground mt-1">{meeting.cancellationReason}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {canModify && (
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => setCompleteOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Meeting
                </Button>
                <Button
                  onClick={() => setRescheduleOpen(true)}
                  variant="outline"
                  className="flex-1 sm:flex-none"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reschedule
                </Button>
                <Button
                  onClick={() => setCancelOpen(true)}
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800 flex-1 sm:flex-none"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Meeting
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── AI Insights Section ── */}
        <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
          <Card className="shadow-sm border-purple-200 dark:border-purple-800/50">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <div>
                      <CardTitle className="text-base">AI Insights</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Generate AI-powered analysis and content for this meeting
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${aiOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                {/* AI Action Buttons Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Generate Agenda */}
                  <Button
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start gap-3 border-dashed hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                    onClick={handleGenerateAgenda}
                    disabled={agendaLoading}
                  >
                    {agendaLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
                    ) : (
                      <ListTodo className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">Generate Agenda</p>
                      <p className="text-xs text-muted-foreground">AI-powered meeting agenda</p>
                    </div>
                  </Button>

                  {/* Analyze Sentiment - only for completed meetings */}
                  <Button
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start gap-3 border-dashed hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                    onClick={handleAnalyzeSentiment}
                    disabled={sentimentLoading || !isCompleted}
                  >
                    {sentimentLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
                    ) : (
                      <ThumbsUp className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">Analyze Sentiment</p>
                      <p className="text-xs text-muted-foreground">
                        {!isCompleted ? 'Requires completed meeting' : 'Analyze meeting tone'}
                      </p>
                    </div>
                  </Button>

                  {/* Extract Objections - only for completed meetings */}
                  <Button
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start gap-3 border-dashed hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                    onClick={handleExtractObjections}
                    disabled={objectionsLoading || !isCompleted}
                  >
                    {objectionsLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
                    ) : (
                      <MessageSquareWarning className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">Extract Objections</p>
                      <p className="text-xs text-muted-foreground">
                        {!isCompleted ? 'Requires completed meeting' : 'Identify raised objections'}
                      </p>
                    </div>
                  </Button>

                  {/* Generate Follow-up Email */}
                  <Button
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start gap-3 border-dashed hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                    onClick={handleGenerateFollowUpEmail}
                    disabled={emailLoading}
                  >
                    {emailLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
                    ) : (
                      <MailOpen className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">Follow-up Email</p>
                      <p className="text-xs text-muted-foreground">Generate a follow-up email</p>
                    </div>
                  </Button>

                  {/* Generate Action Items */}
                  <Button
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start gap-3 border-dashed hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                    onClick={handleGenerateActionItems}
                    disabled={actionItemsLoading}
                  >
                    {actionItemsLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
                    ) : (
                      <ClipboardList className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">Action Items</p>
                      <p className="text-xs text-muted-foreground">Extract actionable tasks</p>
                    </div>
                  </Button>
                </div>

                {/* ── AI Result Displays ── */}

                {/* Agenda Result */}
                {(agendaLoading || agendaError || agendaResult) && (
                  <AIResultCard
                    title="Generated Agenda"
                    icon={<ListTodo className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                    actions={
                      agendaResult && (
                        <CopyButton text={agendaResult.map((item, i) => `${i + 1}. ${item.topic} (${item.duration}min) - ${item.description}`).join('\n')} />
                      )
                    }
                  >
                    {agendaLoading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        <p className="text-sm text-muted-foreground">Generating agenda with AI...</p>
                      </div>
                    )}
                    {agendaError && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{agendaError}</p>
                      </div>
                    )}
                    {agendaResult && agendaResult.length > 0 && (
                      <div className="space-y-3">
                        {agendaResult.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-lg border border-purple-100 dark:border-purple-800/50"
                          >
                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{item.topic}</p>
                                {getPriorityBadge(item.priority)}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.duration} min
                              </p>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground text-right">
                          Total: {agendaResult.reduce((sum, item) => sum + item.duration, 0)} minutes
                        </p>
                      </div>
                    )}
                  </AIResultCard>
                )}

                {/* Sentiment Result */}
                {(sentimentLoading || sentimentError || sentimentResult) && (
                  <AIResultCard
                    title="Sentiment Analysis"
                    icon={sentimentResult ? getSentimentIcon(sentimentResult.overall) : <ThumbsUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                    actions={
                      sentimentResult && (
                        <CopyButton text={`Overall: ${sentimentResult.overall} (${Math.round(sentimentResult.confidence * 100)}% confidence)`} />
                      )
                    }
                  >
                    {sentimentLoading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        <p className="text-sm text-muted-foreground">Analyzing sentiment with AI...</p>
                      </div>
                    )}
                    {sentimentError && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{sentimentError}</p>
                      </div>
                    )}
                    {sentimentResult && (
                      <div className="space-y-4">
                        {/* Overall Sentiment */}
                        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            {getSentimentIcon(sentimentResult.overall)}
                            {getSentimentBadge(sentimentResult.overall)}
                          </div>
                          <Separator orientation="vertical" className="h-8" />
                          <div>
                            <p className="text-xs text-muted-foreground">Confidence</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-purple-500 transition-all"
                                  style={{ width: `${Math.round(sentimentResult.confidence * 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold">{Math.round(sentimentResult.confidence * 100)}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Sentiment Timeline */}
                        {sentimentResult.timeline.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Sentiment Timeline</p>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {sentimentResult.timeline.map((point, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30"
                                >
                                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                                    point.sentiment > 0.3
                                      ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                      : point.sentiment < -0.3
                                        ? 'bg-red-100 dark:bg-red-900/30'
                                        : 'bg-gray-100 dark:bg-gray-800'
                                  }`}>
                                    {point.sentiment > 0.3 ? (
                                      <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                    ) : point.sentiment < -0.3 ? (
                                      <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                    ) : (
                                      <Minus className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm">{point.context}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Score: {point.sentiment.toFixed(2)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </AIResultCard>
                )}

                {/* Objections Result */}
                {(objectionsLoading || objectionsError || objectionsResult) && (
                  <AIResultCard
                    title="Extracted Objections"
                    icon={<MessageSquareWarning className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                    actions={
                      objectionsResult && objectionsResult.length > 0 && (
                        <CopyButton text={objectionsResult.map((o, i) => `${i + 1}. [${o.type}/${o.severity}] ${o.text}\n   Suggested: ${o.suggestedResponse}`).join('\n\n')} />
                      )
                    }
                  >
                    {objectionsLoading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        <p className="text-sm text-muted-foreground">Extracting objections with AI...</p>
                      </div>
                    )}
                    {objectionsError && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{objectionsError}</p>
                      </div>
                    )}
                    {objectionsResult && (
                      <>
                        {objectionsResult.length === 0 ? (
                          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                            <p className="text-sm text-emerald-700 dark:text-emerald-400">No objections detected in this meeting.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {objectionsResult.map((obj, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/50"
                              >
                                <div className="flex items-start gap-3">
                                  {getSeverityIcon(obj.severity)}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      {getObjectionTypeBadge(obj.type)}
                                      {getPriorityBadge(obj.severity)}
                                    </div>
                                    <p className="text-sm font-medium">&ldquo;{obj.text}&rdquo;</p>
                                    <div className="mt-2 p-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded border border-emerald-200/50 dark:border-emerald-800/50">
                                      <p className="text-xs text-muted-foreground mb-0.5">Suggested Response</p>
                                      <p className="text-sm text-emerald-700 dark:text-emerald-400">{obj.suggestedResponse}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </AIResultCard>
                )}

                {/* Follow-up Email Result */}
                {(emailLoading || emailError || emailResult) && (
                  <AIResultCard
                    title="Follow-up Email"
                    icon={<MailOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                    actions={
                      emailResult && (
                        <CopyButton text={`Subject: ${emailResult.subject}\n\n${emailResult.body}`} />
                      )
                    }
                  >
                    {emailLoading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        <p className="text-sm text-muted-foreground">Generating follow-up email with AI...</p>
                      </div>
                    )}
                    {emailError && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{emailError}</p>
                      </div>
                    )}
                    {emailResult && (
                      <div className="space-y-3">
                        {/* Subject */}
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Subject</p>
                          <p className="text-sm font-medium">{emailResult.subject}</p>
                        </div>
                        {/* Body */}
                        <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border">
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {emailResult.body}
                          </div>
                        </div>
                      </div>
                    )}
                  </AIResultCard>
                )}

                {/* Action Items Result */}
                {(actionItemsLoading || actionItemsError || actionItemsResult) && (
                  <AIResultCard
                    title="Action Items"
                    icon={<ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                    actions={
                      actionItemsResult && actionItemsResult.length > 0 && (
                        <CopyButton text={actionItemsResult.map((item, i) => `${checkedItems.has(i) ? '✓' : '○'} ${item.title} — ${item.assignee} (Due: ${new Date(item.dueDate).toLocaleDateString()}, ${item.priority} priority)`).join('\n')} />
                      )
                    }
                  >
                    {actionItemsLoading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        <p className="text-sm text-muted-foreground">Generating action items with AI...</p>
                      </div>
                    )}
                    {actionItemsError && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{actionItemsError}</p>
                      </div>
                    )}
                    {actionItemsResult && actionItemsResult.length > 0 && (
                      <div className="space-y-2">
                        {actionItemsResult.map((item, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                              checkedItems.has(idx)
                                ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                                : 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-800/50'
                            }`}
                            onClick={() => toggleChecked(idx)}
                          >
                            <div className={`h-5 w-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                              checkedItems.has(idx)
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-purple-300 dark:border-purple-600'
                            }`}>
                              {checkedItems.has(idx) && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${checkedItems.has(idx) ? 'line-through text-muted-foreground' : ''}`}>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap mt-1">
                                {getPriorityBadge(item.priority)}
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.assignee}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground text-right mt-1">
                          {checkedItems.size} of {actionItemsResult.length} completed
                        </p>
                      </div>
                    )}
                  </AIResultCard>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Separator />

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          Meeting created {new Date(meeting.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
          {' · '}
          Last updated {new Date(meeting.updatedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>

        {/* Modals */}
        <CompleteMeetingModal
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          onSuccess={handleCompleteSuccess}
        />

        <RescheduleMeetingModal
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          meeting={meeting}
          onSuccess={handleRescheduleSuccess}
        />

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Cancel Meeting
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel &quot;{meeting.title}&quot;? This action cannot be undone.
                {meeting.meetingUrl && ' The Google Calendar event will also be deleted.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <label className="text-sm font-medium mb-1.5 block">
                Reason for cancellation (optional)
              </label>
              <Textarea
                placeholder="Why is this meeting being cancelled?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Keep Meeting</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelMeeting}
                disabled={cancelling}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Meeting'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
