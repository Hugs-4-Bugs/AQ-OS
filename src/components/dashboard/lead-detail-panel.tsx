'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
  ChevronRight,
  UserCircle,
  Clock,
  Zap,
  Pencil,
  X,
  Check,
  Trash2,
  RefreshCw,
  Activity,
  Plus,
  StickyNote,
  Handshake,
  Send,
  TrendingUp,
  CalendarClock,
  Star,
  Building2,
  Tag,
  MessageSquare,
  Search,
  LayoutGrid,
  FileText,
  Loader2,
  Link,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProspectPipelineTab from '@/components/dashboard/prospect-pipeline-tab';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { updateLead, deleteLead, fetchLeadActivities } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, STAGE_COLORS, STAGE_ORDER, type Lead, type LeadStage } from '@/lib/types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Helper Functions ────────────────────────────────────
function getScoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-500';
  if (score >= 50) return 'text-sky-500';
  if (score >= 25) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBarClass(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-sky-500';
  if (score >= 25) return 'bg-amber-500';
  return 'bg-red-500';
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityIcon(type: string): { icon: typeof Sparkles; bg: string; text: string } {
  switch (type) {
    case 'lead_created': return { icon: Zap, bg: 'bg-emerald-500/15', text: 'text-emerald-500' };
    case 'stage_change': return { icon: ChevronRight, bg: 'bg-sky-500/15', text: 'text-sky-500' };
    case 'note_added': return { icon: StickyNote, bg: 'bg-amber-500/15', text: 'text-amber-500' };
    case 'deal_created': return { icon: Handshake, bg: 'bg-emerald-500/15', text: 'text-emerald-500' };
    case 'outreach_sent': return { icon: Send, bg: 'bg-violet-500/15', text: 'text-violet-500' };
    case 'analysis_complete': return { icon: Sparkles, bg: 'bg-rose-500/15', text: 'text-rose-500' };
    case 'website_analyzed': return { icon: Globe, bg: 'bg-cyan-500/15', text: 'text-cyan-500' };
    case 'score_updated': return { icon: TrendingUp, bg: 'bg-orange-500/15', text: 'text-orange-500' };
    case 'followup_scheduled': return { icon: CalendarClock, bg: 'bg-amber-500/15', text: 'text-amber-500' };
    default: return { icon: Activity, bg: 'bg-slate-500/15', text: 'text-slate-500' };
  }
}

function getWebsiteQualityBadge(lead: Lead) {
  if (!lead.hasWebsite) return <Badge className="bg-red-500/15 text-red-400 border-red-500/20">No Website</Badge>;
  const q = lead.websiteQuality?.toLowerCase();
  if (q === 'poor') return <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20">Poor</Badge>;
  if (q === 'average') return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/20">Average</Badge>;
  if (q === 'good' || q === 'excellent') return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">Good</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/20">Unknown</Badge>;
}

// ─── Notes Tab Content ───────────────────────────────────
function NotesTab({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  const { data: notesResult, isLoading } = useQuery({
    queryKey: ['notes', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/notes`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      return res.json();
    },
    enabled: !!leadId,
  });

  const notes = notesResult?.notes ?? [];

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      setNewNote('');
      queryClient.invalidateQueries({ queryKey: ['notes', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setAdding(false);
    }
  }, [leadId, newNote, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[80px] border-primary/20 focus-visible:ring-primary/30"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleAddNote}
            disabled={!newNote.trim() || adding}
            className="gap-1.5"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Note
          </Button>
        </div>
      </div>

      <Separator />

      {/* Notes List */}
      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note: { id: string; content: string; createdAt: string; pinned?: boolean; user?: { name?: string } }) => (
            <Card key={note.id} className={cn('border', note.pinned && 'border-primary/20')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-relaxed flex-1">{note.content}</p>
                  {note.pinned && <Badge variant="outline" className="text-[9px] shrink-0">Pinned</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {getRelativeTime(note.createdAt)}
                  {note.user?.name && (
                    <>
                      <span>·</span>
                      <span>{note.user.name}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No notes yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab Content ────────────────────────────────
function ActivityTab({ leadId }: { leadId: string }) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => fetchLeadActivities(leadId),
    enabled: !!leadId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No activity recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((act, idx) => {
        const { icon: Icon, bg, text } = getActivityIcon(act.type);
        const isLast = idx === activities.length - 1;
        return (
          <div key={act.id} className="flex items-start gap-3 relative">
            {/* Timeline line */}
            {!isLast && (
              <div className="absolute left-[11px] top-7 bottom-0 w-px bg-border/50" />
            )}
            <div className={cn('rounded-lg p-1.5 shrink-0 z-10', bg)}>
              <Icon className={cn('h-3.5 w-3.5', text)} />
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <p className="text-sm">{act.description}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{getRelativeTime(act.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Lead Detail Panel ──────────────────────────────
interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

export default function LeadDetailPanel({ lead, open, onClose }: LeadDetailPanelProps) {
  const queryClient = useQueryClient();
  const { setSelectedLeadId } = useAppStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    businessName: '',
    ownerName: '',
    email: '',
    phone: '',
    whatsapp: '',
    website: '',
    city: '',
    notes: '',
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const prevStageRef = useRef<string>('');

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => updateLead(lead!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsEditing(false);
      toast.success('Lead updated');
    },
    onError: () => {
      toast.error('Failed to update lead');
    },
  });

  // Stage change mutation
  const stageMutation = useMutation({
    mutationFn: async (stage: LeadStage) => {
      const res = await fetch(`/api/leads/${lead!.id}/move-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error('Failed to move lead');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Stage updated');
    },
    onError: () => {
      toast.error('Failed to update stage');
    },
  });

  // Enrich mutation
  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leads/${lead!.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeScreenshot: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Enrichment failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead enriched', {
        description: `Updated fields: ${data.fieldsUpdated?.join(', ') || 'various'}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Enrichment failed', { description: error.message });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(lead!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedLeadId(null);
      onClose();
      toast.success('Lead deleted');
    },
  });

  const handleStartEdit = useCallback(() => {
    if (!lead) return;
    setEditForm({
      businessName: lead.businessName || '',
      ownerName: lead.ownerName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      whatsapp: lead.whatsapp || '',
      website: lead.website || '',
      city: lead.city || '',
      notes: lead.notes || '',
    });
    setIsEditing(true);
  }, [lead]);

  const handleSaveEdit = useCallback(() => {
    const data: Partial<Lead> = {};
    if (editForm.businessName !== (lead?.businessName || '')) data.businessName = editForm.businessName;
    if (editForm.ownerName !== (lead?.ownerName || '')) data.ownerName = editForm.ownerName;
    if (editForm.email !== (lead?.email || '')) data.email = editForm.email;
    if (editForm.phone !== (lead?.phone || '')) data.phone = editForm.phone;
    if (editForm.whatsapp !== (lead?.whatsapp || '')) data.whatsapp = editForm.whatsapp;
    if (editForm.website !== (lead?.website || '')) data.website = editForm.website;
    if (editForm.city !== (lead?.city || '')) data.city = editForm.city;
    if (editForm.notes !== (lead?.notes || '')) data.notes = editForm.notes;
    if (Object.keys(data).length > 0) {
      updateMutation.mutate(data);
    } else {
      setIsEditing(false);
      toast.info('No changes detected');
    }
  }, [editForm, lead, updateMutation]);

  const handleStageChange = useCallback((newStage: string) => {
    prevStageRef.current = lead?.stage || '';
    stageMutation.mutate(newStage as LeadStage);
  }, [lead, stageMutation]);

  if (!lead) return null;

  const currentStageIndex = STAGE_ORDER.indexOf(lead.stage);

  return (
    // CRITICAL FIX (FIX 8): modal={false} — Radix modal dialogs apply
    // `pointer-events: none` to document.body outside the dialog, which
    // FROZE the entire navbar (notifications, settings, profile, theme)
    // while the lead panel was open. With modal={false} the overlay is
    // not rendered and outside elements stay fully interactive; the
    // panel still closes on outside click / ESC via onOpenChange.
    <Sheet open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
        // CRITICAL FIX (FIX 8): Previously this used onInteractOutside={e => e.preventDefault()}
        // which kept the Sheet open but ALSO swallowed all clicks on the navbar
        // (notifications, settings, profile, theme) because the Sheet's overlay
        // captured the click before it reached the navbar. Now we allow the
        // sheet to close on outside click (default behavior) — this lets the
        // navbar remain interactive. The back button below provides an
        // explicit way to close the panel without clicking outside.
      >
        {/* Back button — always visible at top-left of the panel */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b bg-background/95 backdrop-blur-sm shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={onClose}
            aria-label="Back to leads"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to leads
          </Button>
        </div>
        <SheetHeader className="p-4 pb-3 border-b pr-12 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg truncate">
                {isEditing ? (
                  <Input
                    value={editForm.businessName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, businessName: e.target.value }))}
                    className="h-8 text-lg font-semibold"
                    placeholder="Business Name"
                  />
                ) : (
                  lead.businessName
                )}
              </SheetTitle>
              <SheetDescription className="sr-only">Lead details and actions</SheetDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isEditing ? (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleStartEdit} title="Edit lead">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDeleteOpen(true)}
                    title="Delete lead"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </>
              )}
            </div>
          </div>
          {/* Stage + Badges */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Select value={lead.stage} onValueChange={handleStageChange} disabled={stageMutation.isPending}>
              <SelectTrigger className={cn('h-7 w-auto gap-1.5 border-0 px-2 py-0 text-xs font-medium text-white rounded-md', STAGE_COLORS[lead.stage])}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    <div className="flex items-center gap-2">
                      <div className={cn('h-2 w-2 rounded-full', STAGE_COLORS[stage])} />
                      <span>{STAGE_LABELS[stage]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lead.niche && <Badge variant="outline">{lead.niche}</Badge>}
            {lead.country && <Badge variant="outline">{lead.country}</Badge>}
            {getWebsiteQualityBadge(lead)}
          </div>
          {/* Tags */}
          {/* FIX: Array.isArray guards — lead.tags can arrive null or
              non-array from the API without crashing the panel. */}
          {Array.isArray(lead.tags) && lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 custom-scrollbar">
          <div className="p-4">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full grid grid-cols-6 mb-4 h-9">
                <TabsTrigger value="overview" className="text-[10px] sm:text-xs px-1">Overview</TabsTrigger>
                <TabsTrigger value="contact" className="text-[10px] sm:text-xs px-1">Contact</TabsTrigger>
                <TabsTrigger value="notes" className="text-[10px] sm:text-xs px-1">Notes</TabsTrigger>
                <TabsTrigger value="activity" className="text-[10px] sm:text-xs px-1">Activity</TabsTrigger>
                <TabsTrigger value="company" className="text-[10px] sm:text-xs px-1">Company</TabsTrigger>
                <TabsTrigger value="pipeline" className="text-[10px] sm:text-xs px-1">AI Pipeline</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                {/* Scores */}
                <section>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Scores</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Conversion', value: lead.conversionScore, icon: TrendingUp },
                      { label: 'Reply', value: lead.replyScore, icon: MessageSquare },
                      { label: 'Urgency', value: lead.urgencyScore, icon: Zap },
                      { label: 'Revenue Potential', value: lead.revenuePotentialScore, icon: Star },
                    ].map(({ label, value, icon: Icon }) => (
                      <Card key={label} className="border-primary/10">
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={cn(
                            'rounded-lg p-2',
                            value >= 75 ? 'bg-emerald-500/10' : value >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'
                          )}>
                            <Icon className={cn('h-4 w-4', getScoreColor(value))} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-lg font-bold font-mono', getScoreColor(value))}>{value}</p>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>

                <Separator />

                {/* Pipeline Status */}
                <section>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Pipeline Status</h3>
                  <div className="flex items-center gap-1 overflow-x-auto pb-2">
                    {STAGE_ORDER.map((stage, idx) => (
                      <div key={stage} className="flex items-center gap-1 shrink-0">
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          idx <= currentStageIndex ? STAGE_COLORS[stage] : 'bg-muted-foreground/20'
                        )} />
                        <span className={cn(
                          'text-[9px] whitespace-nowrap',
                          idx <= currentStageIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}>
                          {STAGE_LABELS[stage]}
                        </span>
                        {idx < STAGE_ORDER.length - 1 && (
                          <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />

                {/* Quick Info */}
                <section>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Quick Info</h3>
                  <div className="space-y-2.5">
                    {lead.ownerName && (
                      <div className="flex items-center gap-2 text-sm">
                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-16">Owner</span>
                        <span className="font-medium">{lead.ownerName}</span>
                      </div>
                    )}
                    {(lead.city || lead.country) && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-16">Location</span>
                        <span>{[lead.city, lead.country].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {lead.source && (
                      <div className="flex items-center gap-2 text-sm">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-16">Source</span>
                        <span className="capitalize">{lead.source.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {lead.rating != null && (
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span className="text-muted-foreground w-16">Rating</span>
                        <span className="font-medium">{Number(lead.rating).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                {/* Enrich Button */}
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => enrichMutation.mutate()}
                  disabled={enrichMutation.isPending}
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {enrichMutation.isPending ? 'Enriching...' : 'Enrich Lead'}
                </Button>
              </TabsContent>

              {/* Contact Tab */}
              <TabsContent value="contact" className="space-y-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Email</label>
                      <Input value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Phone</label>
                      <Input value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">WhatsApp</label>
                      <Input value={editForm.whatsapp} onChange={(e) => setEditForm(prev => ({ ...prev, whatsapp: e.target.value }))} placeholder="WhatsApp" className="h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Website</label>
                      <Input value={editForm.website} onChange={(e) => setEditForm(prev => ({ ...prev, website: e.target.value }))} placeholder="Website URL" className="h-8" />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Contact Info */}
                    <section>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                      <div className="space-y-2.5">
                        {lead.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <a href={`mailto:${lead.email}`} className="text-primary hover:underline truncate">{lead.email}</a>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <a href={`tel:${lead.phone}`} className="text-primary hover:underline">{lead.phone}</a>
                          </div>
                        )}
                        {lead.whatsapp && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span>{lead.whatsapp}</span>
                          </div>
                        )}
                        {lead.website && (
                          <div className="flex items-center gap-2 text-sm">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                              {lead.website}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {!lead.email && !lead.phone && !lead.whatsapp && !lead.website && (
                          <p className="text-sm text-muted-foreground">No contact info available. Try enriching this lead.</p>
                        )}
                      </div>
                    </section>

                    <Separator />

                    {/* Social Links */}
                    <section>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Social Links</h3>
                      <div className="space-y-2.5">
                        {lead.linkedin && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <a href={lead.linkedin.startsWith('http') ? lead.linkedin : `https://${lead.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                              LinkedIn <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {lead.instagram && (
                          <div className="flex items-center gap-2 text-sm">
                            <Globe className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                            <a href={lead.instagram.startsWith('http') ? lead.instagram : `https://instagram.com/${lead.instagram}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                              Instagram <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {lead.facebook && (
                          <div className="flex items-center gap-2 text-sm">
                            <Globe className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            <a href={lead.facebook.startsWith('http') ? lead.facebook : `https://facebook.com/${lead.facebook}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                              Facebook <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {!lead.linkedin && !lead.instagram && !lead.facebook && (
                          <p className="text-sm text-muted-foreground">No social links available.</p>
                        )}
                      </div>
                    </section>

                    <Separator />

                    {/* Address */}
                    {(lead.city || lead.country) && (
                      <section>
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Address</h3>
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{[lead.city, lead.country].filter(Boolean).join(', ')}</span>
                        </div>
                      </section>
                    )}

                    {/* Contact Strategy */}
                    {(lead.bestContactPerson || lead.bestChannel || lead.bestTiming || lead.outreachStyle) && (
                      <>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Contact Strategy</h3>
                          <div className="space-y-2">
                            {lead.bestContactPerson && (
                              <div className="flex items-center gap-2 text-sm">
                                <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground w-20">Best Person</span>
                                <span className="font-medium">{lead.bestContactPerson}</span>
                              </div>
                            )}
                            {lead.bestChannel && (
                              <div className="flex items-center gap-2 text-sm">
                                <Send className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground w-20">Best Channel</span>
                                <span className="font-medium capitalize">{lead.bestChannel}</span>
                              </div>
                            )}
                            {lead.bestTiming && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground w-20">Best Timing</span>
                                <span className="font-medium">{lead.bestTiming}</span>
                              </div>
                            )}
                            {lead.outreachStyle && (
                              <div className="flex items-center gap-2 text-sm">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground w-20">Style</span>
                                <span className="font-medium">{lead.outreachStyle}</span>
                              </div>
                            )}
                          </div>
                        </section>
                      </>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes">
                <NotesTab leadId={lead.id} />
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity">
                <ActivityTab leadId={lead.id} />
              </TabsContent>

              {/* Company Tab */}
              <TabsContent value="company" className="space-y-4">
                <section>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Company Info</h3>
                  <div className="space-y-2.5">
                    {lead.niche && (
                      <div className="flex items-center gap-2 text-sm">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-20">Niche</span>
                        <Badge variant="secondary">{lead.niche}</Badge>
                      </div>
                    )}
                    {lead.revenuePotential && (
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-20">Revenue Tier</span>
                        <Badge variant="outline" className="capitalize">{lead.revenuePotential}</Badge>
                      </div>
                    )}
                    {lead.urgency && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground w-20">Urgency</span>
                        <Badge variant="outline" className="capitalize">{lead.urgency}</Badge>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                {/* Website Quality */}
                <section>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Website</h3>
                  {lead.hasWebsite ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        {getWebsiteQualityBadge(lead)}
                      </div>
                      {lead.website && (
                        <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                          {lead.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No website found</p>
                  )}
                </section>

                <Separator />

                {/* Opportunity Notes */}
                {lead.opportunityNotes && (
                  <>
                    <section>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Opportunity Notes</h3>
                      <Card className="border-l-4 border-l-emerald-400 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent">
                        <CardContent className="p-3">
                          <p className="text-sm leading-relaxed">{lead.opportunityNotes}</p>
                        </CardContent>
                      </Card>
                    </section>
                    <Separator />
                  </>
                )}

                {/* Score Reasoning */}
                {lead.scoreReasoning && (
                  <>
                    <section>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Score Reasoning</h3>
                      <Card className="border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent">
                        <CardContent className="p-3">
                          <p className="text-sm leading-relaxed">{lead.scoreReasoning}</p>
                        </CardContent>
                      </Card>
                    </section>
                    <Separator />
                  </>
                )}

                {/* Digital Weaknesses */}
                {/* FIX: optional-chain guard — the API can return a lead with
                    digitalWeaknesses null/missing (field is JSON on the lead
                    record); accessing .length on undefined crashes the panel. */}
                {Array.isArray(lead.digitalWeaknesses) && lead.digitalWeaknesses.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Digital Weaknesses</h3>
                    <div className="space-y-2">
                      {lead.digitalWeaknesses.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className={cn(
                            'mt-0.5 h-2 w-2 rounded-full shrink-0',
                            w.severity === 'critical' ? 'bg-red-500' : w.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                          )} />
                          <span>{w.issue}</span>
                          <Badge variant="outline" className="text-[9px] capitalize shrink-0">{w.severity}</Badge>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Enrich Button */}
                <Button
                  className="w-full gap-2 mt-4"
                  variant="outline"
                  onClick={() => enrichMutation.mutate()}
                  disabled={enrichMutation.isPending}
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {enrichMutation.isPending ? 'Analyzing Website...' : 'Analyze Website'}
                </Button>
              </TabsContent>

              {/* AI Pipeline Tab — 5-step prospecting pipeline */}
              <TabsContent value="pipeline" className="space-y-4">
                <ProspectPipelineTab lead={lead} />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &quot;{lead.businessName}&quot; and all associated data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate()}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
