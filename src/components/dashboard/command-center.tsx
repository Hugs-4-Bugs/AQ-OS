'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Search, Send, Clock, CheckCircle2, AlertCircle, Loader2, BarChart3,
  Inbox, Mail, Target, Play, RefreshCw, Bot, MessageSquare, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { apiCall, safeApiCall } from '@/lib/api-error-handler';
import { toast } from 'sonner';

interface CampaignProgress {
  campaignId: string;
  status: string;
  phase: string;
  totalLeads: number;
  discovered: number;
  analyzed: number;
  outreachGenerated: number;
  sent: number;
  errors: number;
  errorMessage?: string;
}

interface CampaignStats {
  totalCampaigns: number;
  totalLeadsDiscovered: number;
  totalOutreachGenerated: number;
  totalSent: number;
  activeCampaigns: number;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-500/10 text-green-600 border-green-200';
    case 'failed': case 'cancelled': return 'bg-red-500/10 text-red-600 border-red-200';
    case 'parsing': return 'bg-amber-500/10 text-amber-600 border-amber-200';
    case 'discovering': return 'bg-blue-500/10 text-blue-600 border-blue-200';
    case 'analyzing': return 'bg-purple-500/10 text-purple-600 border-purple-200';
    case 'generating': return 'bg-indigo-500/10 text-indigo-600 border-indigo-200';
    case 'sending': return 'bg-teal-500/10 text-teal-600 border-teal-200';
    default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
  }
}

function getStatusIcon(status: string) {
  const iconMap: Record<string, React.ElementType> = {
    parsing: Bot,
    discovering: Search,
    analyzing: BarChart3,
    generating: Sparkles,
    sending: Send,
    completed: CheckCircle2,
    failed: AlertCircle,
  };
  const Icon = iconMap[status] || Clock;
  return <Icon className="h-3 w-3" />;
}

function getPhaseLabel(status: string): string {
  const labels: Record<string, string> = {
    parsing: 'Parsing instruction...',
    discovering: 'Discovering leads...',
    analyzing: 'Analyzing leads...',
    generating: 'Generating outreach...',
    sending: 'Sending messages...',
    completed: 'Campaign completed',
    failed: 'Campaign failed',
    cancelled: 'Campaign cancelled',
  };
  return labels[status] || status;
}

function getProgressPercent(campaign: CampaignProgress): number {
  if (campaign.status === 'completed' || campaign.status === 'failed') return 100;
  const total = Math.max(campaign.totalLeads, 1);
  const weighted = (campaign.analyzed * 3 + campaign.outreachGenerated * 2 + campaign.sent * 4 + campaign.errors * 1) / (total * 4) * 100;
  return Math.min(99, Math.max(0, Math.round(weighted)));
}

const EXAMPLE_INSTRUCTIONS = [
  'Find dentists in Mumbai',
  'Discover real estate agents in California',
  'Search for restaurants in London on Google Maps',
  'Find yoga studios in Bangalore',
  'Discover software agencies in Berlin',
];

export default function CommandCenter() {
  const [instruction, setInstruction] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('new');
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadData = useCallback(async () => {
    const [campaignsResult, statsResult] = await Promise.all([
      safeApiCall<{ campaigns: CampaignProgress[] }>('/api/autonomous/campaign?limit=20', undefined, { showToast: false }),
      safeApiCall<CampaignStats>('/api/autonomous/stats', undefined, { showToast: false }),
    ]);
    if (campaignsResult) setCampaigns(campaignsResult.campaigns);
    if (statsResult) setStats(statsResult);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartCampaign = async () => {
    if (!instruction.trim() || isStarting) return;
    setIsStarting(true);
    try {
      const result = await apiCall<{ campaignId: string; status: string }>('/api/autonomous/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim(), autoSend }),
      });
      toast.success('Campaign started! Processing in background...');
      connectSSE(result.campaignId);
      setInstruction('');
      setActiveTab('active');
      setTimeout(loadData, 1000);
    } catch {
      toast.error('Failed to start campaign');
    } finally {
      setIsStarting(false);
    }
  };

  const connectSSE = (campaignId: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setActiveCampaignId(campaignId);
    const es = new EventSource(`/api/autonomous/campaign/${campaignId}/status`);
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CampaignProgress & { done?: boolean; error?: string };
        if (data.error) { toast.error(data.error); es.close(); return; }
        if (data.done) { es.close(); loadData(); return; }
        setCampaigns((prev) => {
          const idx = prev.findIndex((c) => c.campaignId === campaignId);
          if (idx >= 0) { const u = [...prev]; u[idx] = data; return u; }
          return [data, ...prev];
        });
      } catch { /* ignore */ }
    };
    es.onerror = () => { es.close(); loadData(); };
  };

  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);

  const handleProcessReplies = async () => {
    try {
      const result = await apiCall<{ processed: number; classified: number; notifications: number }>('/api/reply-intel/process', { method: 'POST' });
      toast.success(`Processed ${result.processed} replies, ${result.notifications} notifications`);
    } catch { toast.error('Failed to process replies'); }
  };

  const handleProcessSequences = async () => {
    try {
      const result = await apiCall<{ processed: number; sent: number; errors: number }>('/api/sequences/process', { method: 'POST' });
      toast.success(`Sent ${result.sent} sequence messages`);
    } catch { toast.error('Failed to process sequences'); }
  };

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Target className="h-4 w-4 text-primary" />} label="Campaigns" value={stats.totalCampaigns} />
          <StatCard icon={<Search className="h-4 w-4 text-blue-500" />} label="Leads Found" value={stats.totalLeadsDiscovered} />
          <StatCard icon={<Mail className="h-4 w-4 text-green-500" />} label="Outreach" value={stats.totalOutreachGenerated} />
          <StatCard icon={<Send className="h-4 w-4 text-amber-500" />} label="Sent" value={stats.totalSent} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex">
          <TabsTrigger value="new" className="flex-1 gap-1.5"><Zap className="h-3.5 w-3.5" /><span className="hidden sm:inline">New Campaign</span></TabsTrigger>
          <TabsTrigger value="active" className="flex-1 gap-1.5">
            <Play className="h-3.5 w-3.5" /><span className="hidden sm:inline">Active</span>
            {stats && stats.activeCampaigns > 0 && <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">{stats.activeCampaigns}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1.5"><Clock className="h-3.5 w-3.5" /><span className="hidden sm:inline">History</span></TabsTrigger>
          <TabsTrigger value="replies" className="flex-1 gap-1.5"><Inbox className="h-3.5 w-3.5" /><span className="hidden sm:inline">Replies</span></TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Autonomous Acquisition</CardTitle>
              <CardDescription>Describe who you want to reach in plain English. The AI will discover leads, analyze them, generate personalized outreach, and optionally send emails.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Input placeholder='e.g. "Find dentists in Mumbai who need website development"' value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isStarting && handleStartCampaign()} className="pr-12 text-base h-12" disabled={isStarting} />
                  <Button size="icon" variant="ghost" onClick={() => { setInstruction(EXAMPLE_INSTRUCTIONS[Math.floor(Math.random() * EXAMPLE_INSTRUCTIONS.length)]); }} className="absolute right-1 top-1/2 -translate-y-1/2" title="Get example" disabled={isStarting}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="rounded" />
                  <span className="text-sm text-muted-foreground">Auto-send emails</span>
                </label>
              </div>
              <Button onClick={handleStartCampaign} disabled={!instruction.trim() || isStarting} className="w-full h-11" size="lg">
                {isStarting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting Campaign...</> : <><Zap className="mr-2 h-4 w-4" />Launch Autonomous Campaign</>}
              </Button>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">Try these examples:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_INSTRUCTIONS.slice(0, 3).map((ex) => (
                    <button key={ex} onClick={() => setInstruction(ex)} className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">{ex}</button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {campaigns.filter((c) => !['completed', 'failed', 'cancelled'].includes(c.status)).length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">No active campaigns</p><p className="text-xs text-muted-foreground mt-1">Start a new campaign from the tab above</p></CardContent></Card>
              ) : campaigns.filter((c) => !['completed', 'failed', 'cancelled'].includes(c.status)).map((campaign) => <CampaignCard key={campaign.campaignId} campaign={campaign} isActive />)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {campaigns.filter((c) => ['completed', 'failed', 'cancelled'].includes(c.status)).length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">No campaign history yet</p></CardContent></Card>
              ) : campaigns.filter((c) => ['completed', 'failed', 'cancelled'].includes(c.status)).map((campaign) => <CampaignCard key={campaign.campaignId} campaign={campaign} />)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="replies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5 text-primary" />Reply Intelligence</CardTitle>
              <CardDescription>Check for new replies to your outreach emails. AI classifies each reply by intent, sentiment, and buying signals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleProcessReplies} variant="outline" className="w-full"><RefreshCw className="mr-2 h-4 w-4" />Check for New Replies</Button>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3">Pending Sequences</h4>
                <Button onClick={handleProcessSequences} variant="outline" className="w-full"><Send className="mr-2 h-4 w-4" />Process Pending Sequences</Button>
              </div>
              <Separator />
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="font-medium">How Reply Intelligence Works</p>
                    <p>When prospects reply to your outreach emails, the AI automatically classifies their intent — whether they&apos;re interested, requesting a meeting, asking about pricing, or not interested. Hot leads trigger instant notifications.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function CampaignCard({ campaign, isActive }: { campaign: CampaignProgress; isActive?: boolean }) {
  const progress = getProgressPercent(campaign);
  return (
    <AnimatePresence mode="wait">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
        <Card className={cn('transition-all', isActive && 'ring-1 ring-primary/20')}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(campaign.status)}
                <div>
                  <p className="text-sm font-medium">{getPhaseLabel(campaign.status)}</p>
                  <p className="text-xs text-muted-foreground">{isActive ? <span className="text-primary">Processing...</span> : <span>{campaign.campaignId.slice(0, 8)}...</span>}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn('text-[10px] shrink-0', getStatusColor(campaign.status))}>{campaign.status}</Badge>
            </div>
            <Progress value={progress} className="h-2 mb-3" />
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><p className="text-lg font-bold tabular-nums">{campaign.discovered}</p><p className="text-[10px] text-muted-foreground">Found</p></div>
              <div><p className="text-lg font-bold tabular-nums">{campaign.analyzed}</p><p className="text-[10px] text-muted-foreground">Analyzed</p></div>
              <div><p className="text-lg font-bold tabular-nums">{campaign.outreachGenerated}</p><p className="text-[10px] text-muted-foreground">Generated</p></div>
              <div><p className="text-lg font-bold tabular-nums">{campaign.sent}</p><p className="text-[10px] text-muted-foreground">Sent</p></div>
            </div>
            {campaign.errorMessage && <div className="mt-3 p-2 rounded-md bg-destructive/10 text-destructive text-xs">{campaign.errorMessage}</div>}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
