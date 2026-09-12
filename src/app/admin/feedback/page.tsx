'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Search,
  Inbox,
  Clock,
  MessageSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  Shield,
  Bug,
  Activity,
  BarChart3,
  Zap,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────

interface AdminFeedbackItem {
  id: string;
  ticketNumber: string;
  type: string;
  title: string;
  severity: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  aiSeverity: string | null;
  aiModule: string | null;
  aiDuplicateScore: number | null;
  tags: unknown;
  labels: unknown;
  pageUrl: string | null;
  browserName: string | null;
  osName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  user: { id: string; email: string; name: string | null; avatar: string | null };
  commentCount: number;
  attachmentCount: number;
}

interface AdminFeedbackDetail extends AdminFeedbackItem {
  description: string;
  reproSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  previousPageUrl: string | null;
  browserVersion: string | null;
  osVersion: string | null;
  screenResolution: string | null;
  timezone: string | null;
  locale: string | null;
  networkType: string | null;
  userAgent: string | null;
  stackTrace: string | null;
  resolutionNotes: string | null;
  duplicateOf: string | null;
  attachments: unknown;
  aiClassification: unknown;
  comments: AdminComment[];
  statusHistory: AdminStatusLog[];
}

interface AdminComment {
  id: string;
  authorId: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface AdminStatusLog {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  note: string | null;
  createdAt: string;
}

interface Analytics {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byBrowser: Record<string, number>;
  byOS: Record<string, number>;
  avgResolutionHours: number;
  resolvedCount: number;
  topPages: Array<{ page: string; count: number }>;
  feedbackVolume: Array<{ date: string; count: number }>;
  crashVolume: Array<{ date: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  totalFeedback: number;
  totalCrashes: number;
}

interface CrashGroup {
  errorMessage: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sampleStack: string | null;
  componentName: string | null;
  pageUrl: string | null;
  affectedUsersCount: number;
  resolved: boolean;
  sampleIds: string[];
}

// ─── Constants ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug', crash: 'Crash', feature: 'Feature', ui_ux: 'UI/UX',
  performance: 'Performance', wrong_data: 'Wrong Data', sync: 'Sync',
  account: 'Account', payment: 'Payment', other: 'Other',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  acknowledged: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  investigating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  in_progress: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  need_more_info: 'bg-red-500/15 text-red-400 border-red-500/30',
  fixed: 'bg-green-500/15 text-green-400 border-green-500/30',
  released: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  closed: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  rejected: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  duplicate: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const STATUS_OPTIONS = ['new', 'acknowledged', 'investigating', 'in_progress', 'need_more_info', 'fixed', 'released', 'closed', 'rejected', 'duplicate'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

const CHART_COLORS = ['#0d9488', '#3b82f6', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f59e0b'];

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ─── Page ──────────────────────────────────────────────────────────

export default function AdminFeedbackDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState('inbox');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-500" />
              Feedback Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Triage, analyze, and resolve user feedback and crash reports
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md mb-6">
            <TabsTrigger value="inbox" className="flex items-center gap-1.5">
              <Inbox className="h-4 w-4" />
              Inbox
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="crashes" className="flex items-center gap-1.5">
              <Zap className="h-4 w-4" />
              Crashes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox">
            <InboxTab />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="crashes">
            <CrashesTab />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-muted-foreground">
          © 2026 AcquisitionOS — Admin Feedback Intelligence
        </div>
      </footer>
    </div>
  );
}

// ─── Inbox Tab ─────────────────────────────────────────────────────

function InboxTab() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{ status: string; type: string; severity: string; priority: string }>({
    status: '', type: '', severity: '', priority: '',
  });
  const [sortBy, setSortBy] = useState('newest');
  const [selected, setSelected] = useState<AdminFeedbackDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      params.set('sortBy', sortBy);
      if (search) params.set('search', search);
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.priority) params.set('priority', filters.priority);

      const res = await fetch(`/api/admin/feedback?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setItems(data.feedback || []);
      setPagination(data.pagination || pagination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, search, filters]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, sortBy, filters]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (pagination.page !== 1) {
        setPagination((p) => ({ ...p, page: 1 }));
      } else {
        load();
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setSheetOpen(true);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSelected(data.feedback);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
      setSheetOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics row */}
      <MetricsRow items={items} pagination={pagination} />

      {/* Filters bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, description, ticket..."
                className="pl-8"
              />
            </div>
            <Select value={filters.status || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.type || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, type: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.keys(TYPE_LABELS).map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.severity || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {['low', 'medium', 'high', 'critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="severity">Severity</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="most_commented">Most commented</SelectItem>
              </SelectContent>
            </Select>
            {(filters.status || filters.type || filters.severity || filters.priority || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilters({ status: '', type: '', severity: '', priority: '' }); setSearch(''); }}
              >
                <Filter className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No feedback found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Ticket</TableHead>
                    <TableHead className="w-[90px]">Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[100px]">User</TableHead>
                    <TableHead className="w-[90px]">Severity</TableHead>
                    <TableHead className="w-[90px]">Priority</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[120px]">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((f) => (
                    <TableRow
                      key={f.id}
                      onClick={() => openDetail(f.id)}
                      className="cursor-pointer hover:bg-teal-500/5"
                    >
                      <TableCell className="font-mono text-xs text-teal-400">{f.ticketNumber}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[f.type] || f.type}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate font-medium">{f.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{f.user?.email || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={SEVERITY_STYLES[f.severity] || 'border-border'}>{f.severity}</Badge></TableCell>
                      <TableCell><span className="text-xs">{f.priority}</span></TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_STYLES[f.status] || 'border-border'}>{f.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(f.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between p-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {pagination.total} total • Page {pagination.page} of {Math.max(1, pagination.totalPages)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-card/95">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              {selected && <span className="font-mono text-teal-400">{selected.ticketNumber}</span>}
              {selected && <Badge variant="outline" className={STATUS_STYLES[selected.status] || 'border-border'}>{selected.status.replace(/_/g, ' ')}</Badge>}
            </SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
          ) : selected ? (
            <DetailPanel detail={selected} onUpdate={() => { load(); }} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Metrics Row ───────────────────────────────────────────────────

function MetricsRow({ items, pagination }: { items: AdminFeedbackItem[]; pagination: { total: number } }) {
  const openCount = items.filter((i) => !['fixed', 'released', 'closed', 'rejected', 'duplicate'].includes(i.status)).length;
  const criticalCount = items.filter((i) => i.severity === 'critical').length;
  const thisWeek = items.filter((i) => Date.now() - new Date(i.createdAt).getTime() < 7 * 86400 * 1000).length;
  const stats = [
    { label: 'Total Feedback', value: pagination.total, icon: <Inbox className="h-4 w-4" />, color: 'text-blue-400' },
    { label: 'Open (in view)', value: openCount, icon: <Activity className="h-4 w-4" />, color: 'text-yellow-400' },
    { label: 'Critical (in view)', value: criticalCount, icon: <Zap className="h-4 w-4" />, color: 'text-red-400' },
    { label: 'This week (in view)', value: thisWeek, icon: <TrendingUp className="h-4 w-4" />, color: 'text-teal-400' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className={s.color}>{s.icon}</span>
            </div>
            <p className="text-2xl font-semibold mt-1">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────

function DetailPanel({ detail, onUpdate }: { detail: AdminFeedbackDetail; onUpdate: () => void }) {
  const [status, setStatus] = useState(detail.status);
  const [priority, setPriority] = useState(detail.priority);
  const [assignedTo, setAssignedTo] = useState(detail.assignedTo || '');
  const [resolutionNotes, setResolutionNotes] = useState(detail.resolutionNotes || '');
  const [tagsInput, setTagsInput] = useState(Array.isArray(detail.tags) ? (detail.tags as string[]).join(', ') : '');
  const [duplicateOf, setDuplicateOf] = useState(detail.duplicateOf || '');
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [comments, setComments] = useState<AdminComment[]>(detail.comments);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (status !== detail.status) body.status = status;
      if (priority !== detail.priority) body.priority = priority;
      if (assignedTo !== (detail.assignedTo || '')) body.assignedTo = assignedTo || null;
      if (resolutionNotes !== (detail.resolutionNotes || '')) body.resolutionNotes = resolutionNotes;
      if (tagsInput !== (Array.isArray(detail.tags) ? (detail.tags as string[]).join(', ') : '')) {
        body.tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      }
      if (duplicateOf !== (detail.duplicateOf || '')) body.duplicateOf = duplicateOf || null;

      const res = await fetch(`/api/admin/feedback/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save');
      }
      toast.success('Changes saved');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/admin/feedback/${detail.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim(), isInternal }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setComments(data.comments || []);
      setCommentText('');
      toast.success(isInternal ? 'Internal note added' : 'Reply sent to user');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const attachments = Array.isArray(detail.attachments) ? (detail.attachments as Array<{ url?: string; name?: string; type?: string }>) : [];
  const aiClass = detail.aiClassification as { affectedModule?: string; likelyCause?: string; duplicateProbability?: number; requiresImmediateAttention?: boolean } | null;

  return (
    <div className="space-y-4 mt-4">
      {/* Header info */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{TYPE_LABELS[detail.type] || detail.type}</Badge>
        <Badge variant="outline" className={SEVERITY_STYLES[detail.severity] || 'border-border'}>Severity: {detail.severity}</Badge>
        {detail.aiSeverity && <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">AI: {detail.aiSeverity}</Badge>}
      </div>

      <div>
        <h3 className="font-semibold text-lg">{detail.title}</h3>
        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{detail.description}</p>
      </div>

      {/* User info */}
      <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span><span className="text-muted-foreground">From:</span> {detail.user?.email || 'unknown'}</span>
          <span className="text-muted-foreground">{timeAgo(detail.createdAt)}</span>
        </div>
      </div>

      {/* AI classification */}
      {aiClass && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
          <p className="text-xs font-medium text-purple-400 mb-2 flex items-center gap-1"><Activity className="h-3 w-3" /> AI Triage</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Module:</span> {aiClass.affectedModule || '—'}</div>
            <div><span className="text-muted-foreground">Duplicate score:</span> {detail.aiDuplicateScore != null ? `${(detail.aiDuplicateScore * 100).toFixed(0)}%` : '—'}</div>
            {aiClass.likelyCause && <div className="col-span-2"><span className="text-muted-foreground">Likely cause:</span> {aiClass.likelyCause}</div>}
            {aiClass.requiresImmediateAttention && <div className="col-span-2 text-red-400 font-medium">Requires immediate attention</div>}
          </div>
        </div>
      )}

      {/* Repro / tech */}
      {(detail.reproSteps || detail.expectedBehavior || detail.actualBehavior) && (
        <div className="space-y-2">
          {detail.reproSteps && <div className="rounded-lg border border-border p-3"><p className="text-xs font-medium text-muted-foreground mb-1">Steps to reproduce</p><p className="text-sm whitespace-pre-wrap">{detail.reproSteps}</p></div>}
          <div className="grid grid-cols-2 gap-2">
            {detail.expectedBehavior && <div className="rounded-lg border border-border p-3"><p className="text-xs font-medium text-muted-foreground mb-1">Expected</p><p className="text-sm">{detail.expectedBehavior}</p></div>}
            {detail.actualBehavior && <div className="rounded-lg border border-border p-3"><p className="text-xs font-medium text-muted-foreground mb-1">Actual</p><p className="text-sm">{detail.actualBehavior}</p></div>}
          </div>
        </div>
      )}

      {/* Tech context */}
      <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-1 font-mono">
        {detail.pageUrl && <div><span className="text-muted-foreground">Page:</span> {detail.pageUrl}</div>}
        {detail.previousPageUrl && <div><span className="text-muted-foreground">Referrer:</span> {detail.previousPageUrl}</div>}
        {detail.browserName && <div><span className="text-muted-foreground">Browser:</span> {detail.browserName} {detail.browserVersion || ''}</div>}
        {detail.osName && <div><span className="text-muted-foreground">OS:</span> {detail.osName} {detail.osVersion || ''}</div>}
        {detail.screenResolution && <div><span className="text-muted-foreground">Screen:</span> {detail.screenResolution}</div>}
        {detail.timezone && <div><span className="text-muted-foreground">TZ:</span> {detail.timezone}</div>}
        {detail.networkType && <div><span className="text-muted-foreground">Net:</span> {detail.networkType}</div>}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({attachments.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-border overflow-hidden hover:border-teal-500/50">
                {a.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name || ''} className="w-full h-16 object-cover" />
                ) : (
                  <div className="w-full h-16 flex items-center justify-center bg-muted text-xs">Video</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Management controls */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Management</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Assigned to</Label>
          <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Developer name or team" />
        </div>
        <div>
          <Label className="text-xs">Tags (comma-separated)</Label>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ui, billing, urgent" />
        </div>
        <div>
          <Label className="text-xs">Duplicate of (ticket number)</Label>
          <Input value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} placeholder="FB-2026-XXXXXX" />
        </div>
        <div>
          <Label className="text-xs">Resolution notes</Label>
          <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="What was done to resolve..." className="min-h-[60px]" />
        </div>
        <Button onClick={save} disabled={saving} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Separator />

      {/* Status history */}
      {detail.statusHistory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Status history</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {detail.statusHistory.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{h.fromStatus}</span>
                <span>{'->'}</span>
                <Badge variant="outline" className={STATUS_STYLES[h.toStatus] || 'border-border'}>{h.toStatus.replace(/_/g, ' ')}</Badge>
                <span className="text-muted-foreground ml-auto">{timeAgo(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Comments */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Comments ({comments.length})</p>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
          {comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments</p> : comments.map((c) => (
            <div key={c.id} className={`rounded-lg p-2.5 text-sm ${c.isInternal ? 'bg-orange-500/5 border border-orange-500/20' : c.authorRole === 'admin' ? 'bg-teal-500/5 border border-teal-500/20' : 'bg-muted/50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px]">{c.authorRole}{c.isInternal ? ' / internal' : ''}</Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a reply or internal note..." className="min-h-[60px]" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Switch checked={isInternal} onCheckedChange={setIsInternal} />
              Internal note
            </label>
            <Button onClick={submitComment} disabled={!commentText.trim() || commentSubmitting} className="ml-auto bg-teal-600 hover:bg-teal-700 text-white" size="sm">
              {commentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              {isInternal ? 'Add Note' : 'Reply'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ─────────────────────────────────────────────────

function AnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/feedback/analytics');
        if (!res.ok) throw new Error('Failed');
        const d = await res.json();
        setData(d);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>;
  }
  if (!data) {
    return <div className="text-center py-20 text-muted-foreground">No analytics data</div>;
  }

  const typeData = Object.entries(data.byType).map(([name, value]) => ({ name: TYPE_LABELS[name] || name, value }));
  const severityData = Object.entries(data.bySeverity).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(data.byStatus).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  const volumeData = data.feedbackVolume.map((v) => ({ date: v.date.slice(5), count: v.count }));
  const crashData = data.crashVolume.map((v) => ({ date: v.date.slice(5), count: v.count }));

  return (
    <div className="space-y-4">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total feedback</p><p className="text-2xl font-semibold">{data.totalFeedback}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total crashes</p><p className="text-2xl font-semibold">{data.totalCrashes}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Avg resolution</p><p className="text-2xl font-semibold">{data.avgResolutionHours}h</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Resolved</p><p className="text-2xl font-semibold">{data.resolvedCount}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feedback volume */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal-500" /> Feedback volume (30 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                <Line type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Crash volume */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-red-500" /> Crash volume (30 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={crashData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Type distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Distribution by type</CardTitle></CardHeader>
          <CardContent>
            {typeData.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`} labelLine={false} fontSize={10}>
                    {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Severity distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Distribution by severity</CardTitle></CardHeader>
          <CardContent>
            {severityData.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" fontSize={10} />
                  <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                  <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                  <Bar dataKey="value" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Distribution by status</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#888" fontSize={10} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#888" fontSize={10} width={100} />
                  <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                  <Bar dataKey="value" fill="#0d9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top pages */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Top pages with issues</CardTitle></CardHeader>
          <CardContent>
            {data.topPages.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topPages} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#888" fontSize={10} allowDecimals={false} />
                  <YAxis type="category" dataKey="page" stroke="#888" fontSize={9} width={150} tickFormatter={(v) => String(v).slice(-25)} />
                  <RTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top tags + browser/OS breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top tags</CardTitle></CardHeader>
          <CardContent>
            {data.topTags.length === 0 ? <p className="text-sm text-muted-foreground">No tags yet</p> : (
              <div className="flex flex-wrap gap-1.5">
                {data.topTags.map((t) => (
                  <Badge key={t.tag} variant="secondary" className="text-xs">{t.tag} <span className="ml-1 text-muted-foreground">{t.count}</span></Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">By browser</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.byBrowser).length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : (
              <div className="space-y-1">
                {Object.entries(data.byBrowser).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs"><span>{k}</span><span className="text-muted-foreground">{v}</span></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">By OS</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.byOS).length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : (
              <div className="space-y-1">
                {Object.entries(data.byOS).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs"><span>{k}</span><span className="text-muted-foreground">{v}</span></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>;
}

// ─── Crashes Tab ───────────────────────────────────────────────────

function CrashesTab() {
  const [loading, setLoading] = useState(true);
  const [crashes, setCrashes] = useState<CrashGroup[]>([]);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'unresolved') params.set('resolved', 'false');
      if (filter === 'resolved') params.set('resolved', 'true');
      const res = await fetch(`/api/admin/feedback/crashes?${params}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCrashes(data.crashes || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleResolved = async (err: string, resolved: boolean) => {
    try {
      const res = await fetch('/api/admin/feedback/crashes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMessage: err, resolved }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(resolved ? 'Marked as resolved' : 'Reopened');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unresolved' | 'resolved')}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{crashes.length} unique errors</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
      ) : crashes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
            <p className="font-medium">No crash reports</p>
            <p className="text-sm text-muted-foreground">All clear!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {crashes.map((c, i) => (
            <Card key={i} className={c.resolved ? 'opacity-60' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={c.resolved ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                        {c.resolved ? 'Resolved' : 'Active'}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{c.count} occurrence{c.count !== 1 ? 's' : ''}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{c.affectedUsersCount} user{c.affectedUsersCount !== 1 ? 's' : ''}</Badge>
                      {c.componentName && <Badge variant="secondary" className="text-[10px]">{c.componentName}</Badge>}
                    </div>
                    <p className="text-sm font-mono break-all">{c.errorMessage}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>First: {timeAgo(c.firstSeen)}</span>
                      <span>Last: {timeAgo(c.lastSeen)}</span>
                      {c.pageUrl && <span className="truncate">Page: {c.pageUrl}</span>}
                    </div>
                    {c.sampleStack && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Stack trace</summary>
                        <pre className="mt-1 p-2 rounded bg-muted/50 text-[10px] font-mono overflow-x-auto max-h-32 overflow-y-auto">{c.sampleStack}</pre>
                      </details>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleResolved(c.errorMessage, !c.resolved)}
                  >
                    {c.resolved ? <><XCircle className="h-3.5 w-3.5 mr-1" />Reopen</> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Resolve</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
