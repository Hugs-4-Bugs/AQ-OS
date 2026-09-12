'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  BarChart3,
  Plus,
  FileText,
  Radio,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  X,
  Search,
  Filter,
  RefreshCw,
  Zap,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  Phone,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

interface MessageTemplate {
  id: string;
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  content: string;
  language?: string;
  variables?: string[];
  channel?: string;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'disabled';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface Broadcast {
  id: string;
  name: string;
  channel: 'whatsapp' | 'telegram' | 'email';
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  messageContent: string;
  templateId?: string;
  scheduledAt?: string;
  audienceFilter: string;
  totalRecipients?: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  failedCount?: number;
  createdAt: string;
}

interface AnalyticsSummary {
  deliveryRates: { channel: string; totalSent: number; totalDelivered: number; deliveryRate: number }[];
  readRates: { channel: string; totalDelivered: number; totalRead: number; readRate: number }[];
  responseMetrics: { channel: string; totalMessages: number; totalResponses: number; responseRate: number; avgResponseTimeMs: number }[];
  channelComparison: { channel: string; deliveryRate: number; readRate: number; responseRate: number; effectivenessScore: number; volume: number }[];
  conversationMetrics: { totalConversations: number; avgLength: number; resolutionRate: number; activeConversations: number };
}

type SubTab = 'templates' | 'broadcasts' | 'analytics';

// ─── Status Badge Helpers ────────────────────────────────────────

function TemplateStatusBadge({ status }: { status: MessageTemplate['status'] }) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
    approved: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
    rejected: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
    active: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Zap },
    disabled: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: AlertCircle },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', c.color)}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function BroadcastStatusBadge({ status }: { status: Broadcast['status'] }) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    draft: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: FileText },
    scheduled: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
    running: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: Play },
    paused: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Pause },
    completed: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
    cancelled: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  };
  const c = config[status] || config.draft;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', c.color)}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  switch (channel) {
    case 'whatsapp': return <Phone className={className} />;
    case 'telegram': return <Send className={className} />;
    case 'email': return <Mail className={className} />;
    default: return <MessageSquare className={className} />;
  }
}

function formatResponseTime(ms: number): string {
  if (!ms) return 'N/A';
  const minutes = ms / 60000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// ─── Templates Section ────────────────────────────────────────────

function TemplatesSection() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'marketing' | 'utility' | 'authentication'>('marketing');
  const [newContent, setNewContent] = useState('');
  const [newChannel, setNewChannel] = useState<string>('whatsapp');
  const [newVariables, setNewVariables] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterCategory !== 'all') params.set('category', filterCategory);

      const res = await fetch(`/api/messaging/templates?${params}`);
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      toast.error('Error', { description: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterCategory]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates();
    return () => { cancelled = true; };
  }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newName || !newContent) {
      toast.error('Validation Error', { description: 'Name and content are required' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/messaging/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          content: newContent,
          channel: newChannel,
          variables: newVariables ? newVariables.split(',').map(v => v.trim()).filter(Boolean) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Template Created', { description: `"${newName}" is pending approval` });
        setCreateOpen(false);
        setNewName(''); setNewContent(''); setNewVariables('');
        fetchTemplates();
      } else {
        toast.error('Error', { description: data.error || 'Failed to create template' });
      }
    } catch {
      toast.error('Error', { description: 'Failed to create template' });
    } finally {
      setCreating(false);
    }
  };

  const handleTemplateAction = async (templateId: string, action: string) => {
    try {
      const res = await fetch(`/api/messaging/templates/${templateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Action Completed', { description: `Template ${action} successful` });
        fetchTemplates();
      } else {
        toast.error('Error', { description: data.error });
      }
    } catch {
      toast.error('Error', { description: 'Failed to process action' });
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/messaging/templates/${templateId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Deleted', { description: 'Template deleted' });
        fetchTemplates();
      } else {
        toast.error('Error', { description: data.error });
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete template' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Message Templates</h3>
          <p className="text-sm text-muted-foreground">Create and manage reusable message templates with approval workflow</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" /> New Template</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Message Template</DialogTitle>
              <DialogDescription>Templates need approval before they can be used in broadcasts</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Welcome Message" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={newCategory} onValueChange={v => setNewCategory(v as typeof newCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={newChannel} onValueChange={setNewChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content * <span className="text-muted-foreground text-xs">(use {'{{variable}}'} for dynamic fields)</span></Label>
                <Textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="Hi {{name}}, welcome to our service! We have an exclusive offer for you."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Variables <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                <Input value={newVariables} onChange={e => setNewVariables(e.target.value)} placeholder="name, company, offer" />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[140px]"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="utility">Utility</SelectItem>
            <SelectItem value="authentication">Authentication</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={fetchTemplates}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Template List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No templates found. Create your first message template.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => (
            <Card key={tpl.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm truncate">{tpl.name}</h4>
                      <TemplateStatusBadge status={tpl.status} />
                      <Badge variant="secondary" className="text-[10px]">{tpl.category}</Badge>
                      {tpl.channel && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <ChannelIcon channel={tpl.channel} className="h-2.5 w-2.5" />
                          {tpl.channel}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{tpl.content}</p>
                    {tpl.variables && tpl.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tpl.variables.map(v => (
                          <Badge key={v} variant="outline" className="text-[10px] font-mono">{'{{' + v + '}}'}</Badge>
                        ))}
                      </div>
                    )}
                    {tpl.rejectionReason && (
                      <p className="text-xs text-red-500 mt-1">Rejection reason: {tpl.rejectionReason}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {tpl.status === 'pending' && (
                        <DropdownMenuItem onClick={() => handleTemplateAction(tpl.id, 'submit')}>
                          <Send className="h-4 w-4 mr-2" /> Submit for Approval
                        </DropdownMenuItem>
                      )}
                      {tpl.status === 'approved' && (
                        <DropdownMenuItem onClick={() => handleTemplateAction(tpl.id, 'approve')}>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Activate
                        </DropdownMenuItem>
                      )}
                      {tpl.status === 'rejected' && (
                        <DropdownMenuItem onClick={() => handleTemplateAction(tpl.id, 'resubmit')}>
                          <RefreshCw className="h-4 w-4 mr-2" /> Resubmit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(tpl.id)}>
                        <X className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Broadcasts Section ───────────────────────────────────────────

function BroadcastsSection() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newChannel, setNewChannel] = useState<'whatsapp' | 'telegram' | 'email'>('whatsapp');
  const [newAudience, setNewAudience] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const res = await fetch(`/api/messaging/broadcasts?${params}`);
      const data = await res.json();
      if (data.success) {
        setBroadcasts(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      toast.error('Error', { description: 'Failed to load broadcasts' });
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => {
    let cancelled = false;
    fetchBroadcasts();
    return () => { cancelled = true; };
  }, [fetchBroadcasts]);

  const handleCreate = async () => {
    if (!newName || !newChannel || !newAudience || !newMessage) {
      toast.error('Validation Error', { description: 'All required fields must be filled' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/messaging/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          channel: newChannel,
          audienceFilter: newAudience,
          messageContent: newMessage,
          scheduledAt: newScheduledAt || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Broadcast Created', { description: `"${newName}" is ready as a draft` });
        setCreateOpen(false);
        setNewName(''); setNewAudience(''); setNewMessage(''); setNewScheduledAt('');
        fetchBroadcasts();
      } else {
        toast.error('Error', { description: data.error || 'Failed to create broadcast' });
      }
    } catch {
      toast.error('Error', { description: 'Failed to create broadcast' });
    } finally {
      setCreating(false);
    }
  };

  const handleBroadcastAction = async (broadcastId: string, action: 'start' | 'pause' | 'cancel') => {
    try {
      const res = await fetch(`/api/messaging/broadcasts/${broadcastId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Action Completed', { description: `Broadcast ${action} successful` });
        fetchBroadcasts();
      } else {
        toast.error('Error', { description: data.error });
      }
    } catch {
      toast.error('Error', { description: 'Failed to process action' });
    }
  };

  const getDeliveryProgress = (b: Broadcast) => {
    if (!b.totalRecipients || b.totalRecipients === 0) return 0;
    return Math.round(((b.deliveredCount || 0) / b.totalRecipients) * 100);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Broadcasts</h3>
          <p className="text-sm text-muted-foreground">Send bulk messages across WhatsApp, Telegram, and Email channels</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" /> New Broadcast</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Broadcast</DialogTitle>
              <DialogDescription>Send bulk messages to filtered audiences across channels</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Broadcast Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., March Promotion Campaign" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Channel *</Label>
                  <Select value={newChannel} onValueChange={v => setNewChannel(v as typeof newChannel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Schedule (optional)</Label>
                  <Input type="datetime-local" value={newScheduledAt} onChange={e => setNewScheduledAt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Audience Filter *</Label>
                <Input value={newAudience} onChange={e => setNewAudience(e.target.value)} placeholder="e.g., niche:restaurant, country:India" />
                <p className="text-[10px] text-muted-foreground">Comma-separated key:value pairs to filter leads</p>
              </div>
              <div className="space-y-2">
                <Label>Message Content *</Label>
                <Textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Write your broadcast message here..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Broadcast
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[140px]"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={fetchBroadcasts}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Broadcast List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : broadcasts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No broadcasts found. Create your first broadcast campaign.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {broadcasts.map(b => (
            <Card key={b.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-sm truncate">{b.name}</h4>
                        <BroadcastStatusBadge status={b.status} />
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <ChannelIcon channel={b.channel} className="h-2.5 w-2.5" />
                          {b.channel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{b.messageContent}</p>
                      {b.scheduledAt && (
                        <p className="text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Scheduled: {new Date(b.scheduledAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {b.status === 'draft' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleBroadcastAction(b.id, 'start')}>
                          <Play className="h-3 w-3" /> Start
                        </Button>
                      )}
                      {b.status === 'running' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleBroadcastAction(b.id, 'pause')}>
                          <Pause className="h-3 w-3" /> Pause
                        </Button>
                      )}
                      {b.status === 'paused' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleBroadcastAction(b.id, 'start')}>
                          <Play className="h-3 w-3" /> Resume
                        </Button>
                      )}
                      {(b.status === 'draft' || b.status === 'running' || b.status === 'paused' || b.status === 'scheduled') && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 gap-1" onClick={() => handleBroadcastAction(b.id, 'cancel')}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Delivery Stats */}
                  {b.totalRecipients && b.totalRecipients > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Delivered: {b.deliveredCount || 0}/{b.totalRecipients}
                        </span>
                        <span className="font-medium">{getDeliveryProgress(b)}%</span>
                      </div>
                      <Progress value={getDeliveryProgress(b)} className="h-1.5" />
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        {b.readCount !== undefined && <span><Eye className="h-2.5 w-2.5 inline mr-0.5" />Read: {b.readCount}</span>}
                        {b.repliedCount !== undefined && <span><MessageSquare className="h-2.5 w-2.5 inline mr-0.5" />Replied: {b.repliedCount}</span>}
                        {b.failedCount !== undefined && b.failedCount > 0 && <span className="text-red-500"><XCircle className="h-2.5 w-2.5 inline mr-0.5" />Failed: {b.failedCount}</span>}
                      </div>
                      {/* Message status indicators */}
                      {b.deliveredCount !== undefined && b.totalRecipients !== undefined && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <span className="flex items-center gap-0.5"><Check className="h-2.5 w-2.5 text-emerald-500" />Delivered</span>
                          {b.readCount !== undefined && b.readCount > 0 && (
                            <span className="flex items-center gap-0.5"><CheckCheck className="h-2.5 w-2.5 text-sky-500" />Read</span>
                          )}
                          {b.repliedCount !== undefined && b.repliedCount > 0 && (
                            <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5 text-amber-500" />Replied</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Section ────────────────────────────────────────────

function AnalyticsSection() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messaging/analytics?metric=summary');
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.data);
      }
    } catch {
      toast.error('Error', { description: 'Failed to load analytics' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAnalytics();
    return () => { cancelled = true; };
  }, [fetchAnalytics]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No analytics data available yet. Start sending messages to see metrics.</p>
        </CardContent>
      </Card>
    );
  }

  const { deliveryRates, readRates, responseMetrics, channelComparison, conversationMetrics } = analytics;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Sent</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {deliveryRates.reduce((sum, d) => sum + d.totalSent, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Delivery Rate</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {deliveryRates.length > 0
                ? `${Math.round(deliveryRates.reduce((sum, d) => sum + d.deliveryRate, 0) / deliveryRates.length * 100)}%`
                : '0%'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Read Rate</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {readRates.length > 0
                ? `${Math.round(readRates.reduce((sum, r) => sum + r.readRate, 0) / readRates.length * 100)}%`
                : '0%'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Response Rate</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {responseMetrics.length > 0
                ? `${Math.round(responseMetrics.reduce((sum, r) => sum + r.responseRate, 0) / responseMetrics.length * 100)}%`
                : '0%'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Channel Effectiveness</CardTitle>
          <CardDescription>Compare messaging performance across channels</CardDescription>
        </CardHeader>
        <CardContent>
          {channelComparison.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No channel data yet</p>
          ) : (
            <div className="space-y-4">
              {channelComparison.map(ch => (
                <div key={ch.channel} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <ChannelIcon channel={ch.channel} className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium capitalize truncate">{ch.channel}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{ch.volume} sent</Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-bold">{ch.effectivenessScore}</span>
                      <span className="text-[10px] text-muted-foreground">/ 100</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">Delivery</span>
                        <span>{Math.round(ch.deliveryRate * 100)}%</span>
                      </div>
                      <Progress value={ch.deliveryRate * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">Read</span>
                        <span>{Math.round(ch.readRate * 100)}%</span>
                      </div>
                      <Progress value={ch.readRate * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">Response</span>
                        <span>{Math.round(ch.responseRate * 100)}%</span>
                      </div>
                      <Progress value={ch.responseRate * 100} className="h-1.5" />
                    </div>
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Response Time & Conversations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Response Times</CardTitle>
            <CardDescription>Average time to first response by channel</CardDescription>
          </CardHeader>
          <CardContent>
            {responseMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No response data yet</p>
            ) : (
              <div className="space-y-3">
                {responseMetrics.map(rm => (
                  <div key={rm.channel} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={rm.channel} className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm capitalize">{rm.channel}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatResponseTime(rm.avgResponseTimeMs)}</p>
                      <p className="text-[10px] text-muted-foreground">avg response</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversations</CardTitle>
            <CardDescription>Active conversations and resolution metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xl sm:text-2xl font-bold">{conversationMetrics.totalConversations}</p>
                <p className="text-[10px] text-muted-foreground">Total Conversations</p>
              </div>
              <div className="space-y-1">
                <p className="text-xl sm:text-2xl font-bold text-green-500">{conversationMetrics.activeConversations}</p>
                <p className="text-[10px] text-muted-foreground">Active Now</p>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{conversationMetrics.avgLength.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">Avg Messages/Conv</p>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{Math.round(conversationMetrics.resolutionRate * 100)}%</p>
                <p className="text-[10px] text-muted-foreground">Resolution Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refresh */}
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={fetchAnalytics}>
          <RefreshCw className="h-3 w-3" /> Refresh Analytics
        </Button>
      </div>
    </div>
  );
}

// ─── Main Messaging Tab ───────────────────────────────────────────

export default function MessagingTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('templates');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Messaging Hub</h2>
            <p className="text-xs text-muted-foreground">Templates, broadcasts, and analytics</p>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="px-4 sm:px-6 pt-3 shrink-0">
        <Tabs value={activeSubTab} onValueChange={v => setActiveSubTab(v as SubTab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="templates" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-initial">
              <FileText className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="broadcasts" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-initial">
              <Radio className="h-3.5 w-3.5" /> Broadcasts
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-initial">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4">
        {activeSubTab === 'templates' && <TemplatesSection />}
        {activeSubTab === 'broadcasts' && <BroadcastsSection />}
        {activeSubTab === 'analytics' && <AnalyticsSection />}
      </div>
    </div>
  );
}
