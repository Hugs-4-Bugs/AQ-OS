'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutTemplate as MessageTemplate,
  Plus,
  Search,
  Sparkles,
  RefreshCw,
  Pencil,
  Trash2,
  Copy,
  Eye,
  Send,
  Mail,
  MessageCircle,
  Loader2,
  Filter,
  X,
  Variable,
  RefreshCw as Sync,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

type TemplateChannel = 'email' | 'telegram' | 'whatsapp';
type TemplateCategory = 'marketing' | 'utility' | 'authentication';

interface Template {
  id: string;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  content: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
  whatsappTemplateId?: string;
  whatsappStatus?: 'pending' | 'approved' | 'rejected';
}

// ─── Constants ────────────────────────────────────────────────────

const CHANNEL_OPTIONS: { value: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'telegram', label: 'Telegram', icon: Send },
];

const CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'utility', label: 'Utility' },
  { value: 'authentication', label: 'Authentication' },
];

const CHANNEL_ICONS: Record<TemplateChannel, React.ElementType> = {
  whatsapp: MessageCircle,
  email: Mail,
  telegram: Send,
};

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  marketing: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  utility: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  authentication: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
};

// ─── Helpers ──────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
}

function previewContent(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
  }
  return result;
}

// ─── Skeleton ─────────────────────────────────────────────────────

function TemplatePageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Template Create/Edit Dialog ──────────────────────────────────

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: Template | null;
  onSaved: () => void;
}

function TemplateDialog({ open, onOpenChange, template, onSaved }: TemplateDialogProps) {
  const { toast } = useToast();
  const isEdit = !!template;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<TemplateChannel>('whatsapp');
  const [category, setCategory] = useState<TemplateCategory>('marketing');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

  // Reset on open
  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name);
        setChannel(template.channel);
        setCategory(template.category);
        setContent(template.content);
      } else {
        setName('');
        setChannel('whatsapp');
        setCategory('marketing');
        setContent('');
      }
      setPreviewVars({});
    }
  }, [open, template]);

  const variables = useMemo(() => extractVariables(content), [content]);

  // Update preview vars when variables change
  useEffect(() => {
    const newVars: Record<string, string> = {};
    for (const v of variables) {
      newVars[v] = previewVars[v] || '';
    }
    setPreviewVars(newVars);
  }, [variables]); // previewVars intentionally omitted to avoid loop

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      toast({ title: 'Missing fields', description: 'Name and content are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? `/api/templates/${template!.id}` : '/api/templates';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channel, category, content, variables }),
      });
      if (!res.ok) throw new Error('Save failed');

      toast({ title: isEdit ? 'Template Updated' : 'Template Created', description: `"${name}" has been ${isEdit ? 'updated' : 'created'}.` });
      onSaved();
      onOpenChange(false);
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save template. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Enter a template name first so AI can generate relevant content.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channel, category }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setContent(data.content || '');
      toast({ title: 'Template Generated', description: 'AI has generated a template. Review and edit as needed.' });
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate template. Please try again.', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="tpl-name" className="text-xs">Template Name *</Label>
        <Input
          id="tpl-name"
          placeholder="e.g. welcome_message"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 text-sm"
          disabled={saving}
        />
      </div>

      {/* Channel + Category row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Channel *</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-1.5">
                    <opt.icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category *</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="tpl-content" className="text-xs">Content *</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700"
            onClick={handleAiGenerate}
            disabled={generating || !name.trim()}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            AI Generate
          </Button>
        </div>
        <Textarea
          id="tpl-content"
          placeholder="Write your template content here. Use {{variable_name}} for dynamic fields."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[120px] text-sm resize-y"
          disabled={saving}
        />
        <p className="text-[10px] text-muted-foreground">
          Use {'{{variable}}'} syntax for dynamic fields. E.g. Hello {'{{name}}'}, your order {'{{order_id}}'} is ready.
        </p>
      </div>

      {/* Variables */}
      {variables.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Variable className="h-3.5 w-3.5 text-teal-600" />
            <Label className="text-xs">Variables ({variables.length})</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {variables.map((v) => (
              <div key={v} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{v}</Label>
                <Input
                  placeholder={`Value for ${v}`}
                  value={previewVars[v] || ''}
                  onChange={(e) => setPreviewVars((prev) => ({ ...prev, [v]: e.target.value }))}
                  className="h-8 text-xs"
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {content && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-emerald-600" />
            <Label className="text-xs">Preview</Label>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap break-words">
            {previewContent(content, previewVars)}
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-auto">
          <SheetHeader>
            <SheetTitle>{isEdit ? 'Edit Template' : 'Create Template'}</SheetTitle>
            <SheetDescription>{isEdit ? 'Update your message template' : 'Create a new message template'}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{formContent}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving || !name.trim() || !content.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageTemplate className="h-5 w-5 text-emerald-600" />
            {isEdit ? 'Edit Template' : 'Create Template'}
          </DialogTitle>
          <DialogDescription>{isEdit ? 'Update your message template' : 'Create a new message template'}</DialogDescription>
        </DialogHeader>
        {formContent}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving || !name.trim() || !content.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function WhatsappTemplatePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<TemplateChannel | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/templates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? data ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [channelFilter, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Delete template
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Template Deleted', description: 'Template has been removed.' });
      fetchTemplates();
    } catch {
      toast({ title: 'Delete Failed', description: 'Could not delete template.', variant: 'destructive' });
    }
  };

  // Copy template content
  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: 'Copied', description: 'Template content copied to clipboard.' });
    } catch {
      toast({ title: 'Copy Failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  // Sync WhatsApp templates
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      toast({ title: 'Templates Synced', description: 'WhatsApp templates synced from Meta.' });
      fetchTemplates();
    } catch {
      toast({ title: 'Sync Failed', description: 'Could not sync templates from Meta.', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (channelFilter !== 'all') {
      result = result.filter((t) => t.channel === channelFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, channelFilter, search]);

  if (loading) return <TemplatePageSkeleton />;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Message Templates</h2>
          <p className="text-sm text-muted-foreground">Create and manage templates for WhatsApp, Email, and Telegram</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 text-xs"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sync className="h-3.5 w-3.5" />}
            Sync WhatsApp
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setEditingTemplate(null);
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as TemplateChannel | 'all')}>
            <SelectTrigger className="h-9 w-[130px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active filter chips */}
      {(channelFilter !== 'all' || search.trim()) && (
        <div className="flex items-center gap-2 flex-wrap">
          {channelFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {CHANNEL_OPTIONS.find((o) => o.value === channelFilter)?.label}
              <button onClick={() => setChannelFilter('all')} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {search.trim() && (
            <Badge variant="secondary" className="gap-1 text-xs">
              &quot;{search}&quot;
              <button onClick={() => setSearch('')} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Templates list */}
      {filteredTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <MessageTemplate className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No templates found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first template to get started with messaging
            </p>
            <Button
              size="sm"
              className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setEditingTemplate(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-300px)]">
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {filteredTemplates.map((tpl) => {
                const ChannelIcon = CHANNEL_ICONS[tpl.channel];
                return (
                  <motion.div
                    key={tpl.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* Name + badges row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-medium truncate">{tpl.name}</h4>
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 shrink-0">
                                <ChannelIcon className="h-3 w-3" />
                                {tpl.channel}
                              </Badge>
                              <Badge variant="outline" className={cn('text-[10px] h-5 shrink-0', CATEGORY_COLORS[tpl.category])}>
                                {tpl.category}
                              </Badge>
                              {tpl.channel === 'whatsapp' && tpl.whatsappStatus && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] h-5 shrink-0',
                                    tpl.whatsappStatus === 'approved' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                                    tpl.whatsappStatus === 'pending' && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                                    tpl.whatsappStatus === 'rejected' && 'bg-red-500/10 text-red-600 border-red-500/20'
                                  )}
                                >
                                  {tpl.whatsappStatus}
                                </Badge>
                              )}
                            </div>
                            {/* Content preview */}
                            <p className="text-xs text-muted-foreground line-clamp-2">{tpl.content}</p>
                            {/* Variables */}
                            {tpl.variables.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {tpl.variables.map((v) => (
                                  <Badge key={v} variant="secondary" className="text-[10px] h-4 gap-0.5">
                                    <Variable className="h-2.5 w-2.5" />
                                    {v}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                              Updated {new Date(tpl.updatedAt).toLocaleDateString()}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopy(tpl.content)}
                              title="Copy content"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingTemplate(tpl);
                                setShowCreateDialog(true);
                              }}
                              title="Edit template"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete template">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete &quot;{tpl.name}&quot;. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(tpl.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        </ScrollArea>
      )}

      {/* Template Create/Edit Dialog */}
      <TemplateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        template={editingTemplate}
        onSaved={fetchTemplates}
      />
    </div>
  );
}
