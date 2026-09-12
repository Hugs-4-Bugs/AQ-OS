'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Bot,
  Activity,
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Workflow,
  Gauge,
  Send,
  Mail,
  Phone,
  Hash,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AnalyticsLineChart,
  AnalyticsAreaChart,
  AnalyticsBarChart,
  AnalyticsPieChart,
  AnalyticsFunnelChart,
  CHART_COLORS,
} from './analytics-charts';

/* ===== Shared Types ===== */
interface DashboardProps {
  data: Record<string, unknown> | null;
  loading: boolean;
  period: string;
}

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

/* ===== KPI Card Component ===== */
function KPICard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
  bg,
  trend,
  trendUp,
  loading,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="card-glow">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-7 w-20 mb-1" />
          <Skeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className="card-glow group hover:shadow-md transition-all">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={cn('rounded-lg p-2.5', bg)}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            {trend && (
              <div
                className={cn(
                  'flex items-center gap-0.5 text-xs font-medium',
                  trendUp ? 'text-emerald-500' : 'text-red-500'
                )}
              >
                {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend}
              </div>
            )}
          </div>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="text-sm font-medium text-muted-foreground ml-0.5">{suffix}</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Empty Chart State ===== */
function EmptyChartCard({ title, icon: Icon, loading, children }: {
  title: string;
  icon: React.ElementType;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-glow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   1. EXECUTIVE DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
export function ExecutiveDashboard({ data, loading, period }: DashboardProps) {
  const leads = data?.leads as Record<string, unknown> | undefined;
  const billing = data?.billing as Record<string, unknown> | undefined;
  const ai = data?.ai as Record<string, unknown> | undefined;
  const workflows = data?.workflows as Record<string, unknown> | undefined;

  // Derive KPI values from real data
  const mrr = (billing?.mrr as number) ?? 0;
  const totalLeads = (leads?.discovered as number) ?? 0;
  const creditsUsed = (ai?.creditsUsed as number) ?? 0;
  const activeWorkflows = (workflows?.totalExecutions as number) ?? 0;
  const outreachSent = (leads?.contacted as number) ?? 0;

  // Revenue trend data
  const revenueMonthly = (billing?.revenueMonthly as { month: string; revenue: number }[]) ?? [];
  // Lead funnel data
  const conversionFunnel = (leads?.conversionFunnel as { stage: string; count: number }[]) ?? [];
  // AI usage trend
  const analysisVolume = (ai?.analysisVolume as { date: string; analyses: number }[]) ?? [];
  // Workflow daily executions
  const dailyExecutions = (workflows?.dailyExecutions as { date: string; success: number; failed: number; retried: number }[]) ?? [];

  const funnelData = conversionFunnel.map((f) => ({
    name: f.stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: f.count,
    fill: CHART_COLORS[conversionFunnel.indexOf(f) % CHART_COLORS.length],
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KPICard
          label="MRR"
          value={`$${mrr.toLocaleString()}`}
          icon={DollarSign}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          trend="+8%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Total Leads"
          value={totalLeads}
          icon={Users}
          color="text-cyan-500"
          bg="bg-cyan-500/10"
          trend="+12%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="AI Credits Used"
          value={creditsUsed}
          icon={Bot}
          color="text-violet-500"
          bg="bg-violet-500/10"
          trend="+15%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Active Workflows"
          value={activeWorkflows}
          icon={Workflow}
          color="text-orange-500"
          bg="bg-orange-500/10"
          loading={loading}
        />
        <KPICard
          label="Outreach Sent"
          value={outreachSent}
          icon={Send}
          color="text-amber-500"
          bg="bg-amber-500/10"
          trend="+5%"
          trendUp={true}
          loading={loading}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <EmptyChartCard title="Revenue Trend" icon={DollarSign} loading={loading}>
          {revenueMonthly.length > 0 ? (
            <AnalyticsAreaChart
              data={revenueMonthly.map((r) => ({ date: r.month, revenue: r.revenue }))}
              xKey="date"
              yKeys={['revenue']}
              colors={[CHART_COLORS[0]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No revenue data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Lead Funnel */}
        <EmptyChartCard title="Lead Funnel" icon={Activity} loading={loading}>
          <AnalyticsFunnelChart data={funnelData} loading={loading} />
        </EmptyChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Usage */}
        <EmptyChartCard title="AI Usage Trend" icon={Bot} loading={loading}>
          {analysisVolume.length > 0 ? (
            <AnalyticsAreaChart
              data={analysisVolume}
              xKey="date"
              yKeys={['analyses']}
              colors={[CHART_COLORS[3]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No AI usage data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Workflow Health */}
        <EmptyChartCard title="Workflow Health" icon={Workflow} loading={loading}>
          {dailyExecutions.length > 0 ? (
            <AnalyticsBarChart
              data={dailyExecutions}
              xKey="date"
              yKeys={['success', 'failed']}
              colors={[CHART_COLORS[0], CHART_COLORS[2]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No workflow execution data yet
            </div>
          )}
        </EmptyChartCard>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. SALES DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
export function SalesDashboard({ data, loading, period }: DashboardProps) {
  const leads = data?.leads as Record<string, unknown> | undefined;
  const messaging = data?.messaging as Record<string, unknown> | undefined;

  const pipelineValue = (leads?.won as number) ?? 0;
  const responseRate = (leads?.responseRate as number) ?? 0;
  const contacted = (leads?.contacted as number) ?? 0;
  const gmailReplyRate = (messaging?.gmailReplyRate as number) ?? 0;

  const stageDistribution = (leads?.stageDistribution as Record<string, number>) ?? {};
  const conversionFunnel = (leads?.conversionFunnel as { stage: string; count: number }[]) ?? [];
  const channelBreakdown = (messaging?.channelBreakdown as { channel: string; sent: number; delivered: number; opened: number; replied: number }[]) ?? [];
  const dailyVolume = (messaging?.dailyVolume as { date: string; email: number; telegram: number; whatsapp: number }[]) ?? [];

  // Pipeline stages bar data
  const pipelineStages = Object.entries(stageDistribution).map(([stage, count]) => ({
    stage: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    count,
  }));

  // Funnel data
  const funnelData = conversionFunnel.map((f) => ({
    name: f.stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: f.count,
    fill: CHART_COLORS[conversionFunnel.indexOf(f) % CHART_COLORS.length],
  }));

  // Channel performance data
  const channelData = channelBreakdown.map((c) => ({
    channel: c.channel.charAt(0).toUpperCase() + c.channel.slice(1),
    sent: c.sent,
    delivered: c.delivered,
    opened: c.opened,
    replied: c.replied,
  }));

  // Reply rate trend (approximation from daily volume)
  const replyTrendData = dailyVolume.map((d) => ({
    date: d.date,
    email: d.email,
    telegram: d.telegram,
    whatsapp: d.whatsapp,
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          label="Pipeline Value"
          value={`$${pipelineValue.toLocaleString()}`}
          icon={DollarSign}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          trend="+14%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Conversion Rate"
          value={`${responseRate.toFixed(1)}%`}
          icon={TrendingUp}
          color="text-cyan-500"
          bg="bg-cyan-500/10"
          trend="+3%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Outreach Sent"
          value={contacted}
          icon={Send}
          color="text-amber-500"
          bg="bg-amber-500/10"
          loading={loading}
        />
        <KPICard
          label="Reply Rate"
          value={`${gmailReplyRate.toFixed(1)}%`}
          icon={MessageSquare}
          color="text-violet-500"
          bg="bg-violet-500/10"
          trend="+6%"
          trendUp={true}
          loading={loading}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Stages */}
        <EmptyChartCard title="Pipeline Stages" icon={BarChart3} loading={loading}>
          {pipelineStages.length > 0 ? (
            <AnalyticsBarChart
              data={pipelineStages}
              xKey="stage"
              yKeys={['count']}
              colors={[CHART_COLORS[0]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No pipeline data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Conversion Funnel */}
        <EmptyChartCard title="Conversion Funnel" icon={Activity} loading={loading}>
          <AnalyticsFunnelChart data={funnelData} loading={loading} />
        </EmptyChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Performance */}
        <EmptyChartCard title="Channel Performance" icon={Phone} loading={loading}>
          {channelData.length > 0 ? (
            <AnalyticsBarChart
              data={channelData}
              xKey="channel"
              yKeys={['sent', 'delivered', 'opened', 'replied']}
              colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[4], CHART_COLORS[3]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No channel data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Messaging Volume Trend */}
        <EmptyChartCard title="Message Volume Trend" icon={Mail} loading={loading}>
          {replyTrendData.length > 0 ? (
            <AnalyticsLineChart
              data={replyTrendData}
              xKey="date"
              yKeys={['email', 'telegram', 'whatsapp']}
              colors={[CHART_COLORS[0], CHART_COLORS[4], CHART_COLORS[1]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No messaging data yet
            </div>
          )}
        </EmptyChartCard>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. AI DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
export function AIDashboard({ data, loading, period }: DashboardProps) {
  const ai = data?.ai as Record<string, unknown> | undefined;
  const leads = data?.leads as Record<string, unknown> | undefined;

  const totalUsage = (ai?.totalUsage as number) ?? 0;
  const creditsUsed = (ai?.creditsUsed as number) ?? 0;
  const creditsRemaining = (ai?.creditsRemaining as number) ?? 0;
  const analysesCount = totalUsage;
  const avgCostPerAnalysis = analysesCount > 0 ? Math.round(creditsUsed / analysesCount) : 0;

  const modelDistribution = (ai?.modelDistribution as { model: string; count: number }[]) ?? [];
  const analysisVolume = (ai?.analysisVolume as { date: string; analyses: number }[]) ?? [];
  const providerUsage = (ai?.providerUsage as { provider: string; count: number; credits: number }[]) ?? [];
  const chatUsage = (ai?.chatUsage as { date: string; sessions: number; messages: number }[]) ?? [];

  // Model distribution for pie chart
  const modelData = modelDistribution.map((m) => ({
    name: m.model.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: m.count,
  }));

  // Provider breakdown for bar chart
  const providerData = providerUsage.map((p) => ({
    provider: p.provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    count: p.count,
    credits: p.credits,
  }));

  // Credit consumption trend (from analysis volume)
  const creditTrendData = analysisVolume.map((a) => ({
    date: a.date,
    analyses: a.analyses,
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          label="Total AI Usage"
          value={totalUsage}
          icon={Bot}
          color="text-violet-500"
          bg="bg-violet-500/10"
          trend="+22%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Credits Used"
          value={creditsUsed}
          icon={Zap}
          color="text-amber-500"
          bg="bg-amber-500/10"
          trend="+18%"
          trendUp={true}
          loading={loading}
        />
        <KPICard
          label="Analyses This Month"
          value={analysesCount}
          icon={Activity}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          loading={loading}
        />
        <KPICard
          label="Avg Cost/Analysis"
          value={avgCostPerAnalysis}
          suffix="credits"
          icon={Hash}
          color="text-cyan-500"
          bg="bg-cyan-500/10"
          loading={loading}
        />
      </div>

      {/* Credits remaining indicator */}
      {!loading && creditsRemaining > 0 && (
        <Card className="card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Credits Remaining</span>
              </div>
              <Badge variant="secondary" className="text-sm font-bold">
                {creditsRemaining.toLocaleString()}
              </Badge>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  creditsRemaining > 50 ? 'bg-emerald-500' : creditsRemaining > 20 ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: `${Math.min((creditsRemaining / (creditsUsed + creditsRemaining || 1)) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Distribution */}
        <EmptyChartCard title="Model Distribution" icon={Bot} loading={loading}>
          {modelData.length > 0 ? (
            <AnalyticsPieChart
              data={modelData}
              xKey="name"
              yKeys={['value']}
              nameKey="name"
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No AI usage data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Usage Trend */}
        <EmptyChartCard title="AI Usage Trend" icon={TrendingUp} loading={loading}>
          {analysisVolume.length > 0 ? (
            <AnalyticsAreaChart
              data={analysisVolume}
              xKey="date"
              yKeys={['analyses']}
              colors={[CHART_COLORS[3]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No analysis data yet
            </div>
          )}
        </EmptyChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Consumption */}
        <EmptyChartCard title="Credit Consumption" icon={Zap} loading={loading}>
          {creditTrendData.length > 0 ? (
            <AnalyticsLineChart
              data={creditTrendData}
              xKey="date"
              yKeys={['analyses']}
              colors={[CHART_COLORS[1]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No credit data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Provider Breakdown */}
        <EmptyChartCard title="Provider Breakdown" icon={Activity} loading={loading}>
          {providerData.length > 0 ? (
            <AnalyticsBarChart
              data={providerData}
              xKey="provider"
              yKeys={['count', 'credits']}
              colors={[CHART_COLORS[0], CHART_COLORS[1]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No provider data yet
            </div>
          )}
        </EmptyChartCard>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. OPS DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
export function OpsDashboard({ data, loading, period }: DashboardProps) {
  const workflows = data?.workflows as Record<string, unknown> | undefined;
  const messaging = data?.messaging as Record<string, unknown> | undefined;

  const queueDepth = (workflows?.queueDepth as number) ?? 0;
  const successRate = (workflows?.successRate as number) ?? 0;
  const avgRuntimeMs = (workflows?.avgRuntimeMs as number) ?? 0;
  const totalExecutions = (workflows?.totalExecutions as number) ?? 0;
  const throughputLast24h = (workflows?.throughputLast24h as number) ?? 0;

  const executionsByStatus = (workflows?.executionsByStatus as Record<string, number>) ?? {};
  const dailyExecutions = (workflows?.dailyExecutions as { date: string; success: number; failed: number; retried: number }[]) ?? [];
  const runtimeDistribution = (workflows?.runtimeDistribution as { range: string; count: number }[]) ?? [];
  const topFailingWorkflows = (workflows?.topFailingWorkflows as { workflowId: string; name: string; failureCount: number }[]) ?? [];

  // Execution status for pie chart
  const statusData = Object.entries(executionsByStatus).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
  }));

  // Runtime display helper
  function formatRuntime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          label="Queue Depth"
          value={queueDepth}
          icon={Clock}
          color="text-amber-500"
          bg="bg-amber-500/10"
          loading={loading}
        />
        <KPICard
          label="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon={CheckCircle2}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          trend={successRate >= 90 ? 'Healthy' : successRate >= 70 ? 'Warning' : 'Critical'}
          trendUp={successRate >= 90}
          loading={loading}
        />
        <KPICard
          label="Avg Runtime"
          value={formatRuntime(avgRuntimeMs)}
          icon={Gauge}
          color="text-cyan-500"
          bg="bg-cyan-500/10"
          loading={loading}
        />
        <KPICard
          label="Active Workflows"
          value={totalExecutions}
          icon={Workflow}
          color="text-orange-500"
          bg="bg-orange-500/10"
          loading={loading}
        />
      </div>

      {/* Throughput indicator */}
      {!loading && throughputLast24h > 0 && (
        <Card className="card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Throughput (24h)</span>
              </div>
              <Badge variant="secondary" className="text-sm font-bold">
                {throughputLast24h} completed
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Execution Status */}
        <EmptyChartCard title="Execution Status" icon={Activity} loading={loading}>
          {statusData.length > 0 ? (
            <AnalyticsPieChart
              data={statusData}
              xKey="name"
              yKeys={['value']}
              nameKey="name"
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No execution data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Daily Executions */}
        <EmptyChartCard title="Daily Executions" icon={BarChart3} loading={loading}>
          {dailyExecutions.length > 0 ? (
            <AnalyticsAreaChart
              data={dailyExecutions}
              xKey="date"
              yKeys={['success', 'failed', 'retried']}
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No daily execution data yet
            </div>
          )}
        </EmptyChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runtime Distribution */}
        <EmptyChartCard title="Runtime Distribution" icon={Gauge} loading={loading}>
          {runtimeDistribution.length > 0 ? (
            <AnalyticsBarChart
              data={runtimeDistribution}
              xKey="range"
              yKeys={['count']}
              colors={[CHART_COLORS[4]]}
              loading={loading}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No runtime data yet
            </div>
          )}
        </EmptyChartCard>

        {/* Top Failing Workflows */}
        <Card className="card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Top Failing Workflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topFailingWorkflows.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {topFailingWorkflows.map((wf) => (
                  <div
                    key={wf.workflowId}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm font-medium truncate">{wf.name}</span>
                    </div>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {wf.failureCount} failures
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                  No failing workflows
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
