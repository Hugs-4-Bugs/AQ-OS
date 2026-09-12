'use client';

import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import {
  Mail, Phone, Users, Share2, ArrowUpRight, ArrowDownRight,
  Clock, Send, CheckCircle2, AlertCircle, Calendar, MessageCircle,
  TrendingUp, Zap, ChevronRight,
} from 'lucide-react';

const channelTabs = ['All', 'Email', 'Calls', 'Meetings', 'Social'] as const;
type ChannelTab = typeof channelTabs[number];

const channelConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  Email: { icon: Mail, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  Calls: { icon: Phone, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  Meetings: { icon: Users, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  Social: { icon: Share2, color: 'text-orange-500', bg: 'bg-orange-500/10' },
};

interface ChannelPerformance {
  channel: string;
  icon: React.ElementType;
  border: string;
  bg: string;
  color: string;
  trend: number;
  total: number;
  responseRate: number;
  avgTime: string;
  dailyVolume: number[];
}

const channelPerformanceData: ChannelPerformance[] = [
  { channel: 'Email', icon: Mail, border: 'border-sky-500/20', bg: 'bg-sky-500/10', color: 'text-sky-500', trend: 12, total: 4820, responseRate: 34, avgTime: '2h 15m', dailyVolume: [42, 68, 55, 90, 74, 61, 80] },
  { channel: 'Calls', icon: Phone, border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', color: 'text-emerald-500', trend: 8, total: 1240, responseRate: 58, avgTime: '18m', dailyVolume: [18, 25, 30, 22, 35, 28, 24] },
  { channel: 'Meetings', icon: Users, border: 'border-violet-500/20', bg: 'bg-violet-500/10', color: 'text-violet-500', trend: 21, total: 386, responseRate: 72, avgTime: '45m', dailyVolume: [6, 9, 12, 8, 14, 11, 7] },
  { channel: 'Social', icon: Share2, border: 'border-orange-500/20', bg: 'bg-orange-500/10', color: 'text-orange-500', trend: -4, total: 2140, responseRate: 19, avgTime: '5h 30m', dailyVolume: [55, 40, 62, 48, 70, 58, 66] },
];

interface ResponseTimeBucket {
  bucket: string;
  count: number;
  fill: string;
}

const responseTimeData: ResponseTimeBucket[] = [
  { bucket: '<5m', count: 320, fill: '#10b981' },
  { bucket: '5-15m', count: 480, fill: '#10b981' },
  { bucket: '15-60m', count: 610, fill: '#3b82f6' },
  { bucket: '1-4h', count: 420, fill: '#f59e0b' },
  { bucket: '4-24h', count: 260, fill: '#f97316' },
  { bucket: '>24h', count: 120, fill: '#ef4444' },
];

interface TopTemplate {
  name: string;
  openRate: number;
  replyRate: number;
  conversionRate: number;
  usage: number;
  lastUsed: string;
}

const topTemplates: TopTemplate[] = [
  { name: 'Discovery Intro', openRate: 68, replyRate: 31, conversionRate: 12, usage: 342, lastUsed: '2h ago' },
  { name: 'Follow-up Nudge', openRate: 54, replyRate: 26, conversionRate: 9, usage: 287, lastUsed: '5h ago' },
  { name: 'Case Study Share', openRate: 61, replyRate: 22, conversionRate: 14, usage: 198, lastUsed: '1d ago' },
  { name: 'Meeting Invite', openRate: 77, replyRate: 44, conversionRate: 23, usage: 156, lastUsed: '3h ago' },
];

interface RecentCommunication {
  icon: React.ElementType;
  bg: string;
  color: string;
  recipient: string;
  subject: string;
  time: string;
}

const recentCommunications: RecentCommunication[] = [
  { icon: Mail, bg: 'bg-sky-500/10', color: 'text-sky-500', recipient: 'Sarah Chen', subject: 'Re: Proposal follow-up', time: '5m ago' },
  { icon: Users, bg: 'bg-violet-500/10', color: 'text-violet-500', recipient: 'Marcus Webb', subject: 'Demo scheduled for Thursday', time: '22m ago' },
  { icon: Phone, bg: 'bg-emerald-500/10', color: 'text-emerald-500', recipient: 'Priya Sharma', subject: 'Call recap — pricing questions', time: '1h ago' },
  { icon: Share2, bg: 'bg-orange-500/10', color: 'text-orange-500', recipient: 'Tom Alvarez', subject: 'Connected on LinkedIn', time: '3h ago' },
  { icon: Mail, bg: 'bg-sky-500/10', color: 'text-sky-500', recipient: 'Lena Hoffmann', subject: 'Trial extension requested', time: '4h ago' },
];

interface ScheduledOutreach {
  type: string;
  contact: string;
  status: string;
  time: string;
}

const scheduledOutreach: ScheduledOutreach[] = [
  { type: 'Email', contact: 'David Kim — Acme Corp', status: 'Scheduled', time: 'Today, 2:00 PM' },
  { type: 'Calls', contact: 'Emma Ruiz — Brightline', status: 'Sending', time: 'Today, 4:30 PM' },
  { type: 'Meetings', contact: 'Product demo — Northwind', status: 'Scheduled', time: 'Tomorrow, 10:00 AM' },
  { type: 'Email', contact: 'Follow-up: Jonas Berg', status: 'Sent', time: 'Tomorrow, 9:00 AM' },
];

const statusStyles: Record<string, string> = {
  Scheduled: 'bg-sky-500/15 text-sky-500 border-sky-500/25',
  Sending: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  Sent: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const engagementSummary = {
  totalInteractions: 0,
  avgEngagementScore: 0,
  topPerformingDay: '—',
  peakHours: '—',
  responseImprovement: '—',
};

export default function CommunicationAnalyticsHub() {
  const [activeTab, setActiveTab] = useState<ChannelTab>('All');

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Header with filter tabs */}
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-2 bg-gradient-to-br from-sky-500 to-violet-500">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              Communication Analytics
            </CardTitle>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
              {channelTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                    activeTab === tab
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-2 rounded-lg bg-muted/20 text-center">
              <p className="text-lg font-bold tabular-nums">{engagementSummary.totalInteractions.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">Total Interactions</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 text-center">
              <p className="text-lg font-bold tabular-nums text-emerald-500">{engagementSummary.avgEngagementScore}</p>
              <p className="text-[9px] text-muted-foreground">Avg Score</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 text-center">
              <p className="text-lg font-bold tabular-nums">{engagementSummary.topPerformingDay}</p>
              <p className="text-[9px] text-muted-foreground">Best Day</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 text-center">
              <p className="text-lg font-bold tabular-nums">{engagementSummary.peakHours}</p>
              <p className="text-[9px] text-muted-foreground">Peak Hours</p>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-center">
              <p className="text-lg font-bold tabular-nums text-emerald-500">{engagementSummary.responseImprovement}</p>
              <p className="text-[9px] text-muted-foreground">Response Improvement</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Performance Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {channelPerformanceData.map((ch) => {
          const Icon = ch.icon;
          const filtered = activeTab === 'All' || activeTab === ch.channel;
          return (
            <motion.div key={ch.channel} whileHover={{ scale: 1.02, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Card className={cn(
                'glass-card overflow-hidden transition-all duration-300 border',
                filtered ? 'opacity-100' : 'opacity-40',
                ch.border
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('rounded-lg p-2', ch.bg)}>
                      <Icon className={cn('h-4 w-4', ch.color)} />
                    </div>
                    <div className={cn(
                      'flex items-center gap-0.5 text-xs font-semibold',
                      ch.trend >= 0 ? 'text-emerald-500' : 'text-red-500'
                    )}>
                      {ch.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {ch.trend > 0 ? '+' : ''}{ch.trend}%
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold tabular-nums">{ch.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mb-3">{ch.channel} sent</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Response rate</span>
                      <span className="font-semibold">{ch.responseRate}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Avg response</span>
                      <span className="font-semibold">{ch.avgTime}</span>
                    </div>
                  </div>
                  {/* Mini bar distribution */}
                  <div className="flex items-end gap-0.5 mt-3 h-6">
                    {ch.dailyVolume.map((v, i) => (
                      <div key={i} className="flex-1 rounded-sm transition-all duration-300" style={{
                        height: `${(v / Math.max(...ch.dailyVolume)) * 100}%`,
                        backgroundColor: ch.color.includes('sky') ? '#0ea5e9' : ch.color.includes('emerald') ? '#10b981' : ch.color.includes('violet') ? '#8b5cf6' : '#f97316',
                        opacity: 0.3 + (v / Math.max(...ch.dailyVolume)) * 0.7,
                      }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Response Time Distribution */}
      <motion.div variants={itemVariants}>
        <Card className="card-glow glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Response Time Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={responseTimeData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,0.1)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <RTooltip
                    contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                    {responseTimeData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Two-column: Templates + Timeline + Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Best Performing Templates */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Best Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topTemplates.map((tpl, i) => (
                <div key={tpl.name} className="p-3 rounded-lg bg-muted/30 border border-border/30 hover:border-primary/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold truncate">{tpl.name}</span>
                    <Badge variant="outline" className="text-[9px] h-4 shrink-0 ml-2">#{i + 1}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs font-bold text-sky-500">{tpl.openRate}%</p>
                      <p className="text-[9px] text-muted-foreground">Open</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-500">{tpl.replyRate}%</p>
                      <p className="text-[9px] text-muted-foreground">Reply</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-violet-500">{tpl.conversionRate}%</p>
                      <p className="text-[9px] text-muted-foreground">Convert</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Used {tpl.usage}x</span>
                    <span className="text-[10px] text-muted-foreground">{tpl.lastUsed}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Communication Timeline */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-72 custom-scrollbar">
                <div className="px-4 pb-4 space-y-0.5">
                  {recentCommunications.map((comm, i) => {
                    const Icon = comm.icon;
                    return (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer">
                        <div className={cn('rounded-full p-1.5 shrink-0', comm.bg)}>
                          <Icon className={cn('h-3 w-3', comm.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{comm.recipient}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{comm.subject}</p>
                        </div>
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0">{comm.time}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Outreach Schedule */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-violet-500" />
                Upcoming Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scheduledOutreach.map((item, i) => {
                const cfg = channelConfig[item.type] || channelConfig.Email;
                const TypeIcon = cfg.icon;
                return (
                  <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <TypeIcon className={cn('h-3 w-3', cfg.color)} />
                      <span className="text-xs font-semibold truncate">{item.contact}</span>
                      <Badge className={cn('text-[8px] px-1.5 py-0 h-4 ml-auto border shrink-0', statusStyles[item.status])}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {item.time}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
