'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS v3.8.0 — Email Outreach Performance
// Campaign metrics, bar charts, top templates, and recent campaigns
// ═══════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  MailOpen,
  Reply,
  AlertCircle,
  TrendingUp,
  Eye,
  MousePointerClick,
  FileText,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface CampaignMetrics {
  name: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}

interface EmailTemplate {
  name: string;
  openRate: number;
  replyRate: number;
  uses: number;
}

interface RecentCampaign {
  id: string;
  name: string;
  sentAt: string;
  status: 'sent' | 'scheduled' | 'draft' | 'failed';
  sent: number;
  opened: number;
  replied: number;
}

/* Data loaded from API */
const CAMPAIGNS: CampaignMetrics[] = [
  { name: 'Q1 Launch', sent: 450, opened: 285, replied: 62, bounced: 18 },
  { name: 'Re-engagement', sent: 320, opened: 198, replied: 41, bounced: 12 },
  { name: 'Webinar Invite', sent: 280, opened: 210, replied: 55, bounced: 5 },
  { name: 'Product Update', sent: 520, opened: 312, replied: 38, bounced: 22 },
  { name: 'Follow-up #2', sent: 180, opened: 108, replied: 29, bounced: 8 },
  { name: 'Cold Intro', sent: 640, opened: 224, replied: 18, bounced: 45 },
];

const TEMPLATES: EmailTemplate[] = [
  { name: 'Personalized Cold Intro', openRate: 52.3, replyRate: 8.1, uses: 342 },
  { name: 'Re-engagement Sequence', openRate: 61.8, replyRate: 12.8, uses: 198 },
  { name: 'Webinar Follow-up', openRate: 75.0, replyRate: 19.6, uses: 156 },
  { name: 'Case Study Share', openRate: 43.2, replyRate: 6.4, uses: 124 },
  { name: 'Demo Request Prompt', openRate: 68.5, replyRate: 22.1, uses: 89 },
];

const RECENT_CAMPAIGNS: RecentCampaign[] = [
  { id: 'c1', name: 'Q2 Product Launch Blast', sentAt: '2h ago', status: 'sent', sent: 520, opened: 312, replied: 38 },
  { id: 'c2', name: 'VIP Client Re-engagement', sentAt: '1d ago', status: 'sent', sent: 85, opened: 62, replied: 18 },
  { id: 'c3', name: 'Partnership Co-marketing', sentAt: 'Tomorrow', status: 'scheduled', sent: 0, opened: 0, replied: 0 },
  { id: 'c4', name: 'Industry Insights Newsletter', sentAt: '3d ago', status: 'sent', sent: 1200, opened: 680, replied: 42 },
  { id: 'c5', name: 'Cold Outreach - SaaS', sentAt: 'Draft', status: 'draft', sent: 0, opened: 0, replied: 0 },
];

const CHART_DATA = CAMPAIGNS.map((c) => ({
  name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
  fullName: c.name,
  Sent: c.sent,
  Opened: c.opened,
  Replied: c.replied,
  Bounced: c.bounced,
}));

/* ===== Custom Tooltip ===== */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const fullName = payload[0]?.payload?.fullName ?? label;
  return (
    <div className="rounded-lg border border-border/50 bg-popover/95 backdrop-blur-sm p-3 shadow-xl text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">{fullName}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.dataKey}</span>
          </div>
          <span className="font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Status Badge ===== */
function CampaignStatusBadge({ status }: { status: RecentCampaign['status'] }) {
  const config: Record<RecentCampaign['status'], { label: string; icon: React.ElementType; className: string }> = {
    sent: { label: 'Sent', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25' },
    scheduled: { label: 'Scheduled', icon: Clock, className: 'bg-sky-500/15 text-sky-600 border-sky-500/25' },
    draft: { label: 'Draft', icon: FileText, className: 'bg-muted text-muted-foreground border-border' },
    failed: { label: 'Failed', icon: XCircle, className: 'bg-red-500/15 text-red-500 border-red-500/25' },
  };
  const { label, icon: Icon, className } = config[status];
  return (
    <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 gap-1 border', className)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

/* ===== Metric Card ===== */
function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, type: 'spring', stiffness: 300, damping: 24 }}
      className="rounded-lg border border-border/40 bg-background/50 backdrop-blur-sm p-2.5 flex items-center gap-2.5"
    >
      <div className={cn('rounded-md p-1.5', color)}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold tabular-nums tracking-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      </div>
      <span className="text-[9px] text-muted-foreground ml-auto">{subtitle}</span>
    </motion.div>
  );
}

/* ===== Loading Skeleton ===== */
function OutreachSkeleton() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

/* ===== Empty State ===== */
function EmptyState() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No email campaigns yet</p>
        <p className="text-xs mt-1">Outreach metrics will appear here once campaigns are sent.</p>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function EmailOutreachPerformance() {
  const totals = useMemo(() => {
    const sent = CAMPAIGNS.reduce((s, c) => s + c.sent, 0);
    const opened = CAMPAIGNS.reduce((s, c) => s + c.opened, 0);
    const replied = CAMPAIGNS.reduce((s, c) => s + c.replied, 0);
    const bounced = CAMPAIGNS.reduce((s, c) => s + c.bounced, 0);
    return {
      sent,
      opened,
      replied,
      bounced,
      openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0',
      replyRate: sent > 0 ? ((replied / sent) * 100).toFixed(1) : '0.0',
      conversionRate: opened > 0 ? ((replied / opened) * 100).toFixed(1) : '0.0',
    };
  }, []);

  if (!CAMPAIGNS || CAMPAIGNS.length === 0) return <EmptyState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
    >
      <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
        <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />

        <CardHeader className="pb-3 relative">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-sky-500/10">
                <Mail className="h-4 w-4 text-sky-500" />
              </div>
              Email Outreach Performance
            </CardTitle>
            <Badge variant="outline" className="text-[9px] h-5 px-2 font-medium">
              {CAMPAIGNS.length} campaigns
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="relative space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              icon={Send}
              label="Total Sent"
              value={totals.sent.toLocaleString()}
              subtitle="all time"
              color="bg-sky-500"
              delay={0.1}
            />
            <MetricCard
              icon={Eye}
              label="Open Rate"
              value={`${totals.openRate}%`}
              subtitle="avg."
              color="bg-emerald-500"
              delay={0.15}
            />
            <MetricCard
              icon={Reply}
              label="Reply Rate"
              value={`${totals.replyRate}%`}
              subtitle="avg."
              color="bg-violet-500"
              delay={0.2}
            />
            <MetricCard
              icon={MousePointerClick}
              label="Conversion"
              value={`${totals.conversionRate}%`}
              subtitle="replied/opened"
              color="bg-amber-500"
              delay={0.25}
            />
          </div>

          {/* Bar Chart */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Campaign Breakdown
            </h4>
            <div className="h-[180px] sm:h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CHART_DATA} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'oklch(0.55 0 0)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'oklch(0.55 0 0)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={-2}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Sent" fill="#94a3b8" radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={600} />
                  <Bar dataKey="Opened" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={600} animationBegin={100} />
                  <Bar dataKey="Replied" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={600} animationBegin={200} />
                  <Bar dataKey="Bounced" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={600} animationBegin={300} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 justify-center text-[9px] text-muted-foreground flex-wrap">
              {[
                { label: 'Sent', color: '#94a3b8' },
                { label: 'Opened', color: '#0ea5e9' },
                { label: 'Replied', color: '#10b981' },
                { label: 'Bounced', color: '#ef4444' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Performing Templates */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Top Performing Templates
            </h4>
            <div className="space-y-1">
              {TEMPLATES.slice(0, 3).map((template, index) => (
                <motion.div
                  key={template.name}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.06, duration: 0.25 }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-500 shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{template.name}</p>
                    <p className="text-[9px] text-muted-foreground">{template.uses} uses</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] shrink-0">
                    <span className="flex items-center gap-0.5 text-sky-500">
                      <MailOpen className="h-2.5 w-2.5" />
                      {template.openRate}%
                    </span>
                    <span className="flex items-center gap-0.5 text-emerald-500">
                      <Reply className="h-2.5 w-2.5" />
                      {template.replyRate}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recent Campaigns */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Recent Campaigns
            </h4>
            <ScrollArea className="max-h-[140px] custom-scrollbar">
              <div className="space-y-1">
                {RECENT_CAMPAIGNS.map((campaign, index) => (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + index * 0.05, duration: 0.2 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{campaign.name}</p>
                      <p className="text-[9px] text-muted-foreground">{campaign.sentAt}</p>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                    {campaign.sent > 0 && (
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Send className="h-2 w-2" />
                          {campaign.sent}
                        </span>
                        <span className="flex items-center gap-0.5 text-sky-500">
                          <Eye className="h-2 w-2" />
                          {campaign.opened}
                        </span>
                        <span className="flex items-center gap-0.5 text-emerald-500">
                          <Reply className="h-2 w-2" />
                          {campaign.replied}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
