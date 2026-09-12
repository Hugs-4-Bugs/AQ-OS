'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Plus,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Video,
  Phone,
  MapPin,
  Loader2,
  AlertCircle,
  Users,
  ArrowUpDown,
  CalendarDays,
} from 'lucide-react';
import MeetingStatsCards from '@/components/meetings/meeting-stats-cards';
import ScheduleMeetingModal from '@/components/meetings/schedule-meeting-modal';

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
  leadId: string | null;
  lead?: {
    id: string;
    businessName: string;
    ownerName: string | null;
  } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ──

function formatMeetingDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.abs(diffMs / (1000 * 60 * 60));

  if (diffMs > 0 && diffHours < 24) {
    // Today
    return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffMs > 0 && diffHours < 48) {
    // Tomorrow
    return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffMs < 0 && diffHours < 24) {
    return `Earlier today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'scheduled':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Scheduled
        </Badge>
      );
    case 'confirmed':
      return (
        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-0 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Confirmed
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    case 'rescheduled':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
          <ArrowUpDown className="h-3 w-3 mr-1" />
          Rescheduled
        </Badge>
      );
    case 'pending_approval':
      return (
        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0 text-xs">
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function getPlatformBadge(platform: string) {
  switch (platform) {
    case 'google_meet':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded">
          <Video className="h-3 w-3" />
          Google Meet
        </span>
      );
    case 'zoom':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
          <Video className="h-3 w-3" />
          Zoom
        </span>
      );
    case 'phone':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">
          <Phone className="h-3 w-3" />
          Phone
        </span>
      );
    case 'in-person':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
          <MapPin className="h-3 w-3" />
          In Person
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">{platform}</span>;
  }
}

function getMeetingTypeIcon(type: string) {
  switch (type) {
    case 'video': return <Video className="h-3.5 w-3.5" />;
    case 'phone': return <Phone className="h-3.5 w-3.5" />;
    case 'in-person': return <MapPin className="h-3.5 w-3.5" />;
    default: return <Video className="h-3.5 w-3.5" />;
  }
}

function parseAttendees(attendeesStr: string): Array<{ email: string; name?: string }> {
  try {
    return JSON.parse(attendeesStr || '[]');
  } catch {
    return [];
  }
}

function sortMeetings(meetings: Meeting[], direction: 'asc' | 'desc' = 'desc'): Meeting[] {
  return [...meetings].sort((a, b) => {
    const dateA = new Date(a.startDateTime).getTime();
    const dateB = new Date(b.startDateTime).getTime();
    return direction === 'desc' ? dateB - dateA : dateA - dateB;
  });
}

// ── Meeting Row ──

function MeetingRow({
  meeting,
  onView,
}: {
  meeting: Meeting;
  onView: (id: string) => void;
}) {
  const attendees = parseAttendees(meeting.attendees);
  const attendeeCount = attendees.length;

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onView(meeting.id)}
    >
      <TableCell className="py-3">
        <div className="flex items-center gap-2 min-w-0">
          {getMeetingTypeIcon(meeting.meetingType)}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[200px]">{meeting.title}</p>
            {meeting.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {meeting.description}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="text-xs">
          <p className="font-medium">{formatMeetingDate(meeting.startDateTime)}</p>
          <p className="text-muted-foreground">{meeting.timezone}</p>
        </div>
      </TableCell>
      <TableCell className="py-3 text-xs">
        {meeting.durationMinutes} min
      </TableCell>
      <TableCell className="py-3">
        {getPlatformBadge(meeting.platform)}
      </TableCell>
      <TableCell className="py-3">
        {meeting.lead ? (
          <span className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">
            {meeting.lead.businessName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-3">
        {getStatusBadge(meeting.status)}
      </TableCell>
      <TableCell className="py-3">
        {attendeeCount > 0 && (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{attendeeCount}</span>
          </div>
        )}
      </TableCell>
      <TableCell className="py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onView(meeting.id);
          }}
        >
          <Eye className="h-3 w-3 mr-1" />
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── Meeting Mobile Card ──

function MeetingMobileCard({
  meeting,
  onView,
}: {
  meeting: Meeting;
  onView: (id: string) => void;
}) {
  const attendees = parseAttendees(meeting.attendees);

  return (
    <div
      className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView(meeting.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {getMeetingTypeIcon(meeting.meetingType)}
          <p className="text-sm font-medium truncate">{meeting.title}</p>
        </div>
        {getStatusBadge(meeting.status)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {formatMeetingDate(meeting.startDateTime)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {meeting.durationMinutes} min
        </span>
      </div>
      <div className="flex items-center gap-2">
        {getPlatformBadge(meeting.platform)}
        {attendees.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {meeting.lead && (
        <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
          Lead: {meeting.lead.businessName}
        </p>
      )}
    </div>
  );
}

// ── Empty State ──

function EmptyState({ tab }: { tab: string }) {
  const messages: Record<string, { title: string; description: string }> = {
    upcoming: {
      title: 'No upcoming meetings',
      description: 'Schedule a new meeting to get started. Your upcoming meetings will appear here.',
    },
    past: {
      title: 'No past meetings',
      description: 'Completed and cancelled meetings will appear here.',
    },
    all: {
      title: 'No meetings yet',
      description: 'Create your first meeting to start tracking your client interactions.',
    },
  };
  const msg = messages[tab] || messages.all;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Calendar className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{msg.title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm">{msg.description}</p>
    </div>
  );
}

// ── Main Page ──

export default function MeetingsDashboardPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) throw new Error('Failed to fetch meetings');
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMeetings();
    return () => { cancelled = true; };
  }, [fetchMeetings]);

  const now = new Date();

  const filteredMeetings = (tab: string) => {
    switch (tab) {
      case 'upcoming':
        return sortMeetings(meetings.filter(
          (m) => new Date(m.startDateTime) >= now && m.status !== 'cancelled'
        ));
      case 'past':
        return sortMeetings(meetings.filter(
          (m) => new Date(m.startDateTime) < now || m.status === 'completed' || m.status === 'cancelled'
        ), 'desc');
      case 'all':
      default:
        return sortMeetings(meetings);
    }
  };

  const handleViewMeeting = (id: string) => {
    router.push(`/dashboard/meetings/${id}`);
  };

  const handleScheduleSuccess = () => {
    fetchMeetings();
  };

  const renderMeetingList = (tab: string) => {
    const filtered = filteredMeetings(tab);

    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-4" />
          <p className="text-sm font-medium mb-1">Failed to load meetings</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchMeetings}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return <EmptyState tab={tab} />;
    }

    return (
      <>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs">Date / Time</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs">Platform</TableHead>
                <TableHead className="text-xs">Lead</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Attendees</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} onView={handleViewMeeting} />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {filtered.map((meeting) => (
            <MeetingMobileCard key={meeting.id} meeting={meeting} onView={handleViewMeeting} />
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
              <p className="text-sm text-muted-foreground">
                Schedule and manage your client meetings
              </p>
            </div>
          </div>
          <Button
            onClick={() => setScheduleOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule Meeting
          </Button>
        </div>

        {/* Stats Cards */}
        <MeetingStatsCards onStatsLoaded={() => {}} />

        {/* Meeting List */}
        <Card className="shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="upcoming" className="text-sm">
                  Upcoming
                </TabsTrigger>
                <TabsTrigger value="past" className="text-sm">
                  Past
                </TabsTrigger>
                <TabsTrigger value="all" className="text-sm">
                  All
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming">
                {renderMeetingList('upcoming')}
              </TabsContent>
              <TabsContent value="past">
                {renderMeetingList('past')}
              </TabsContent>
              <TabsContent value="all">
                {renderMeetingList('all')}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Schedule Meeting Modal */}
        <ScheduleMeetingModal
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          onSuccess={handleScheduleSuccess}
        />
      </div>
    </div>
  );
}
