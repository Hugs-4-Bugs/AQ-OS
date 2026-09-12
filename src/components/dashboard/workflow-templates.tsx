'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, LayoutTemplate, Zap, Eye, Download, Upload, Loader2, AlertCircle, Sparkles,
  Copy, Pencil, MoreVertical, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ─── Local types (mirrors workflow domain models) ───────────────

type WorkflowTriggerType =
  | 'lead_discovered'
  | 'lead_stage_change'
  | 'lead_reply'
  | 'score_change'
  | 'email_received'
  | 'payment_success'
  | 'payment_failed'
  | 'ai_completed'
  | 'webhook_trigger'
  | 'scheduled'
  | 'manual'
  | 'credit_low';

interface WorkflowTemplate {
  id?: string;
  name: string;
  description?: string;
  triggerType: WorkflowTriggerType;
  nodes?: unknown[];
  edges?: unknown[];
  templateCategory?: string;
  [key: string]: unknown;
}

const CATEGORIES = ['all', 'nurture', 'follow_up', 'alert', 'reminder', 'onboarding', 'enrichment', 'outreach'];

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  lead_discovered: 'Lead Discovered',
  lead_stage_change: 'Stage Change',
  lead_reply: 'Lead Reply',
  score_change: 'Score Change',
  email_received: 'Email Received',
  payment_success: 'Payment Success',
  payment_failed: 'Payment Failed',
  ai_completed: 'AI Completed',
  webhook_trigger: 'Webhook',
  scheduled: 'Scheduled',
  manual: 'Manual',
  credit_low: 'Credit Low',
};

const CATEGORY_COLORS: Record<string, string> = {
  nurture: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  follow_up: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  alert: 'bg-red-500/10 text-red-600 dark:text-red-400',
  reminder: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  onboarding: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  enrichment: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  outreach: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
};

function parseTemplate(raw: Record<string, unknown>): WorkflowTemplate {
  return {
    ...raw,
    nodes: typeof raw.nodes === 'string' ? JSON.parse(raw.nodes as string) : (raw.nodes as WorkflowTemplate['nodes'] || []),
    edges: typeof raw.edges === 'string' ? JSON.parse(raw.edges as string) : (raw.edges as WorkflowTemplate['edges'] || []),
    triggerType: (raw.triggerType as WorkflowTriggerType) || 'manual',
  } as WorkflowTemplate;
}

interface WorkflowTemplatesProps {
  onUseTemplate: (workflow: WorkflowTemplate & { id?: string }) => void;
  onEditTemplate?: (workflow: WorkflowTemplate & { id?: string }) => void;
}

export default function WorkflowTemplates({ onUseTemplate, onEditTemplate }: WorkflowTemplatesProps) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const [cloningTemplate, setCloningTemplate] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);

      const res = await fetch(`/api/workflows/templates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      const items = (data.templates || data.data || []).map(parseTemplate);
      setTemplates(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates();
    return () => { cancelled = true; };
  }, [fetchTemplates]);

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    setUsingTemplate(template.id);
    try {
      const res = await fetch('/api/workflows/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create from template');
      }
      const data = await res.json();
      const workflow = parseTemplate(data.workflow || data.data || data || {});
      onUseTemplate({ ...workflow, id: data.id || workflow.id });
      setSuccess(`Created workflow from "${template.name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to use template');
    } finally {
      setUsingTemplate(null);
    }
  };

  const handleCloneTemplate = async (template: WorkflowTemplate) => {
    setCloningTemplate(template.id);
    try {
      const res = await fetch('/api/workflows/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          clone: true,
          name: `${template.name} (Copy)`,
          description: template.description,
          templateCategory: template.templateCategory,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to clone template');
      }
      setSuccess(`Cloned template "${template.name}"`);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone template');
    } finally {
      setCloningTemplate(null);
    }
  };

  const handleEditTemplate = (template: WorkflowTemplate) => {
    if (onEditTemplate) {
      onEditTemplate(template);
    }
  };

  const handleExport = () => {
    const exportData = templates.map((t) => ({
      name: t.name,
      description: t.description,
      templateCategory: t.templateCategory,
      triggerType: t.triggerType,
      nodes: t.nodes,
      edges: t.edges,
    }));
    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-templates.json';
    a.click();
    URL.revokeObjectURL(url);
    setSuccess(`Exported ${templates.length} templates`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const items = Array.isArray(imported) ? imported : [imported];

      // Validate structure
      const validItems: Array<Record<string, unknown>> = [];
      const errors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.name || typeof item.name !== 'string') {
          errors.push(`Item ${i + 1}: Missing or invalid "name" field`);
          continue;
        }
        if (!item.triggerType || typeof item.triggerType !== 'string') {
          errors.push(`Item ${i + 1}: Missing or invalid "triggerType" field`);
          continue;
        }
        if (!Array.isArray(item.nodes)) {
          errors.push(`Item ${i + 1}: "nodes" must be an array`);
          continue;
        }
        if (!Array.isArray(item.edges)) {
          errors.push(`Item ${i + 1}: "edges" must be an array`);
          continue;
        }
        validItems.push(item as Record<string, unknown>);
      }

      if (errors.length > 0) {
        setError(`Validation errors: ${errors.join('; ')}`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let importedCount = 0;
      let failedCount = 0;

      for (const item of validItems) {
        try {
          const res = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...item, isTemplate: true }),
          });
          if (res.ok) {
            importedCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }

      if (importedCount > 0) {
        setSuccess(`Imported ${importedCount} template(s)${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
      } else {
        setError('Failed to import any templates');
      }
      await fetchTemplates();
    } catch {
      setError('Failed to import templates. Invalid JSON file.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Success Toast */}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{success}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSuccess(null)}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={templates.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between text-xs">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && templates.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 px-6 border-dashed">
          <LayoutTemplate className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-lg font-semibold mb-1">No templates found</h3>
          <p className="text-sm text-muted-foreground">Templates will appear here when workflows are saved as templates.</p>
        </Card>
      )}

      {/* Template Grid */}
      {!loading && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const categoryColor = CATEGORY_COLORS[template.templateCategory || ''] || 'bg-slate-500/10 text-slate-600';
            return (
              <Card key={template.id} className="p-4 hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-sm truncate">{template.name}</h4>
                    {template.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Preview */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewTemplate(template)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>{template.name}</DialogTitle>
                          <DialogDescription>{template.description || 'No description'}</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-80">
                          <div className="space-y-3 pr-4">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                {TRIGGER_LABELS[template.triggerType] || template.triggerType}
                              </Badge>
                              {template.templateCategory && (
                                <Badge variant="outline" className={cn('text-xs', categoryColor)}>
                                  {template.templateCategory}
                                </Badge>
                              )}
                            </div>
                            <Separator />
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground mb-2">STEPS ({template.nodes?.length || 0})</h5>
                              {template.nodes?.length > 0 ? (
                                <div className="space-y-1.5">
                                  {template.nodes.map((node, i) => (
                                    <div key={node.id || i} className="flex items-center gap-2 text-xs">
                                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <span className="text-[9px] font-bold">{i + 1}</span>
                                      </div>
                                      <span className="font-medium">{node.title}</span>
                                      <Badge variant="secondary" className="text-[9px] h-4 px-1">{node.type}</Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No steps defined</p>
                              )}
                            </div>
                          </div>
                        </ScrollArea>
                        <div className="flex justify-end mt-4">
                          <Button onClick={() => handleUseTemplate(template)} disabled={usingTemplate === template.id} className="gap-2">
                            {usingTemplate === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Use Template
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* More Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleCloneTemplate(template)} disabled={cloningTemplate === template.id}>
                          {cloningTemplate === template.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                          Clone Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit Template
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    <Zap className="h-2.5 w-2.5 mr-1" />
                    {TRIGGER_LABELS[template.triggerType] || template.triggerType}
                  </Badge>
                  {template.templateCategory && (
                    <Badge variant="outline" className={cn('text-[10px]', categoryColor)}>
                      {template.templateCategory.replace('_', ' ')}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {template.nodes?.length || 0} steps
                  </Badge>
                </div>

                <div className="mt-auto flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => handleUseTemplate(template)}
                    disabled={usingTemplate === template.id}
                  >
                    {usingTemplate === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Use
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleCloneTemplate(template)}
                    disabled={cloningTemplate === template.id}
                    title="Clone as new template"
                  >
                    {cloningTemplate === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleEditTemplate(template)}
                    title="Edit in builder"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
