'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Swords, Building2, Mail, FileText, StickyNote, HandshakeIcon, Shield, Users, Send, CalendarPlus, Sparkles, TrendingDown, CircleDot, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type DealStage = 'Discovery' | 'Proposal' | 'Negotiation' | 'Close';
type FilterType = 'all' | 'high-value' | 'at-risk';
type RelStr = 'strong' | 'moderate' | 'weak';
type DealRisk = 'fresh' | 'aging' | 'stale';

interface DealCardData {
  id: string; company: string; industry: string; indColor: string;
  value: number; stage: DealStage; stageProg: number; stageColor: string;
  dm: { name: string; title: string; initials: string };
  lastAct: string; lastActType: string; rel: RelStr;
  competitors: number; ready: boolean; daysInStage: number;
}

const RISK_S: Record<DealRisk, string> = { fresh: 'bg-emerald-500/20 border-emerald-500/40', aging: 'bg-amber-500/20 border-amber-500/40', stale: 'bg-red-500/20 border-red-500/40' };
const RISK_L: Record<DealRisk, string> = { fresh: 'Fresh', aging: 'Aging', stale: 'Stale' };
const REL_C: Record<RelStr, string> = { strong: 'bg-emerald-500', moderate: 'bg-amber-500', weak: 'bg-red-500' };
const REL_L: Record<RelStr, string> = { strong: 'Strong', moderate: 'Moderate', weak: 'Needs Work' };
const ACT_ICONS: Record<string, React.ElementType> = { call: Phone, email: Mail, meeting: Users, note: StickyNote };

const DEALS: DealCardData[] = [
  { id: 'd1', company: 'CloudSync Technologies', industry: 'SaaS', indColor: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', value: 285000, stage: 'Negotiation', stageProg: 75, stageColor: '#ec4899', dm: { name: 'Jennifer Walsh', title: 'CTO', initials: 'JW' }, lastAct: '2 hours ago', lastActType: 'call', rel: 'strong', competitors: 1, ready: false, daysInStage: 4 },
  { id: 'd2', company: 'MedVista Health', industry: 'Healthcare', indColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', value: 450000, stage: 'Proposal', stageProg: 50, stageColor: '#a855f7', dm: { name: 'Dr. Raj Mehta', title: 'VP Ops', initials: 'RM' }, lastAct: '5 hours ago', lastActType: 'email', rel: 'moderate', competitors: 2, ready: false, daysInStage: 8 },
  { id: 'd3', company: 'PayFlow Finance', industry: 'FinTech', indColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', value: 175000, stage: 'Close', stageProg: 95, stageColor: '#10b981', dm: { name: 'Alex Turner', title: 'Head of Product', initials: 'AT' }, lastAct: '1 hour ago', lastActType: 'meeting', rel: 'strong', competitors: 0, ready: true, daysInStage: 2 },
  { id: 'd4', company: 'ShopDirect E-commerce', industry: 'E-commerce', indColor: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', value: 125000, stage: 'Discovery', stageProg: 25, stageColor: '#f97316', dm: { name: 'Lisa Park', title: 'CMO', initials: 'LP' }, lastAct: '1 day ago', lastActType: 'note', rel: 'weak', competitors: 3, ready: false, daysInStage: 12 },
];

const PIPELINE = [
  { name: 'Discovery' as DealStage, totalValue: 125000, risk: 'stale' as DealRisk, color: '#f97316' },
  { name: 'Proposal' as DealStage, totalValue: 450000, risk: 'aging' as DealRisk, color: '#a855f7' },
  { name: 'Negotiation' as DealStage, totalValue: 285000, risk: 'fresh' as DealRisk, color: '#ec4899' },
  { name: 'Close' as DealStage, totalValue: 175000, risk: 'fresh' as DealRisk, color: '#10b981' },
];

const WINS = [{ company: 'PayFlow Finance', value: 175000 }, { company: 'DataBridge Analytics', value: 92000 }];

const FEED = [
  { id: 'a1', deal: 'CloudSync', action: 'Proposal revision sent', user: 'Sarah C.', time: '2h ago', icon: FileText, color: 'text-violet-500' },
  { id: 'a2', deal: 'PayFlow', action: 'Closing call completed', user: 'Marcus J.', time: '1h ago', icon: HandshakeIcon, color: 'text-emerald-500' },
  { id: 'a3', deal: 'MedVista', action: 'Follow-up email sent', user: 'Priya P.', time: '5h ago', icon: Send, color: 'text-sky-500' },
  { id: 'a4', deal: 'ShopDirect', action: 'Discovery meeting scheduled', user: 'Alex R.', time: '1d ago', icon: CalendarPlus, color: 'text-amber-500' },
  { id: 'a5', deal: 'CloudSync', action: 'Internal note added', user: 'Sarah C.', time: '1d ago', icon: StickyNote, color: 'text-pink-500' },
];

const cv: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } } };
const sc: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
const iv: Variants = { hidden: { opacity: 0, y: 12, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35 } } };

function DealCard({ deal }: { deal: DealCardData }) {
  const AI = ACT_ICONS[deal.lastActType] ?? FileText;
  return (
    <motion.div variants={iv} whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={cn('rounded-xl p-4 border transition-all duration-300 hover:shadow-lg', 'bg-white/5 backdrop-blur-xl border-white/10 dark:bg-black/20', deal.ready && 'ring-1 ring-emerald-500/30 border-emerald-500/20')}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg p-1.5 bg-primary/10 shrink-0"><Building2 className="h-4 w-4 text-primary" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate">{deal.company}</h3>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 border mt-0.5', deal.indColor)}>{deal.industry}</Badge>
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="text-sm font-bold tabular-nums">${(deal.value / 1000).toFixed(0)}K</p>
          {deal.daysInStage > 7 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-amber-500 border-amber-500/25">{deal.daysInStage}d in stage</Badge>}
        </div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-muted-foreground">{deal.stage}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{deal.stageProg}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ backgroundColor: deal.stageColor }} initial={{ width: 0 }} animate={{ width: `${deal.stageProg}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2.5">
        <Avatar className="h-6 w-6"><AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">{deal.dm.initials}</AvatarFallback></Avatar>
        <div className="min-w-0"><p className="text-xs font-medium truncate">{deal.dm.name}</p><p className="text-[10px] text-muted-foreground">{deal.dm.title}</p></div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><AI className="h-3 w-3" /><span>{deal.lastAct}</span></div>
        <div className="flex items-center gap-1.5"><div className={cn('h-2 w-2 rounded-full', REL_C[deal.rel])} /><span className="text-[10px] text-muted-foreground">{REL_L[deal.rel]}</span></div>
      </div>
      {deal.competitors > 0 && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md bg-amber-500/8 border border-amber-500/15">
          <Shield className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400">{deal.competitors} competitor{deal.competitors !== 1 ? 's' : ''} in play</span>
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-white/5">
        <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-7 gap-1"><CalendarPlus className="h-3 w-3" />Schedule</Button>
        <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-7 gap-1"><FileText className="h-3 w-3" />Proposal</Button>
        <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-7 gap-1"><StickyNote className="h-3 w-3" />Note</Button>
      </div>
    </motion.div>
  );
}

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' }, { label: 'High Value', value: 'high-value' }, { label: 'At Risk', value: 'at-risk' },
];

export default function DealRoomWarBoard() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 500); return () => clearTimeout(t); }, []);
  const filtered = filter === 'all' ? DEALS : filter === 'high-value' ? DEALS.filter(d => d.value >= 200000) : DEALS.filter(d => d.daysInStage > 7);
  const total = PIPELINE.reduce((s, p) => s + p.totalValue, 0);

  return (
    <motion.div variants={cv} initial="hidden" animate="show">
      <Card className="rounded-2xl overflow-hidden card-glow glass-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg p-2 bg-red-500/10"><Swords className="h-4 w-4 text-red-500" /></div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">Deal Room <Badge className="text-[10px] h-5 px-1.5 bg-primary/15 text-primary border-primary/25">{DEALS.length} Active</Badge></CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Pipeline value: ${(total / 1000).toFixed(0)}K</p>
              </div>
            </div>
            <div className="flex gap-1.5">{FILTERS.map(f => <Button key={f.value} variant={filter === f.value ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f.value)} className="text-[11px] h-7 px-2.5">{f.label}</Button>)}</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {ready ? (
            <>
              <motion.div variants={sc} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">{filtered.map(d => <DealCard key={d.id} deal={d} />)}</AnimatePresence>
              </motion.div>
              {filtered.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No deals match the selected filter.</div>}
              <motion.div variants={iv} initial="hidden" animate="show">
                <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-amber-500" />Pipeline Pressure</p>
                  <div className="space-y-2.5">{PIPELINE.map(st => {
                    const pct = total > 0 ? (st.totalValue / total) * 100 : 0;
                    return (<div key={st.name} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-24 shrink-0">{st.name}</span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden"><motion.div className="h-full rounded-full border" style={{ backgroundColor: st.color, borderColor: `${st.color}40` }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} /></div>
                      <span className="text-xs font-medium tabular-nums w-16 text-right">${(st.totalValue / 1000).toFixed(0)}K</span>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-5 border', RISK_S[st.risk])}>{RISK_L[st.risk]}</Badge>
                    </div>);
                  })}</div>
                </div>
              </motion.div>
              <motion.div variants={iv} initial="hidden" animate="show">
                <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-emerald-500" />Quick Win Opportunities</p>
                  <div className="space-y-2">{WINS.map(w => (
                    <div key={w.company} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                      <div className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-emerald-500" /><span className="text-sm font-medium">{w.company}</span></div>
                      <div className="flex items-center gap-3"><span className="text-sm font-bold tabular-nums">${(w.value / 1000).toFixed(0)}K</span><Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"><HandshakeIcon className="h-3 w-3" />Close Deal</Button></div>
                    </div>
                  ))}</div>
                </div>
              </motion.div>
              <motion.div variants={iv} initial="hidden" animate="show">
                <div className="rounded-xl p-4 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
                  <p className="text-sm font-semibold mb-3">Team Activity</p>
                  <div className="space-y-1.5">{FEED.map(item => { const Icon = item.icon; return (
                    <div key={item.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/20 transition-colors">
                      <div className={cn('rounded-md p-1 bg-muted/30', item.color)}><Icon className="h-3 w-3" /></div>
                      <div className="flex-1 min-w-0"><p className="text-xs truncate"><span className="font-medium">{item.user}</span>{' '}{item.action}{' '}<span className="text-muted-foreground">— {item.deal}</span></p></div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
                    </div>
                  ); })}</div>
                </div>
              </motion.div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
