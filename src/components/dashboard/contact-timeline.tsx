'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Phone,
  Mail,
  Users,
  Calendar,
  FileText,
  Send,
  Clock,
  MessageSquare,
  CheckCircle2,
  Plus,
  ChevronDown,
  Filter,
  History,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

/* ===== Types ===== */
type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'deal_update' | 'proposal_sent' | 'follow_up' | 'contract_signed';
type FilterTab = 'all' | 'call' | 'email' | 'meeting' | 'note';
type Period = '7d' | '30d' | '90d' | 'all';

interface Contact {
  id: string;
  name: string;
  company: string;
  role: string;
  avatar: string;
}

interface TimelineEvent {
  id: string;
  contactId: string;
  type: InteractionType;
  title: string;
  description: string;
  timestamp: string;
  duration?: string;
}

interface ContactTimelineData {
  contacts: Contact[];
  timelineEvents: TimelineEvent[];
}

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes ctFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ctSlideRight { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
@keyframes ctPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
@keyframes ctToastIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes ctToastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-8px) scale(0.95); } }
.ct-fade-in { animation: ctFadeIn 0.5s ease-out both; }
.ct-slide-right { animation: ctSlideRight 0.35s ease-out both; }
.ct-pulse { animation: ctPulse 2s ease-in-out infinite; }
.ct-toast-in { animation: ctToastIn 0.3s ease-out both; }
.ct-toast-out { animation: ctToastOut 0.3s ease-in both; }
`;

/* ===== Config ===== */
const TYPE_CONFIG: Record<InteractionType, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  call: { icon: Phone, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30', label: 'Call' },
  email: { icon: Mail, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30', label: 'Email' },
  meeting: { icon: Users, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Meeting' },
  note: { icon: FileText, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30', label: 'Note' },
  deal_update: { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Deal Update' },
  proposal_sent: { icon: Send, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Proposal Sent' },
  follow_up: { icon: Clock, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Follow-up' },
  contract_signed: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Contract Signed' },
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'call', label: 'Calls' },
  { key: 'email', label: 'Emails' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'note', label: 'Notes' },
];

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '90d', label: 'Last 90 Days' },
  { key: 'all', label: 'All Time' },
];

/* ===== Helpers ===== */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 60) return `${Math.max(diffMin, 0)}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/* ===== Loading Skeleton ===== */
function TimelineSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-36" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function ContactTimeline() {
  const [apiData, setApiData] = useState<ContactTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [activePeriod, setActivePeriod] = useState<Period>('all');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [toastExiting, setToastExiting] = useState(false);

  useEffect(() => {
    fetch('/api/leads')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setApiData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const CONTACTS: Contact[] = apiData?.contacts ?? [];
  const TIMELINE_EVENTS: TimelineEvent[] = useMemo(() => {
    const raw = apiData?.timelineEvents ?? [];
    // Normalize timestamps to Date objects for filtering
    return raw.map(e => ({
      ...e,
      timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date(e.timestamp).toISOString(),
    }));
  }, [apiData]);

  const showToast = (message: string) => {
    setToast({ message, id: Date.now() });
    setToastExiting(false);
    setTimeout(() => setToastExiting(true), 2000);
    setTimeout(() => setToast(null), 2300);
  };

  const getContact = (id: string): Contact | undefined => {
    return CONTACTS.find(c => c.id === id);
  };

  const filteredEvents = useMemo(() => {
    let events = [...TIMELINE_EVENTS];

    // Filter by contact
    if (selectedContact !== 'all') {
      events = events.filter(e => e.contactId === selectedContact);
    }

    // Filter by type
    if (activeFilter !== 'all') {
      events = events.filter(e => e.type === activeFilter);
    }

    // Filter by period
    if (activePeriod !== 'all') {
      const now = new Date();
      const periodMs: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, 'all': Infinity };
      const cutoff = new Date(now.getTime() - (periodMs[activePeriod] ?? Infinity) * 24 * 60 * 60 * 1000);
      events = events.filter(e => new Date(e.timestamp) >= cutoff);
    }

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedContact, activeFilter, activePeriod, TIMELINE_EVENTS]);

  const summaryStats = useMemo(() => {
    const eventsForContact = selectedContact === 'all'
      ? TIMELINE_EVENTS
      : TIMELINE_EVENTS.filter(e => e.contactId === selectedContact);
    const total = eventsForContact.length;
    const lastContact = eventsForContact.length > 0
      ? formatRelativeTime(eventsForContact.reduce((latest, e) => new Date(e.timestamp) > new Date(latest) ? e.timestamp : latest, eventsForContact[0].timestamp))
      : 'N/A';
    return { total, lastContact, avgResponse: 'N/A', upcoming: 0 };
  }, [selectedContact, TIMELINE_EVENTS]);

  const currentContact = selectedContact === 'all'
    ? { name: 'All Contacts', avatar: 'AC', company: '' }
    : getContact(selectedContact);

  if (loading) return <TimelineSkeleton />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-4', mounted ? 'ct-fade-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-sky-500 to-blue-600">
                  <History className="h-4 w-4 text-white" />
                </div>
                Contact Timeline
                <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/25 border text-[9px] h-5">
                  {filteredEvents.length} events
                </Badge>
              </CardTitle>
              <Button
                onClick={() => showToast('Interaction logged successfully!')}
                className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-xs shadow-md hover:shadow-lg transition-all duration-200"
                size="sm"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Log New Interaction
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Interactions', value: summaryStats.total, icon: MessageSquare, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                { label: 'Last Contact', value: summaryStats.lastContact, icon: Clock, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                { label: 'Avg Response Time', value: summaryStats.avgResponse, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Upcoming', value: summaryStats.upcoming, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div className={cn('rounded-md p-1.5 shrink-0', stat.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Contact Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowContactDropdown(!showContactDropdown); setShowPeriodDropdown(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/40 text-xs font-medium hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                >
                  <div className="flex h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 items-center justify-center">
                    <span className="text-[8px] text-white font-bold">{currentContact?.avatar}</span>
                  </div>
                  <span className="max-w-[120px] truncate">{currentContact?.name}</span>
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200', showContactDropdown && 'rotate-180')} />
                </button>
                {showContactDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1 ct-slide-right">
                    <button
                      onClick={() => { setSelectedContact('all'); setShowContactDropdown(false); }}
                      className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer', selectedContact === 'all' ? 'bg-sky-500/10 text-sky-500 font-medium' : 'hover:bg-muted/50')}
                    >
                      <div className="flex h-5 w-5 rounded-full bg-muted items-center justify-center"><span className="text-[8px] font-bold">AC</span></div>
                      All Contacts
                    </button>
                    {CONTACTS.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => { setSelectedContact(contact.id); setShowContactDropdown(false); }}
                        className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer', selectedContact === contact.id ? 'bg-sky-500/10 text-sky-500 font-medium' : 'hover:bg-muted/50')}
                      >
                        <div className="flex h-5 w-5 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 items-center justify-center">
                          <span className="text-[8px] font-bold text-primary">{contact.avatar}</span>
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-[10px] text-muted-foreground">{contact.role} at {contact.company}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Period Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowPeriodDropdown(!showPeriodDropdown); setShowContactDropdown(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/40 text-xs font-medium hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{PERIOD_OPTIONS.find(p => p.key === activePeriod)?.label}</span>
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200', showPeriodDropdown && 'rotate-180')} />
                </button>
                {showPeriodDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-40 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1 ct-slide-right">
                    {PERIOD_OPTIONS.map((period) => (
                      <button
                        key={period.key}
                        onClick={() => { setActivePeriod(period.key); setShowPeriodDropdown(false); }}
                        className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer', activePeriod === period.key ? 'bg-sky-500/10 text-sky-500 font-medium' : 'hover:bg-muted/50')}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer border',
                    activeFilter === tab.key
                      ? 'bg-sky-500/10 text-sky-500 border-sky-500/30'
                      : 'bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border/60" />
              <div className="space-y-3">
                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Filter className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No interactions found</p>
                    <p className="text-[10px] mt-1">Try adjusting your filters</p>
                  </div>
                ) : (
                  filteredEvents.map((event, index) => {
                    const contact = getContact(event.contactId);
                    const config = TYPE_CONFIG[event.type];
                    const Icon = config.icon;
                    return (
                      <div
                        key={event.id}
                        className="ct-slide-right relative flex items-start gap-3 group"
                        style={{ animationDelay: `${index * 0.06}s` }}
                      >
                        <div className={cn(
                          'relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm transition-transform duration-200 group-hover:scale-110',
                          config.bg
                        )}>
                          <Icon className={cn('h-4 w-4', config.color)} />
                        </div>
                        <div className="flex-1 min-w-0 p-3 rounded-xl bg-background/50 border border-border/30 hover:border-border/60 transition-all duration-200 group-hover:shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-5 w-5 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 items-center justify-center shrink-0">
                                <span className="text-[7px] font-bold text-primary">{contact?.avatar}</span>
                              </div>
                              <span className="text-xs font-semibold truncate">{contact?.name}</span>
                              <span className="text-[10px] text-muted-foreground hidden sm:inline">{contact?.company}</span>
                            </div>
                            <Badge variant="outline" className={cn('text-[8px] h-4 px-1.5 shrink-0', config.color, config.border)}>
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium mt-1.5">{event.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(event.timestamp)}
                            </span>
                            {event.duration && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {event.duration}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Toast Notification */}
        {toast && (
          <div className={cn('fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-medium shadow-lg backdrop-blur-xl', toastExiting ? 'ct-toast-out' : 'ct-toast-in')}>
            <CheckCircle2 className="h-4 w-4" />
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
