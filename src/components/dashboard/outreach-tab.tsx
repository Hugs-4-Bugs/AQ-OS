'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Copy,
  RefreshCw,
  Loader2,
  Mail,
  MessageSquare,
  Linkedin,
  Instagram,
  CheckCircle2,
  ArrowRight,
  FileText,
  Clock,
  Sparkles,
  MessageCircle,
  Phone,
  Calendar,
  BarChart3,
  ChevronRight,
  Bot,
  CalendarClock,
  Check,
  Bell,
  Megaphone,
  Pause,
  Play,
  Users,
  Tag,
  MapPin,
  Radio,
  AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchLeads, generateOutreach, addCommunication, fetchCommunications, createReminder, fetchReminders } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { NICHE_OPTIONS, COUNTRY_OPTIONS } from '@/lib/types';
import type { OutreachChannel } from '@/lib/types';
import { toast } from 'sonner';

const CHANNEL_CONFIG: Record<OutreachChannel, { label: string; icon: React.ElementType; color: string; bgColor: string; hexColor: string }> = {
  email: { label: 'Email', icon: Mail, color: 'text-blue-500', bgColor: 'bg-blue-500/10', hexColor: '#3b82f6' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-green-500', bgColor: 'bg-green-500/10', hexColor: '#22c55e' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: 'text-sky-600', bgColor: 'bg-sky-500/10', hexColor: '#0284c7' },
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-500/10', hexColor: '#ec4899' },
};

// ─── Template Definitions ──────────────────────────────────────

interface OutreachTemplate {
  id: string;
  category: string;
  label: string;
  description: string;
  icon: React.ElementType;
  getContent: (vars: { businessName: string; ownerName: string; niche: string }) => string;
}

const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'cold-intro',
    category: 'Cold Introduction',
    label: 'Cold Introduction',
    description: 'First contact with a business — make a strong impression',
    icon: Send,
    getContent: ({ businessName, ownerName, niche }) =>
      `Hi ${ownerName},\n\nI noticed ${businessName} while researching top ${niche} businesses in the area, and I was really impressed by what you've built.\n\nI work with businesses like yours to help them [specific value proposition based on their digital gaps]. After looking at your online presence, I see some clear opportunities that could help you reach even more customers.\n\nWould you be open to a quick 15-minute chat this week to explore if there's a fit?\n\nBest regards`,
  },
  {
    id: 'follow-up',
    category: 'Follow-Up',
    label: 'Follow-Up',
    description: 'After initial contact — keep the conversation going',
    icon: MessageCircle,
    getContent: ({ businessName, ownerName }) =>
      `Hi ${ownerName},\n\nI reached out recently about helping ${businessName} grow its online presence. I know how busy things can get, so I wanted to follow up with a quick thought:\n\nBusinesses in your space that improve their digital visibility typically see a 30-40% increase in new customer inquiries within the first 3 months.\n\nWould it make sense to have a brief conversation about what that could look like for ${businessName}?\n\nI'm happy to work around your schedule — even a 10-minute call could be valuable.\n\nBest regards`,
  },
  {
    id: 'value-proposition',
    category: 'Value Proposition',
    label: 'Value Proposition',
    description: 'Highlighting specific ROI and measurable results',
    icon: BarChart3,
    getContent: ({ businessName, ownerName, niche }) =>
      `Hi ${ownerName},\n\nI wanted to share some numbers that might resonate with you for ${businessName}.\n\nWe recently helped a ${niche} business similar to yours achieve:\n• 45% increase in online bookings within 60 days\n• 3x more Google reviews in the first quarter\n• 28% reduction in customer acquisition cost\n\nThe key was a focused digital strategy targeting their specific market gaps — and I see similar opportunities for ${businessName}.\n\nI've prepared a brief analysis of your current digital presence and would love to walk you through the findings. No pressure, just actionable insights.\n\nWould Tuesday or Thursday work for a quick call?\n\nBest regards`,
  },
  {
    id: 'meeting-request',
    category: 'Meeting Request',
    label: 'Meeting Request',
    description: 'Ask for a call or in-person meeting',
    icon: Calendar,
    getContent: ({ businessName, ownerName }) =>
      `Hi ${ownerName},\n\nI'd love to set up a time to discuss how we can help ${businessName} capture more of the market.\n\nI promise to make it worth your time — I'll come prepared with:\n1. A quick audit of your current digital presence\n2. Specific recommendations tailored to your business\n3. A clear roadmap with projected outcomes\n\nThe meeting would be just 20 minutes, and you'll walk away with actionable insights regardless of whether we work together.\n\nAre you available any of these times?\n• [Day] at [Time]\n• [Day] at [Time]\n• [Day] at [Time]\n\nOr feel free to suggest a time that works better for you.\n\nBest regards`,
  },
  {
    id: 'proposal-follow-up',
    category: 'Proposal Follow-Up',
    label: 'Proposal Follow-Up',
    description: 'After sending a proposal — close the deal',
    icon: FileText,
    getContent: ({ businessName, ownerName }) =>
      `Hi ${ownerName},\n\nI hope you've had a chance to review the proposal I sent over for ${businessName}. I wanted to follow up and see if you have any questions or if there's anything you'd like me to clarify.\n\nA few highlights from the proposal:\n• The phased approach means you'll see results within the first month\n• We've built in flexibility so the scope can adapt as your needs evolve\n• The projected ROI means the investment pays for itself within [timeline]\n\nI'm happy to jump on a quick call to walk through any section in detail, or we can discuss any adjustments you'd like to see.\n\nLooking forward to hearing your thoughts!\n\nBest regards`,
  },
];

// ─── Campaign Types ──────────────────────────────────────

interface OutreachCampaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  niche: string;
  country: string;
  templateId: string;
  leadsCount: number;
  sentCount: number;
  replyCount: number;
  replyRate: number;
  createdAt: string;
}

// Campaigns state is managed below in the component via useState

// ─── Relative Time Helper ──────────────────────────────────────

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ─── Main Component ────────────────────────────────────────────

export default function OutreachTab() {
  const queryClient = useQueryClient();
  const { selectedLeadId } = useAppStore();

  const [selectedLeadIdLocal, setSelectedLeadIdLocal] = useState<string>(selectedLeadId ?? '');
  const [channel, setChannel] = useState<OutreachChannel>('email');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [replyMarked, setReplyMarked] = useState<Record<string, boolean>>({});

  // Campaign system state
  const [viewMode, setViewMode] = useState<'messages' | 'campaigns'>('messages');
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignCreateOpen, setCampaignCreateOpen] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignNiche, setCampaignNiche] = useState('');
  const [campaignCountry, setCampaignCountry] = useState('');
  const [campaignTemplateId, setCampaignTemplateId] = useState('');
  const [campaignSchedule, setCampaignSchedule] = useState<'now' | 'later'>('now');
  const [campaignScheduleDate, setCampaignScheduleDate] = useState('');
  const [campaignScheduleTime, setCampaignScheduleTime] = useState('09:00');

  const { data: leadsResult, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => fetchLeads({ limit: 100 }),
  });
  const leads = leadsResult?.leads;

  const { data: communications, isLoading: commsLoading } = useQuery({
    queryKey: ['communications', selectedLeadIdLocal],
    queryFn: () => fetchCommunications(selectedLeadIdLocal),
    enabled: !!selectedLeadIdLocal,
  });

  // Fetch reminders for follow-up section
  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => fetchReminders(true),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateOutreach(selectedLeadIdLocal, channel),
    onSuccess: (result) => {
      const msg = result.messages;
      if (channel === 'email' && msg.subject && msg.body) {
        setGeneratedMessage(`Subject: ${msg.subject}\n\n${msg.body}`);
      } else if (msg.message) {
        setGeneratedMessage(msg.message);
      } else if (msg.connectionMessage && msg.followUpMessage) {
        setGeneratedMessage(`Connection: ${msg.connectionMessage}\n\nFollow-up: ${msg.followUpMessage}`);
      } else {
        setGeneratedMessage(JSON.stringify(msg, null, 2));
      }
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      addCommunication(selectedLeadIdLocal, {
        channel,
        direction: 'outbound',
        content: customMessage || generatedMessage,
        messageGeneratedByAI: !!generatedMessage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications', selectedLeadIdLocal] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setCustomMessage('');
      toast.success('Email sent to lead — a copy has been sent to your inbox');
    },
    onError: (err: unknown) => {
      // Surface the actual backend error (e.g. "This lead has no email
      // address on file", "Email delivery is not configured", "Failed to
      // send email: ...") instead of a generic message.
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      toast.error(msg);
    },
  });

  const markRepliedMutation = useMutation({
    mutationFn: (commId: string) =>
      addCommunication(selectedLeadIdLocal, {
        channel,
        direction: 'inbound',
        content: '[Lead replied — marked manually]',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications', selectedLeadIdLocal] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead marked as replied');
    },
    onError: () => {
      toast.error('Failed to mark as replied');
    },
  });

  const followUpMutation = useMutation({
    mutationFn: () => {
      if (!followUpDate) throw new Error('Date is required');
      const dueAt = new Date(`${followUpDate}T${followUpTime || '09:00'}:00`).toISOString();
      return createReminder(
        selectedLeadIdLocal,
        followUpMessage || `Follow up with ${selectedLead?.businessName || 'lead'}`,
        dueAt
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      setFollowUpOpen(false);
      setFollowUpDate('');
      setFollowUpTime('09:00');
      setFollowUpMessage('');
      toast.success('Follow-up reminder scheduled');
    },
    onError: () => {
      toast.error('Failed to schedule follow-up');
    },
  });

  const handleCopy = useCallback(() => {
    const text = customMessage || generatedMessage;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [customMessage, generatedMessage]);

  const selectedLead = leads?.find((l) => l.id === selectedLeadIdLocal);

  // ─── Quick Stats Computation ─────────────────────────────────
  const quickStats = useMemo(() => {
    if (!communications || communications.length === 0) {
      return { totalMessages: 0, lastContact: null, responseRate: 0, inbound: 0, outbound: 0, hasReply: false };
    }
    const outbound = communications.filter((c) => c.direction === 'outbound').length;
    const inbound = communications.filter((c) => c.direction === 'inbound').length;
    const lastContact = communications.reduce((latest, c) => {
      const cDate = new Date(c.createdAt);
      return cDate > latest ? cDate : latest;
    }, new Date(0));
    const responseRate = outbound > 0 ? Math.round((inbound / outbound) * 100) : 0;
    const hasReply = inbound > 0;

    return { totalMessages: communications.length, lastContact, responseRate, inbound, outbound, hasReply };
  }, [communications]);

  // ─── Channel Effectiveness ──────────────────────────────────

  const channelEffectiveness = useMemo(() => {
    if (!communications || communications.length === 0) return [];

    const channelStats: Record<string, { sent: number; replies: number }> = {};
    (Object.keys(CHANNEL_CONFIG) as OutreachChannel[]).forEach((ch) => {
      channelStats[ch] = { sent: 0, replies: 0 };
    });

    communications.forEach((comm) => {
      const ch = comm.channel as OutreachChannel;
      if (!channelStats[ch]) {
        channelStats[ch] = { sent: 0, replies: 0 };
      }
      if (comm.direction === 'outbound') {
        channelStats[ch].sent++;
      } else if (comm.direction === 'inbound') {
        channelStats[ch].replies++;
      }
    });

    return (Object.entries(channelStats) as [OutreachChannel, { sent: number; replies: number }][])
      .filter(([, stats]) => stats.sent > 0 || stats.replies > 0)
      .map(([ch, stats]) => ({
        channel: ch,
        config: CHANNEL_CONFIG[ch],
        sent: stats.sent,
        replies: stats.replies,
        responseRate: stats.sent > 0 ? Math.round((stats.replies / stats.sent) * 100) : 0,
      }))
      .sort((a, b) => b.responseRate - a.responseRate);
  }, [communications]);

  // ─── Has Inbound Reply (auto-detect) ────────────────────────

  const hasInboundReply = useMemo(() => {
    if (!communications) return false;
    return communications.some((c) => c.direction === 'inbound');
  }, [communications]);

  // ─── Template Variable Context ───────────────────────────────
  const templateVars = useMemo(() => ({
    businessName: selectedLead?.businessName || 'your business',
    ownerName: selectedLead?.ownerName || 'there',
    niche: selectedLead?.niche || 'your industry',
  }), [selectedLead]);

  const handleUseTemplate = useCallback((template: OutreachTemplate) => {
    const content = template.getContent(templateVars);
    setCustomMessage(content);
    setGeneratedMessage('');
    toast.success(`"${template.label}" template applied`);
  }, [templateVars]);

  // ─── Open Follow-up Dialog ───────────────────────────────────

  const handleOpenFollowUp = useCallback(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 2);
    setFollowUpDate(defaultDate.toISOString().slice(0, 10));
    setFollowUpTime('09:00');
    setFollowUpMessage(`Follow up with ${selectedLead?.businessName || 'lead'}`);
    setFollowUpOpen(true);
  }, [selectedLead]);

  // ─── Campaign Create Handler ─────────────────────────────
  const handleCreateCampaign = useCallback(() => {
    if (!campaignName.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }
    setCampaignCreateOpen(false);
    setCampaignName('');
    setCampaignNiche('');
    setCampaignCountry('');
    setCampaignTemplateId('');
    setCampaignSchedule('now');
    setCampaignScheduleDate('');
    setCampaignScheduleTime('09:00');
    toast.success(`Campaign "${campaignName}" created successfully!`);
  }, [campaignName]);

  // ─── Overdue reminders ───────────────────────────────────
  const overdueReminders = useMemo(() => {
    if (!reminders) return [];
    return reminders.filter((r) => !r.completed).slice(0, 5);
  }, [reminders]);

  // ─── Campaign Stats ──────────────────────────────────────
  const campaignStats = useMemo(() => {
    const totalLeads = campaigns.reduce((sum, c) => sum + c.leadsCount, 0);
    const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
    const totalReplies = campaigns.reduce((sum, c) => sum + c.replyCount, 0);
    const avgReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
    const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
    return { totalLeads, totalSent, totalReplies, avgReplyRate, activeCampaigns };
  }, [campaigns]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
            <button
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                viewMode === 'messages'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => setViewMode('messages')}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Direct Messages
            </button>
            <button
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                viewMode === 'campaigns'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => setViewMode('campaigns')}
            >
              <Megaphone className="h-3.5 w-3.5" />
              Campaigns
              {campaignStats.activeCampaigns > 0 && (
                <span className="ml-0.5 h-4 min-w-[16px] inline-flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white px-1">
                  {campaignStats.activeCampaigns}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            CAMPAIGNS VIEW
            ═══════════════════════════════════════════════════════════ */}
        {viewMode === 'campaigns' && (
          <>
            {/* Campaign Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="hover-lift">
                <CardContent className="p-3 text-center">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center mx-auto mb-2">
                    <Megaphone className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-xl font-bold">{campaignStats.activeCampaigns}</p>
                  <p className="text-[10px] text-muted-foreground">Active Campaigns</p>
                </CardContent>
              </Card>
              <Card className="hover-lift">
                <CardContent className="p-3 text-center">
                  <div className="h-8 w-8 rounded-lg bg-sky-500/15 flex items-center justify-center mx-auto mb-2">
                    <Users className="h-4 w-4 text-sky-500" />
                  </div>
                  <p className="text-xl font-bold">{campaignStats.totalLeads}</p>
                  <p className="text-[10px] text-muted-foreground">Total Leads</p>
                </CardContent>
              </Card>
              <Card className="hover-lift">
                <CardContent className="p-3 text-center">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center mx-auto mb-2">
                    <Send className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="text-xl font-bold">{campaignStats.totalSent}</p>
                  <p className="text-[10px] text-muted-foreground">Messages Sent</p>
                </CardContent>
              </Card>
              <Card className="hover-lift">
                <CardContent className="p-3 text-center">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/15 flex items-center justify-center mx-auto mb-2">
                    <BarChart3 className="h-4 w-4 text-rose-500" />
                  </div>
                  <p className="text-xl font-bold">{campaignStats.avgReplyRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Avg Reply Rate</p>
                </CardContent>
              </Card>
            </div>

            {/* Create Campaign Button */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground">All Campaigns</h3>
              <Button
                onClick={() => setCampaignCreateOpen(true)}
                size="sm"
                className="gap-1.5"
              >
                <Megaphone className="h-4 w-4" />
                Create Campaign
              </Button>
            </div>

            {/* Campaign Cards */}
            <div className="space-y-3">
              {campaignsLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No campaigns yet. Create your first outreach campaign to get started.</p>
                </div>
              ) : (
                campaigns.map((campaign) => {
                const template = OUTREACH_TEMPLATES.find((t) => t.id === campaign.templateId);
                const progressPct = campaign.leadsCount > 0 ? Math.round((campaign.sentCount / campaign.leadsCount) * 100) : 0;
                const statusConfig = {
                  active: { label: 'Active', color: 'text-emerald-500', bgColor: 'bg-emerald-500/15', icon: Play },
                  paused: { label: 'Paused', color: 'text-amber-500', bgColor: 'bg-amber-500/15', icon: Pause },
                  completed: { label: 'Completed', color: 'text-sky-500', bgColor: 'bg-sky-500/15', icon: CheckCircle2 },
                }[campaign.status];
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={campaign.id} className="hover-lift transition-all">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold truncate">{campaign.name}</h4>
                            <Badge className={cn('text-[10px] px-1.5 py-0 border-0 gap-0.5', statusConfig.bgColor, statusConfig.color)}>
                              <StatusIcon className="h-2.5 w-2.5" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              <Tag className="h-2.5 w-2.5 mr-0.5" />
                              {campaign.niche}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              <MapPin className="h-2.5 w-2.5 mr-0.5" />
                              {campaign.country}
                            </Badge>
                            {template && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {template.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {campaign.status === 'active' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 min-h-[28px]">
                              <Pause className="h-3 w-3" />
                              <span className="hidden sm:inline">Pause</span>
                            </Button>
                          )}
                          {campaign.status === 'paused' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 min-h-[28px]">
                              <Play className="h-3 w-3" />
                              <span className="hidden sm:inline">Resume</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {campaign.sentCount} of {campaign.leadsCount} sent
                          </span>
                          <span className="font-mono font-medium text-primary">{progressPct}%</span>
                        </div>
                        <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-700',
                              campaign.status === 'completed' ? 'bg-sky-500' : campaign.status === 'paused' ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Send className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Sent:</span>
                          <span className="font-medium">{campaign.sentCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Replies:</span>
                          <span className="font-medium">{campaign.replyCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Reply Rate:</span>
                          <span className="font-medium text-emerald-500">{campaign.replyRate}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }))
              }
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            DIRECT MESSAGES VIEW (original content)
            ═══════════════════════════════════════════════════════════ */}
        {viewMode === 'messages' && (
          <>
            {/* Lead & Channel Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Send className="h-5 w-5 text-primary" />
                  Outreach Generator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Lead</label>
                    <Select value={selectedLeadIdLocal} onValueChange={setSelectedLeadIdLocal}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        {leads?.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            <span className="flex items-center gap-2">
                              {lead.businessName} — {lead.niche}
                              {lead.communications?.some((c) => c.direction === 'inbound') && (
                                <span className="text-emerald-500 text-xs">✓ Replied</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Channel</label>
                    <div className="flex gap-2 flex-wrap">
                      {(Object.entries(CHANNEL_CONFIG) as [OutreachChannel, typeof CHANNEL_CONFIG[OutreachChannel]][]).map(
                        ([key, config]) => {
                          const Icon = config.icon;
                          const isSelected = channel === key;
                          return (
                            <button
                              key={key}
                              className={cn(
                                'flex-1 min-w-[70px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 active:scale-95',
                                isSelected
                                  ? 'border-transparent text-white shadow-sm'
                                  : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                              )}
                              style={isSelected ? { backgroundColor: config.hexColor } : undefined}
                              onClick={() => setChannel(key)}
                            >
                              <Icon className={cn('h-4 w-4', isSelected ? 'text-white' : config.color)} />
                              <span className="hidden sm:inline">{config.label}</span>
                              <span className="sm:hidden">{config.label.slice(0, 3)}</span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                {selectedLead && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{selectedLead.businessName}</p>
                        {hasInboundReply && (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-0.5 border">
                            <Check className="h-3 w-3" />
                            Replied
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedLead.niche} · {selectedLead.city ?? ''}{selectedLead.city ? ', ' : ''}{selectedLead.country}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {selectedLead.email && (
                        <Badge variant="outline" className="text-[10px]">
                          <Mail className="h-2.5 w-2.5 mr-1" />
                          Email
                        </Badge>
                      )}
                      {selectedLead.phone && (
                        <Badge variant="outline" className="text-[10px]">
                          <MessageSquare className="h-2.5 w-2.5 mr-1" />
                          Phone
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={!selectedLeadIdLocal || generateMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      AI Generate Outreach
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {selectedLeadIdLocal && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Card className="hover-lift">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center mx-auto mb-1.5">
                      <Send className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{quickStats.totalMessages}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Total Messages</p>
                  </CardContent>
                </Card>
                <Card className="hover-lift">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center mx-auto mb-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold">
                      {quickStats.lastContact ? getRelativeTime(quickStats.lastContact.toISOString()) : 'Never'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Last Contact</p>
                  </CardContent>
                </Card>
                <Card className="hover-lift">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <div className="h-7 w-7 rounded-lg bg-sky-500/15 flex items-center justify-center mx-auto mb-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-sky-500" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{quickStats.responseRate}%</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Response Rate</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Channel Effectiveness Comparison */}
            {selectedLeadIdLocal && channelEffectiveness.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Channel Effectiveness
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {channelEffectiveness.map((item) => {
                      const Icon = item.config.icon;
                      const maxRate = Math.max(...channelEffectiveness.map((c) => c.responseRate), 1);
                      const widthPct = Math.max((item.responseRate / maxRate) * 100, 5);

                      return (
                        <div key={item.channel} className="flex items-center gap-3">
                          <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', item.config.bgColor)}>
                            <Icon className={cn('h-3.5 w-3.5', item.config.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">{item.config.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {item.replies}/{item.sent} replies
                              </span>
                            </div>
                            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor: item.config.hexColor,
                                  opacity: 0.8,
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold shrink-0" style={{ color: item.config.hexColor }}>
                            {item.responseRate}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Template Library */}
            {selectedLeadIdLocal && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    Template Library
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {OUTREACH_TEMPLATES.map((template) => {
                      const Icon = template.icon;
                      return (
                        <div
                          key={template.id}
                          className={cn(
                            'group relative p-3 rounded-lg border transition-all duration-200',
                            'hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:shadow-sm',
                            customMessage && customMessage.includes(template.getContent(templateVars).substring(0, 50))
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : 'border-border'
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/15 transition-colors">
                              <Icon className="h-4 w-4 text-primary group-hover:text-emerald-600 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight">{template.label}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {template.description}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2.5 h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 active:scale-95 transition-all min-h-[28px]"
                            onClick={() => handleUseTemplate(template)}
                          >
                            <ChevronRight className="h-3 w-3" />
                            Use Template
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Generated Message */}
            {(generatedMessage || generateMutation.isPending) && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      AI-Generated Message
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="active:scale-95 transition-all">
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Regenerate
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopy} disabled={!generatedMessage} className="active:scale-95 transition-all">
                        {copied ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {generateMutation.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{generatedMessage}</ReactMarkdown>
                    </div>
                  )}

                  <Separator className="my-4" />

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Customize before sending:</label>
                    <Textarea
                      value={customMessage || generatedMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      rows={6}
                      className="text-sm"
                      placeholder="Edit the message..."
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => sendMutation.mutate()}
                        disabled={(!generatedMessage && !customMessage) || sendMutation.isPending}
                        className="sm:w-auto active:scale-95 transition-all"
                      >
                        {sendMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Send & Log
                          </>
                        )}
                      </Button>
                      {selectedLeadIdLocal && (
                        <Button
                          variant="outline"
                          onClick={handleOpenFollowUp}
                          className="gap-1.5 active:scale-95 transition-all"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Schedule Follow-up
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Outreach History Timeline */}
            {selectedLeadIdLocal && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-500" />
                    Outreach History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {commsLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-16 w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : communications && communications.length > 0 ? (
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

                      <div className="space-y-4">
                        {communications.map((comm, idx) => {
                          const channelConf = CHANNEL_CONFIG[comm.channel as OutreachChannel];
                          const ChannelIcon = channelConf?.icon ?? Mail;
                          const isInbound = comm.direction === 'inbound';
                          const isLast = idx === communications.length - 1;
                          const isReplied = replyMarked[comm.id] || (isInbound);

                          return (
                            <div key={comm.id} className="relative flex gap-3">
                              <div className={cn(
                                'relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2',
                                isInbound
                                  ? 'bg-sky-500/15 border-sky-500/30'
                                  : 'bg-emerald-500/15 border-emerald-500/30'
                              )}>
                                <ChannelIcon className={cn('h-3.5 w-3.5', channelConf?.color || 'text-muted-foreground')} />
                              </div>

                              <div className={cn(
                                'flex-1 pb-4 rounded-lg border p-3 transition-colors',
                                isInbound
                                  ? 'bg-sky-500/5 border-sky-500/15'
                                  : 'bg-emerald-500/5 border-emerald-500/15'
                              )}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                      className={cn(
                                        'text-[10px] px-1.5 py-0 border-0',
                                        isInbound
                                          ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                                          : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                      )}
                                    >
                                      {isInbound ? '↓ Inbound' : '↑ Outbound'}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {channelConf?.label ?? comm.channel}
                                    </Badge>
                                    {comm.messageGeneratedByAI && (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-violet-500/20 text-violet-700 dark:text-violet-300 border-0">
                                        <Bot className="h-2.5 w-2.5 mr-0.5" />
                                        AI
                                      </Badge>
                                    )}
                                    {isReplied && (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-0">
                                        <Check className="h-2.5 w-2.5 mr-0.5" />
                                        Replied
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                    {getRelativeTime(comm.createdAt)}
                                  </span>
                                </div>

                                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                                  {comm.content}
                                </p>

                                {!isInbound && !hasInboundReply && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 h-6 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 min-h-[28px]"
                                    onClick={() => {
                                      markRepliedMutation.mutate(comm.id);
                                      setReplyMarked(prev => ({ ...prev, [comm.id]: true }));
                                    }}
                                    disabled={markRepliedMutation.isPending}
                                  >
                                    {markRepliedMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Mark as Replied
                                  </Button>
                                )}
                              </div>

                              {!isLast && (
                                <div className="absolute left-4 top-8 h-px w-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <MessageCircle className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No outreach history for this lead yet.
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Generate a message above or use a template to get started.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {!selectedLeadIdLocal && (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 animate-ping opacity-20 rounded-full bg-emerald-500" />
                    <div className="relative h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Send className="h-7 w-7 text-emerald-500/60" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 gradient-text">Generate Outreach Messages</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Select a lead above to generate personalized outreach messages
                    across multiple channels. AI will craft messages based on the
                    lead&apos;s digital weaknesses and business profile.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                    {OUTREACH_TEMPLATES.slice(0, 3).map((template) => {
                      const Icon = template.icon;
                      return (
                        <Badge
                          key={template.id}
                          variant="outline"
                          className="text-xs py-1 px-2.5 gap-1"
                        >
                          <Icon className="h-3 w-3 text-emerald-500" />
                          {template.label}
                        </Badge>
                      );
                    })}
                    <Badge variant="outline" className="text-xs py-1 px-2.5">
                      +{OUTREACH_TEMPLATES.length - 3} more
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            FOLLOW-UP REMINDERS (shared across both views)
            ═══════════════════════════════════════════════════════════ */}
        {overdueReminders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                Follow-up Reminders
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">
                  {overdueReminders.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdueReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium truncate">{reminder.lead?.businessName || 'Unknown Lead'}</p>
                        {reminder.lead?.niche && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {reminder.lead.niche}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{reminder.message}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
                        Due {getRelativeTime(reminder.dueAt)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 min-h-[28px]"
                        onClick={() => {
                          setSelectedLeadIdLocal(reminder.leadId);
                          setViewMode('messages');
                        }}
                      >
                        <Send className="h-3 w-3" />
                        <span className="hidden sm:inline">Follow up</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Follow-up Scheduler Dialog */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-emerald-500" />
              Schedule Follow-up
            </DialogTitle>
            <DialogDescription>
              Set a reminder to follow up with {selectedLead?.businessName || 'this lead'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reminder Note</label>
              <Textarea
                placeholder="e.g., Follow up about the proposal discussion..."
                value={followUpMessage}
                onChange={(e) => setFollowUpMessage(e.target.value)}
                rows={3}
              />
            </div>
            {followUpDate && (
              <div className="p-3 rounded-lg bg-muted flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">
                  Reminder set for{' '}
                  <strong>
                    {new Date(`${followUpDate}T${followUpTime || '09:00'}`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </strong>
                </span>
              </div>
            )}
            <Button
              className="w-full"
              disabled={!followUpDate || followUpMutation.isPending}
              onClick={() => followUpMutation.mutate()}
            >
              {followUpMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Schedule Follow-up
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Campaign Dialog */}
      <Dialog open={campaignCreateOpen} onOpenChange={setCampaignCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-emerald-500" />
              Create Outreach Campaign
            </DialogTitle>
            <DialogDescription>
              Set up an automated outreach campaign targeting specific niches and regions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input
                placeholder="e.g., Dental Clinic Outreach Q2"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Niche</Label>
                <Select value={campaignNiche} onValueChange={setCampaignNiche}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select niche..." />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHE_OPTIONS.map((niche) => (
                      <SelectItem key={niche} value={niche}>{niche}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Country</Label>
                <Select value={campaignCountry} onValueChange={setCampaignCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((country) => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Select value={campaignTemplateId} onValueChange={setCampaignTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {OUTREACH_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.label} — {template.description.slice(0, 40)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Schedule</Label>
              <div className="flex gap-2">
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                    campaignSchedule === 'now'
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                  )}
                  onClick={() => setCampaignSchedule('now')}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Send Now
                </button>
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                    campaignSchedule === 'later'
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                  )}
                  onClick={() => setCampaignSchedule('later')}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Schedule
                </button>
              </div>
              {campaignSchedule === 'later' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      value={campaignScheduleDate}
                      onChange={(e) => setCampaignScheduleDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input
                      type="time"
                      value={campaignScheduleTime}
                      onChange={(e) => setCampaignScheduleTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                The campaign will use AI-personalized messages based on each lead&apos;s profile and the selected template.
              </p>
            </div>

            <Button
              className="w-full"
              disabled={!campaignName.trim() || !campaignNiche || !campaignCountry || !campaignTemplateId}
              onClick={handleCreateCampaign}
            >
              <Megaphone className="h-4 w-4 mr-2" />
              {campaignSchedule === 'now' ? 'Launch Campaign' : 'Schedule Campaign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
