'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Bell, Plus, AlertTriangle, Info, Clock, CheckCircle2,
  Snowflake, Zap, Eye, Calendar, Phone, Mail, FileText,
  ChevronRight, BellOff, Pause, X, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Config ─────────────────────────────────────────────── */
const DEFAULT_ALERT_RULES = [
  { id: 'cold-lead', label: 'Lead goes cold (no activity > 7 days)', triggered: 0, enabled: true, icon: Snowflake, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  { id: 'stuck-deal', label: 'Deal stuck in stage > 14 days', triggered: 0, enabled: true, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'hot-lead', label: 'High-value lead uncontacted > 24h', triggered: 0, enabled: true, icon: Zap, color: 'text-red-500', bg: 'bg-red-500/10' },
];

const severityConfig = {
  Critical: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500/15 text-red-500 border-red-500/25' },
  Warning: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/25' },
  Info: { color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30', badge: 'bg-sky-500/15 text-sky-500 border-sky-500/25' },
};

type Severity = keyof typeof severityConfig;

const reminderTypes: Record<string, { icon: React.ElementType; color: string }> = {
  'Follow-up': { icon: Phone, color: 'text-emerald-500' },
  'Meeting': { icon: Calendar, color: 'text-violet-500' },
  'Proposal': { icon: FileText, color: 'text-amber-500' },
  'Call': { icon: Phone, color: 'text-sky-500' },
};

type ReminderStatus = 'Overdue' | 'Today' | 'Upcoming';
const statusColors: Record<ReminderStatus, string> = {
  Overdue: 'bg-red-500/15 text-red-500 border-red-500/25',
  Today: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  Upcoming: 'bg-sky-500/15 text-sky-500 border-sky-500/25',
};

const newAlertTypes = ['Lead goes cold', 'Deal stuck', 'Hot lead uncontacted', 'Deal value change', 'New lead scored', 'Reply received'];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

export default function CustomAlertsPanel() {
  const [rules, setRules] = useState(DEFAULT_ALERT_RULES);
  const [activeAlerts, setActiveAlerts] = useState<Array<{ id: string; severity: Severity; icon: React.ElementType; description: string; entity: string; time: string }>>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Array<{ id: string; contact: string; type: string; due: string; status: ReminderStatus }>>([]);
  const [alertHistory, setAlertHistory] = useState<Array<{ id: string; text: string; dismissed: string }>>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedAlertType, setSelectedAlertType] = useState(newAlertTypes[0]);

  useEffect(() => {
    fetch('/api/alerts')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.rules) setRules(d.rules);
        if (d.activeAlerts) setActiveAlerts(d.activeAlerts);
        if (d.upcomingReminders) setUpcomingReminders(d.upcomingReminders);
        if (d.alertHistory) setAlertHistory(d.alertHistory);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => [...prev, id]);
  };

  const visibleAlerts = activeAlerts.filter((a) => !dismissedAlerts.includes(a.id));

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-2 bg-gradient-to-br from-red-500 to-amber-500">
                <Bell className="h-4 w-4 text-white" />
              </div>
              Smart Alerts
              <Badge className="bg-red-500/15 text-red-500 border-red-500/25 border text-[10px] px-1.5 py-0 h-5">
                {visibleAlerts.length}
              </Badge>
            </CardTitle>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setShowCreateForm((p) => !p)}>
              <Plus className="h-3 w-3" />
              Create Alert
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Alert Rules Summary */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rules.map((rule) => {
          const Icon = rule.icon;
          return (
            <Card key={rule.id} className={cn('glass-card overflow-hidden border transition-all duration-300', rule.border, !rule.enabled && 'opacity-50')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn('rounded-lg p-2 shrink-0', rule.bg)}>
                    <Icon className={cn('h-4 w-4', rule.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{rule.label}</p>
                    <Badge className={cn('text-[8px] px-1.5 py-0 h-4 mt-1 border', rule.bg, rule.color.replace('text-', 'text-').replace('500', '500/80'))}>
                      {rule.triggered} triggered
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors duration-200',
                      rule.enabled ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                      rule.enabled && 'translate-x-4'
                    )} />
                  </button>
                  <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Quick Create Alert Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div variants={itemVariants} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="glass-card overflow-hidden border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Create Alert Rule</span>
                  <button onClick={() => setShowCreateForm(false)} className="ml-auto">
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-1 block">Alert Type</label>
                    <select
                      value={selectedAlertType}
                      onChange={(e) => setSelectedAlertType(e.target.value)}
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {newAlertTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-1 block">Condition</label>
                    <input
                      type="text"
                      placeholder="e.g. > 7 days inactivity"
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button size="sm" className="h-9 text-xs gap-1">
                      <Save className="h-3 w-3" />
                      Save Rule
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Alerts + Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Alerts */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-80 custom-scrollbar">
                <div className="px-4 pb-4 space-y-2">
                  <AnimatePresence>
                    {visibleAlerts.map((alert, i) => {
                      const sev = severityConfig[alert.severity];
                      const Icon = alert.icon;
                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12, height: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={cn('p-3 rounded-lg border transition-all duration-200 hover:shadow-sm', sev.border, sev.bg)}
                        >
                          <div className="flex items-start gap-2.5">
                            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', sev.color)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Badge className={cn('text-[8px] px-1.5 py-0 h-4 border', sev.badge)}>
                                  {alert.severity}
                                </Badge>
                                <span className="text-[9px] text-muted-foreground">{alert.time}</span>
                              </div>
                              <p className="text-xs font-medium leading-snug">{alert.description}</p>
                              <p className="text-[10px] text-primary mt-0.5 truncate">{alert.entity}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/30">
                            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-background/50 transition-colors">
                              <BellOff className="h-3 w-3" /> Dismiss
                            </button>
                            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-background/50 transition-colors">
                              <Pause className="h-3 w-3" /> Snooze
                            </button>
                            <button onClick={() => dismissAlert(alert.id)} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-primary/5 transition-colors ml-auto">
                              <Eye className="h-3 w-3" /> Take Action
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Upcoming Reminders */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-500" />
                Upcoming Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {upcomingReminders.map((rem) => {
                const rType = reminderTypes[rem.type] || reminderTypes['Follow-up'];
                const TypeIcon = rType.icon;
                return (
                  <div key={rem.id} className="p-3 rounded-lg bg-muted/20 border border-border/20 hover:border-primary/20 transition-colors">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={cn('rounded-lg p-1.5', `bg-${rem.type === 'Follow-up' || rem.type === 'Call' ? rem.type === 'Call' ? 'sky' : 'emerald' : rem.type === 'Meeting' ? 'violet' : 'amber'}-500/10`)}>
                        <TypeIcon className={cn('h-3.5 w-3.5', rType.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{rem.contact}</p>
                        <p className="text-[10px] text-muted-foreground">{rem.type}</p>
                      </div>
                      <Badge className={cn('text-[8px] px-1.5 py-0 h-4 border shrink-0', statusColors[rem.status])}>
                        {rem.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
                      <Clock className="h-3 w-3" />
                      {rem.due}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Complete
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground">
                        Reschedule
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Alert History */}
      <motion.div variants={itemVariants}>
        <Card className="card-glow glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BellOff className="h-4 w-4 text-muted-foreground" />
              Alert History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {alertHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{item.text}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0 ml-2">{item.dismissed}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
