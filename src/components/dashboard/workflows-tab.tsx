'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Play,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Copy,
  Eye,
  ArrowRight,
  MoreVertical,
  Loader2,
  Mail,
  MessageSquare,
  Bot,
  Tag,
  Bell,
  Globe,
  FileDown,
  Star,
  StickyNote,
  CreditCard,
  Calendar,
  Send,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

// ===== TYPES =====

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay' | 'ai_action';
  title: string;
  config: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface WorkflowStep {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  order: number;
  nextStepId?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: string;
  disabledBySubscription?: boolean;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  workflowSteps?: WorkflowStep[];
  version: number;
  _count?: { executions: number };
  executions?: Execution[];
  createdAt: string;
  updatedAt: string;
}

interface Execution {
  id: string;
  workflowId: string;
  workflowName?: string;
  triggerType?: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  deadLettered: boolean;
  deadLetterReason?: string;
}

interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  triggerData?: Record<string, unknown>;
  stepLogs: StepLog[];
}

interface StepLog {
  id: string;
  stepName: string;
  stepType: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  isPremium: boolean;
  isBuiltin: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  usageCount?: number;
}

// ===== CONSTANTS =====

const TRIGGER_TYPES = [
  { value: 'lead_discovered', label: 'Lead Discovered' },
  { value: 'lead_moved', label: 'Lead Moved' },
  { value: 'lead_reply', label: 'Lead Reply' },
  { value: 'gmail_connected', label: 'Gmail Connected' },
  { value: 'email_received', label: 'Email Received' },
  { value: 'telegram_received', label: 'Telegram Received' },
  { value: 'whatsapp_received', label: 'WhatsApp Received' },
  { value: 'payment_success', label: 'Payment Success' },
  { value: 'trial_ending', label: 'Trial Ending' },
  { value: 'credits_low', label: 'Credits Low' },
  { value: 'ai_completed', label: 'AI Completed' },
  { value: 'webhook', label: 'Webhook Trigger' },
  { value: 'scheduled', label: 'Scheduled Trigger' },
  { value: 'manual', label: 'Manual Trigger' },
];

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: Mail },
  { value: 'create_gmail_draft', label: 'Create Gmail Draft', icon: Mail },
  { value: 'send_telegram', label: 'Send Telegram', icon: Send },
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: MessageSquare },
  { value: 'ai_analysis', label: 'AI Analysis', icon: Bot },
  { value: 'ai_outreach', label: 'AI Outreach', icon: Bot },
  { value: 'move_lead_stage', label: 'Move Lead Stage', icon: ArrowRight },
  { value: 'update_tags', label: 'Update Tags', icon: Tag },
  { value: 'create_notification', label: 'Create Notification', icon: Bell },
  { value: 'wait_delay', label: 'Wait/Delay', icon: Clock },
  { value: 'conditional_branch', label: 'Conditional Branch', icon: GitBranch },
  { value: 'webhook_call', label: 'Webhook Call', icon: Globe },
  { value: 'export_data', label: 'Export Data', icon: FileDown },
  { value: 'score_lead', label: 'Score Lead', icon: Star },
  { value: 'add_note', label: 'Add Note', icon: StickyNote },
  { value: 'notify_low_credits', label: 'Notify Low Credits', icon: CreditCard },
  { value: 'notify_trial_ending', label: 'Notify Trial Ending', icon: Calendar },
];

const NODE_TYPES = [
  { value: 'action', label: 'Action' },
  { value: 'condition', label: 'Condition' },
  { value: 'delay', label: 'Delay' },
  { value: 'ai_action', label: 'AI Action' },
];

const TEMPLATE_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'alert', label: 'Alerts' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'enrichment', label: 'Enrichment' },
  { value: 'outreach', label: 'Outreach' },
];

// ===== HELPERS =====

function getTriggerLabel(triggerType: string): string {
  return TRIGGER_TYPES.find(t => t.value === triggerType)?.label || triggerType;
}

function getActionLabel(actionType: string): string {
  return ACTION_TYPES.find(a => a.value === actionType)?.label || actionType;
}

function getActionIcon(actionType: string): React.ElementType {
  return ACTION_TYPES.find(a => a.value === actionType)?.icon || Zap;
}

function getNodeColor(type: string): { bg: string; border: string; text: string } {
  switch (type) {
    case 'trigger':
      return { bg: 'bg-purple-500/10', border: 'border-l-purple-500', text: 'text-purple-500' };
    case 'action':
      return { bg: 'bg-cyan-500/10', border: 'border-l-cyan-500', text: 'text-cyan-500' };
    case 'condition':
      return { bg: 'bg-amber-500/10', border: 'border-l-amber-500', text: 'text-amber-500' };
    case 'delay':
      return { bg: 'bg-slate-400/10', border: 'border-l-slate-400', text: 'text-slate-400' };
    case 'ai_action':
      return { bg: 'bg-emerald-500/10', border: 'border-l-emerald-500', text: 'text-emerald-500' };
    default:
      return { bg: 'bg-cyan-500/10', border: 'border-l-cyan-500', text: 'text-cyan-500' };
  }
}

function getStatusBadge(status: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string; label: string } {
  switch (status) {
    case 'active':
      return { variant: 'default', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20', label: 'Active' };
    case 'paused':
      return { variant: 'secondary', className: 'bg-amber-500/10 text-amber-600 border-amber-200', label: 'Paused' };
    case 'draft':
      return { variant: 'outline', className: 'bg-slate-500/10 text-slate-500 border-slate-200', label: 'Draft' };
    case 'archived':
      return { variant: 'destructive', className: 'bg-red-500/10 text-red-600 border-red-200', label: 'Archived' };
    case 'running':
      return { variant: 'default', className: 'bg-blue-500/10 text-blue-600 border-blue-200', label: 'Running' };
    case 'completed':
      return { variant: 'default', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-200', label: 'Completed' };
    case 'failed':
      return { variant: 'destructive', className: 'bg-red-500/10 text-red-600 border-red-200', label: 'Failed' };
    case 'cancelled':
      return { variant: 'outline', className: 'bg-slate-500/10 text-slate-500 border-slate-200', label: 'Cancelled' };
    case 'dead_lettered':
      return { variant: 'destructive', className: 'bg-red-900/10 text-red-800 border-red-300', label: 'Dead Lettered' };
    default:
      return { variant: 'outline', className: '', label: status };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function executionDuration(exec: { startedAt: string; completedAt?: string }): string {
  if (!exec.completedAt) return 'In progress';
  try {
    const start = new Date(exec.startedAt).getTime();
    const end = new Date(exec.completedAt).getTime();
    return formatDuration(end - start);
  } catch {
    return 'Unknown';
  }
}

// ===== API HELPERS =====

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ===== SKELETONS =====

function WorkflowCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutionRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-3 border-b animate-pulse">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

function TemplateCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full mt-1" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}

// ===== WORKFLOW BUILDER =====

interface WorkflowBuilderProps {
  workflow?: Workflow | null;
  onSave: (data: {
    name: string;
    description: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    steps: { type: string; name: string; config: Record<string, unknown>; order: number }[];
    status: string;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

function WorkflowBuilder({ workflow, onSave, onCancel, saving }: WorkflowBuilderProps) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [triggerType, setTriggerType] = useState(workflow?.triggerType || 'lead_discovered');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    workflow?.triggerConfig || {}
  );
  const [nodes, setNodes] = useState<WorkflowNode[]>(
    workflow?.nodes?.filter(n => n.type !== 'trigger') || []
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addNodeMenuOpen, setAddNodeMenuOpen] = useState<string | null>(null);

  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const addNode = (type: string, afterNodeId?: string) => {
    const id = generateId();
    const newNode: WorkflowNode = {
      id,
      type: type as WorkflowNode['type'],
      title: type === 'action' ? 'New Action' :
             type === 'condition' ? 'New Condition' :
             type === 'delay' ? 'Wait' :
             type === 'ai_action' ? 'AI Action' : 'New Step',
      config: type === 'action' ? { actionType: 'send_email' } :
             type === 'condition' ? { actionType: 'conditional_branch' } :
             type === 'delay' ? { actionType: 'wait_delay', duration: 1, unit: 'hours' } :
             type === 'ai_action' ? { actionType: 'ai_analysis' } : {},
    };

    if (afterNodeId) {
      const idx = nodes.findIndex(n => n.id === afterNodeId);
      const newNodes = [...nodes];
      newNodes.splice(idx + 1, 0, newNode);
      setNodes(newNodes);
    } else {
      setNodes([...nodes, newNode]);
    }
    setSelectedNodeId(id);
    setAddNodeMenuOpen(null);
  };

  const removeNode = (nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const updateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n));
  };

  const updateNodeConfig = (nodeId: string, configUpdates: Record<string, unknown>) => {
    setNodes(nodes.map(n =>
      n.id === nodeId
        ? { ...n, config: { ...n.config, ...configUpdates } }
        : n
    ));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const steps = nodes.map((n, i) => ({
      type: n.type,
      name: n.title,
      config: n.config,
      order: i,
    }));
    const edges = nodes.map((n, i) => ({
      id: `e_${i}`,
      source: i === 0 ? 'trigger' : nodes[i - 1].id,
      target: n.id,
    }));
    onSave({
      name: name.trim(),
      description,
      triggerType,
      triggerConfig,
      nodes: [
        { id: 'trigger', type: 'trigger', title: getTriggerLabel(triggerType), config: triggerConfig },
        ...nodes,
      ],
      edges,
      steps,
      status: workflow?.status || 'draft',
    });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background shrink-0">
        <div className="flex-1 min-w-0 mr-4">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Workflow name"
            className="font-semibold text-lg border-0 px-0 h-auto focus-visible:ring-0 shadow-none"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            {workflow ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main flow area */}
        <div className="flex-1 overflow-auto p-4">
          {/* Description */}
          <div className="mb-4">
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              className="resize-none text-sm"
              rows={2}
            />
          </div>

          {/* Trigger config */}
          <div className="mb-6">
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Trigger Configuration
            </Label>
            <div className="flex gap-2">
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {triggerType === 'scheduled' && (
                <Input
                  value={String(triggerConfig.cron || '')}
                  onChange={e => setTriggerConfig({ ...triggerConfig, cron: e.target.value })}
                  placeholder="Cron expression (e.g. 0 9 * * *)"
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Visual flow */}
          <div className="space-y-1">
            {/* Trigger node */}
            <div
              className={cn(
                'rounded-lg border-l-4 p-3',
                'bg-purple-500/10 border-l-purple-500',
                'cursor-default'
              )}
            >
              <div className="flex items-center gap-2">
                <Zap className={cn('h-4 w-4 text-purple-500')} />
                <span className={cn('font-medium text-sm text-purple-500')}>
                  {getTriggerLabel(triggerType)}
                </span>
              </div>
            </div>

            {/* Connection line + add button */}
            <div className="flex flex-col items-center py-1">
              <div className="w-px h-4 bg-border" />
              <button
                className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/50 flex items-center justify-center hover:bg-accent transition-colors"
                onClick={() => setAddNodeMenuOpen(addNodeMenuOpen === 'after-trigger' ? null : 'after-trigger')}
                aria-label="Add node after trigger"
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
              </button>
              {addNodeMenuOpen === 'after-trigger' && (
                <AddNodeMenu
                  onSelect={(type) => addNode(type, undefined)}
                  onClose={() => setAddNodeMenuOpen(null)}
                />
              )}
            </div>

            {/* Workflow nodes */}
            {nodes.map((node, idx) => {
              const colors = getNodeColor(node.type);
              const isSelected = selectedNodeId === node.id;
              return (
                <React.Fragment key={node.id}>
                  <div
                    className={cn(
                      'rounded-lg border-l-4 p-3 cursor-pointer transition-all group',
                      colors.bg,
                      colors.border,
                      isSelected && 'ring-2 ring-primary/30',
                    )}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {node.type === 'action' || node.type === 'ai_action' ? (
                          renderActionIcon(String(node.config.actionType || ''), cn('h-4 w-4 shrink-0', colors.text))
                        ) : node.type === 'condition' ? (
                          <GitBranch className={cn('h-4 w-4 shrink-0', colors.text)} />
                        ) : (
                          <Clock className={cn('h-4 w-4 shrink-0', colors.text)} />
                        )}
                        <span className={cn('font-medium text-sm truncate', colors.text)}>
                          {node.title}
                        </span>
                        {node.type === 'action' && Boolean(node.config.actionType) && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1 shrink-0">
                            {getActionLabel(String(node.config.actionType))}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                        <button
                          className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNode(node.id);
                          }}
                          aria-label="Remove node"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Connection + add button between nodes */}
                  <div className="flex flex-col items-center py-1">
                    <div className="w-px h-4 bg-border" />
                    <button
                      className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/50 flex items-center justify-center hover:bg-accent transition-colors"
                      onClick={() => setAddNodeMenuOpen(addNodeMenuOpen === node.id ? null : node.id)}
                      aria-label={`Add node after ${node.title}`}
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {addNodeMenuOpen === node.id && (
                      <AddNodeMenu
                        onSelect={(type) => addNode(type, node.id)}
                        onClose={() => setAddNodeMenuOpen(null)}
                      />
                    )}
                  </div>
                </React.Fragment>
              );
            })}

            {/* Add node at the end */}
            {nodes.length === 0 && addNodeMenuOpen !== 'after-trigger' && (
              <div className="flex justify-center py-2">
                <p className="text-xs text-muted-foreground">Click the + button above to add steps</p>
              </div>
            )}

            {/* End node */}
            <div className="rounded-lg border border-dashed p-3 text-center">
              <span className="text-xs text-muted-foreground">End</span>
            </div>
          </div>
        </div>

        {/* Node config side panel */}
        {selectedNode && (
          <div className="w-80 border-l bg-background overflow-auto shrink-0 hidden md:block">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">Configure Node</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedNodeId(null)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={selectedNode.title}
                    onChange={e => updateNode(selectedNodeId!, { title: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={selectedNode.type}
                    onValueChange={(v) => updateNode(selectedNodeId!, { type: v as WorkflowNode['type'] })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NODE_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action type selector for action nodes */}
                {(selectedNode.type === 'action' || selectedNode.type === 'ai_action') && (
                  <div>
                    <Label className="text-xs">Action Type</Label>
                    <Select
                      value={String(selectedNode.config.actionType || 'send_email')}
                      onValueChange={(v) => updateNodeConfig(selectedNodeId!, { actionType: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(a => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Action-specific config fields */}
                {selectedNode.type === 'action' && renderActionConfig(selectedNode, selectedNodeId!, updateNodeConfig)}
                {selectedNode.type === 'ai_action' && renderAIActionConfig(selectedNode, selectedNodeId!, updateNodeConfig)}
                {selectedNode.type === 'delay' && renderDelayConfig(selectedNode, selectedNodeId!, updateNodeConfig)}
                {selectedNode.type === 'condition' && renderConditionConfig(selectedNode, selectedNodeId!, updateNodeConfig)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderActionConfig(
  node: WorkflowNode,
  nodeId: string,
  updateConfig: (id: string, updates: Record<string, unknown>) => void
) {
  const actionType = String(node.config.actionType || '');
  return (
    <>
      {(actionType === 'send_email' || actionType === 'create_gmail_draft') && (
        <>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              value={String(node.config.subject || '')}
              onChange={e => updateConfig(nodeId, { subject: e.target.value })}
              placeholder="Email subject"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Textarea
              value={String(node.config.body || '')}
              onChange={e => updateConfig(nodeId, { body: e.target.value })}
              placeholder="Email body (supports {{variables}})"
              className="mt-1 resize-none"
              rows={4}
            />
          </div>
        </>
      )}
      {(actionType === 'send_telegram' || actionType === 'send_whatsapp') && (
        <div>
          <Label className="text-xs">Message</Label>
          <Textarea
            value={String(node.config.message || '')}
            onChange={e => updateConfig(nodeId, { message: e.target.value })}
            placeholder="Message text"
            className="mt-1 resize-none"
            rows={4}
          />
        </div>
      )}
      {actionType === 'move_lead_stage' && (
        <div>
          <Label className="text-xs">Target Stage</Label>
          <Select
            value={String(node.config.targetStage || 'contacted')}
            onValueChange={v => updateConfig(nodeId, { targetStage: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="discussion">Discussion</SelectItem>
              <SelectItem value="proposal">Proposal</SelectItem>
              <SelectItem value="negotiation">Negotiation</SelectItem>
              <SelectItem value="won">Won</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {actionType === 'update_tags' && (
        <div>
          <Label className="text-xs">Tags (comma-separated)</Label>
          <Input
            value={String(node.config.tags || '')}
            onChange={e => updateConfig(nodeId, { tags: e.target.value })}
            placeholder="tag1, tag2, tag3"
            className="mt-1"
          />
        </div>
      )}
      {actionType === 'create_notification' && (
        <>
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={String(node.config.title || '')}
              onChange={e => updateConfig(nodeId, { title: e.target.value })}
              placeholder="Notification title"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Input
              value={String(node.config.message || '')}
              onChange={e => updateConfig(nodeId, { message: e.target.value })}
              placeholder="Notification message"
              className="mt-1"
            />
          </div>
        </>
      )}
      {actionType === 'add_note' && (
        <div>
          <Label className="text-xs">Note Content</Label>
          <Textarea
            value={String(node.config.content || '')}
            onChange={e => updateConfig(nodeId, { content: e.target.value })}
            placeholder="Note content"
            className="mt-1 resize-none"
            rows={4}
          />
        </div>
      )}
      {actionType === 'webhook_call' && (
        <>
          <div>
            <Label className="text-xs">URL</Label>
            <Input
              value={String(node.config.url || '')}
              onChange={e => updateConfig(nodeId, { url: e.target.value })}
              placeholder="https://example.com/webhook"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Method</Label>
            <Select
              value={String(node.config.method || 'POST')}
              onValueChange={v => updateConfig(nodeId, { method: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {(actionType === 'notify_low_credits' || actionType === 'notify_trial_ending') && (
        <div>
          <Label className="text-xs">Threshold</Label>
          <Input
            type="number"
            value={String(node.config.threshold || 10)}
            onChange={e => updateConfig(nodeId, { threshold: Number(e.target.value) })}
            className="mt-1"
          />
        </div>
      )}
    </>
  );
}

function renderAIActionConfig(
  node: WorkflowNode,
  nodeId: string,
  updateConfig: (id: string, updates: Record<string, unknown>) => void
) {
  const actionType = String(node.config.actionType || '');
  return (
    <>
      {actionType === 'ai_analysis' && (
        <div>
          <Label className="text-xs">Analysis Prompt</Label>
          <Textarea
            value={String(node.config.prompt || '')}
            onChange={e => updateConfig(nodeId, { prompt: e.target.value })}
            placeholder="Describe what to analyze..."
            className="mt-1 resize-none"
            rows={4}
          />
        </div>
      )}
      {actionType === 'ai_outreach' && (
        <>
          <div>
            <Label className="text-xs">Channel</Label>
            <Select
              value={String(node.config.channel || 'email')}
              onValueChange={v => updateConfig(nodeId, { channel: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Style</Label>
            <Select
              value={String(node.config.style || 'professional')}
              onValueChange={v => updateConfig(nodeId, { style: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="follow-up">Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {actionType === 'score_lead' && (
        <p className="text-xs text-muted-foreground">
          AI will score the lead based on conversion potential, urgency, and revenue opportunity.
        </p>
      )}
      {!['ai_analysis', 'ai_outreach', 'score_lead'].includes(actionType) && (
        <div>
          <Label className="text-xs">Action Type</Label>
          <Select
            value={actionType || 'ai_analysis'}
            onValueChange={v => updateConfig(nodeId, { actionType: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ai_analysis">AI Analysis</SelectItem>
              <SelectItem value="ai_outreach">AI Outreach</SelectItem>
              <SelectItem value="score_lead">Score Lead</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

function renderDelayConfig(
  node: WorkflowNode,
  nodeId: string,
  updateConfig: (id: string, updates: Record<string, unknown>) => void
) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Label className="text-xs">Duration</Label>
        <Input
          type="number"
          value={String(node.config.duration || 1)}
          onChange={e => updateConfig(nodeId, { duration: Number(e.target.value) })}
          className="mt-1"
          min={1}
        />
      </div>
      <div className="flex-1">
        <Label className="text-xs">Unit</Label>
        <Select
          value={String(node.config.unit || 'hours')}
          onValueChange={v => updateConfig(nodeId, { unit: v })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function renderConditionConfig(
  node: WorkflowNode,
  nodeId: string,
  updateConfig: (id: string, updates: Record<string, unknown>) => void
) {
  return (
    <>
      <div>
        <Label className="text-xs">Field</Label>
        <Input
          value={String(node.config.field || '')}
          onChange={e => updateConfig(nodeId, { field: e.target.value })}
          placeholder="e.g. leadScore"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Operator</Label>
        <Select
          value={String(node.config.operator || '>')}
          onValueChange={v => updateConfig(nodeId, { operator: v })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=">">Greater than</SelectItem>
            <SelectItem value="<">Less than</SelectItem>
            <SelectItem value="==">Equals</SelectItem>
            <SelectItem value="!=">Not equals</SelectItem>
            <SelectItem value=">=">Greater or equal</SelectItem>
            <SelectItem value="<=">Less or equal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Value</Label>
        <Input
          value={String(node.config.value || '')}
          onChange={e => updateConfig(nodeId, { value: e.target.value })}
          placeholder="Comparison value"
          className="mt-1"
        />
      </div>
    </>
  );
}

// ===== DYNAMIC ICON HELPER =====

function renderActionIcon(actionType: string, className: string): React.ReactNode {
  const found = ACTION_TYPES.find(a => a.value === actionType);
  if (!found) return <Zap className={className} />;
  const Icon = found.icon;
  return <Icon className={className} />;
}

// ===== ADD NODE MENU =====

function AddNodeMenu({ onSelect, onClose }: { onSelect: (type: string) => void; onClose: () => void }) {
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-2 z-50 mt-1">
      {NODE_TYPES.map(t => (
        <button
          key={t.value}
          className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
          onClick={() => {
            onSelect(t.value);
            onClose();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ===== WORKFLOW LIST =====

function WorkflowList({
  onSelectWorkflow,
  onEditWorkflow,
}: {
  onSelectWorkflow: (wf: Workflow) => void;
  onEditWorkflow: (wf: Workflow) => void;
}) {
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '50');
      const data = await apiFetch<{ workflows: Workflow[]; total: number }>(
        `/api/workflows?${params.toString()}`
      );
      setWorkflows(data.workflows || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load workflows',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflows();
    return () => { cancelled = true; };
  }, [fetchWorkflows]);

  const handleToggleStatus = async (wf: Workflow) => {
    setTogglingId(wf.id);
    try {
      const newStatus = wf.status === 'active' ? 'paused' : 'active';
      await apiFetch(`/api/workflows/${wf.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      toast({
        title: `Workflow ${newStatus === 'active' ? 'activated' : 'paused'}`,
        description: `${wf.name} is now ${newStatus}`,
      });
      fetchWorkflows();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to toggle status',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/workflows/${deleteId}`, { method: 'DELETE' });
      toast({ title: 'Workflow deleted', description: 'The workflow has been archived.' });
      setDeleteId(null);
      fetchWorkflows();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete workflow',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleExecute = async (wf: Workflow) => {
    if (executingId) return;
    setExecutingId(wf.id);
    try {
      const result = await apiFetch<{ executionId: string; status: string }>(
        `/api/workflows/${wf.id}/execute`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      toast({
        title: 'Workflow executing...',
        description: `${wf.name} started — execution ${result.executionId}`,
      });
      // Refresh the workflow card after 2 seconds to show the updated run count
      setTimeout(() => {
        fetchWorkflows();
      }, 2000);
    } catch (err) {
      toast({
        title: 'Execution failed',
        description: err instanceof Error ? err.message : 'Failed to execute workflow',
        variant: 'destructive',
      });
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <WorkflowCardSkeleton />
          <WorkflowCardSkeleton />
          <WorkflowCardSkeleton />
        </div>
      )}

      {/* Empty state */}
      {!loading && workflows.length === 0 && (
        <div className="text-center py-12">
          <GitBranch className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first workflow to automate your client acquisition.
          </p>
        </div>
      )}

      {/* Workflow cards */}
      {!loading && workflows.length > 0 && (
        <div className="space-y-3">
          {workflows.map(wf => {
            const statusBadge = getStatusBadge(wf.status);
            const stepCount = wf.nodes?.filter(n => n.type !== 'trigger').length || wf.workflowSteps?.length || 0;
            return (
              <Card key={wf.id} className="transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle
                          className="text-base cursor-pointer hover:text-primary transition-colors"
                          onClick={() => onSelectWorkflow(wf)}
                        >
                          {wf.name}
                        </CardTitle>
                        <Badge variant={statusBadge.variant} className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                        {wf.disabledBySubscription && (
                          <Badge
                            variant="outline"
                            className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Subscription Paused
                          </Badge>
                        )}
                      </div>
                      {wf.description && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {wf.description}
                        </CardDescription>
                      )}
                      {wf.disabledBySubscription && (
                        <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                          Renew your subscription to resume this workflow.
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditWorkflow(wf)}>
                          <Edit3 className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExecute(wf)} disabled={wf.status === 'archived' || wf.disabledBySubscription}>
                          <Play className="h-4 w-4 mr-2" /> Execute Now
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(wf.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      <span>{getTriggerLabel(wf.triggerType)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
                    </div>
                    {wf._count?.executions !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <Play className="h-3.5 w-3.5" />
                        <span>{wf._count.executions} run{wf._count.executions !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{timeAgo(wf.updatedAt)}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Switch
                        checked={wf.status === 'active'}
                        onCheckedChange={() => handleToggleStatus(wf)}
                        disabled={togglingId === wf.id || wf.status === 'draft' || wf.disabledBySubscription}
                        aria-label={`Toggle ${wf.name} status`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleExecute(wf)}
                        disabled={wf.status === 'archived' || wf.disabledBySubscription || executingId === wf.id}
                      >
                        {executingId === wf.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        {executingId === wf.id ? 'Starting…' : 'Run'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the workflow. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ===== AI WORKFLOW GENERATION (ELITE ONLY) =====

interface GeneratedStep {
  nodeType: string;
  actionType: string;
  title: string;
  config: Record<string, unknown>;
}

interface AiGenerated {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: GeneratedStep[];
}

interface AiGeneratePayload {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  steps: { type: string; name: string; config: Record<string, unknown>; order: number }[];
  status: string;
}

function AiGenerateWorkflowModal({
  open,
  onOpenChange,
  onEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (payload: AiGeneratePayload) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ generated: AiGenerated; payload: AiGeneratePayload } | null>(null);
  const [savingStatus, setSavingStatus] = useState<'draft' | 'active' | null>(null);

  const reset = () => {
    setDescription('');
    setGenerated(null);
    setGenerating(false);
    setSavingStatus(null);
  };

  const handleGenerate = async () => {
    if (!description.trim() || generating) return;
    setGenerating(true);
    setGenerated(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        generated: AiGenerated;
        payload: AiGeneratePayload;
        creditsDeducted: number;
        newBalance: number;
      }>('/api/workflows/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() }),
      });
      setGenerated({ generated: data.generated, payload: data.payload });
      toast({
        title: 'Workflow generated',
        description: `${data.creditsDeducted} credits used — review the preview below.`,
      });
    } catch (err) {
      toast({
        title: 'Generation failed',
        description: err instanceof Error ? err.message : 'Failed to generate workflow',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (status: 'draft' | 'active') => {
    if (!generated || savingStatus) return;
    setSavingStatus(status);
    try {
      await apiFetch('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ ...generated.payload, status }),
      });
      toast({
        title: status === 'active' ? 'Workflow saved & activated' : 'Workflow saved as draft',
        description: `"${generated.payload.name}" was created like a manually built workflow.`,
      });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Failed to save workflow',
        variant: 'destructive',
      });
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Create Workflow with AI
          </DialogTitle>
          <DialogDescription>
            Describe your automation in plain English and AI will build it. Elite feature — costs 5 credits per generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-workflow-description">Workflow description</Label>
            <Textarea
              id="ai-workflow-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your workflow in plain English... e.g. 'When a lead replies to my email, wait 2 hours, then send a personalized follow-up using AI, then move them to Replied stage in pipeline'"
              rows={4}
              className="resize-none text-sm"
              disabled={generating || !!savingStatus}
            />
          </div>

          {!generated ? (
            <Button
              onClick={handleGenerate}
              disabled={!description.trim() || generating}
              className="w-full gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Workflow
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              {/* Generated Workflow Preview */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Generated Workflow Preview
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-400">
                    <Zap className="h-3 w-3 mr-1" />
                    Trigger: {getTriggerLabel(generated.generated.triggerType)}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {generated.generated.steps.map((step, i) => {
                    const colors = getNodeColor(step.nodeType);
                    // Always a rendered element (never a bare component) to avoid React child errors
                    const stepIcon = step.nodeType === 'delay'
                      ? <Clock className="h-3.5 w-3.5" />
                      : step.nodeType === 'condition'
                        ? <GitBranch className="h-3.5 w-3.5" />
                        : renderActionIcon(step.actionType, 'h-3.5 w-3.5');
                    return (
                      <div key={i} className={cn('flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-xs', colors.bg, colors.border)}>
                        <span className="font-mono text-[10px] text-muted-foreground w-8 shrink-0">Step {i + 1}</span>
                        <span className={cn('shrink-0', colors.text)}>{stepIcon}</span>
                        <span className="font-medium truncate">{step.title}</span>
                        <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 shrink-0">
                          {getActionLabel(step.actionType)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {generated.generated.steps.length} step{generated.generated.steps.length !== 1 ? 's' : ''} ·
                  saved to DB exactly like a manual workflow
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const payload = generated.payload;
                    reset();
                    onOpenChange(false);
                    onEdit(payload);
                  }}
                  disabled={!!savingStatus}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleSave('draft')}
                  disabled={!!savingStatus}
                >
                  {savingStatus === 'draft' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Save as Draft
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={() => handleSave('active')}
                  disabled={!!savingStatus}
                >
                  {savingStatus === 'active' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Save &amp; Activate
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== WORKFLOW DETAIL =====

function WorkflowDetail({
  workflow,
  onBack,
  onEdit,
}: {
  workflow: Workflow;
  onBack: () => void;
  onEdit: (wf: Workflow) => void;
}) {
  const { toast } = useToast();
  const [executing, setExecuting] = useState(false);

  const statusBadge = getStatusBadge(workflow.status);
  const stepCount = workflow.nodes?.filter(n => n.type !== 'trigger').length || workflow.workflowSteps?.length || 0;

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await apiFetch<{ executionId: string; status: string }>(
        `/api/workflows/${workflow.id}/execute`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      toast({
        title: 'Workflow executed',
        description: `Execution ${result.executionId} started`,
      });
    } catch (err) {
      toast({
        title: 'Execution failed',
        description: err instanceof Error ? err.message : 'Failed to execute',
        variant: 'destructive',
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronRight className="h-4 w-4 rotate-180 mr-1" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{workflow.name}</CardTitle>
                <Badge variant={statusBadge.variant} className={statusBadge.className}>
                  {statusBadge.label}
                </Badge>
                {workflow.disabledBySubscription && (
                  <Badge
                    variant="outline"
                    className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Subscription Paused
                  </Badge>
                )}
              </div>
              {workflow.description && (
                <CardDescription className="mt-1">{workflow.description}</CardDescription>
              )}
              {workflow.disabledBySubscription && (
                <p className="mt-1 text-sm text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Renew your subscription to resume this workflow.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExecute}
                disabled={workflow.status === 'archived' || workflow.disabledBySubscription || executing}
              >
                {executing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                Execute
              </Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(workflow)}>
                <Edit3 className="h-4 w-4 mr-1" /> Edit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              <span>Trigger: {getTriggerLabel(workflow.triggerType)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Visual flow */}
          <div className="mt-6 space-y-1">
            {workflow.nodes?.filter(n => n.type === 'trigger').map(node => {
              const colors = getNodeColor('trigger');
              return (
                <div key={node.id} className={cn('rounded-lg border-l-4 p-3', colors.bg, colors.border)}>
                  <div className="flex items-center gap-2">
                    <Zap className={cn('h-4 w-4', colors.text)} />
                    <span className={cn('font-medium text-sm', colors.text)}>{node.title}</span>
                  </div>
                </div>
              );
            })}
            {workflow.nodes?.filter(n => n.type !== 'trigger').map(node => {
              const colors = getNodeColor(node.type);
              return (
                <React.Fragment key={node.id}>
                  <div className="flex flex-col items-center py-0.5">
                    <div className="w-px h-3 bg-border" />
                  </div>
                  <div className={cn('rounded-lg border-l-4 p-3', colors.bg, colors.border)}>
                    <div className="flex items-center gap-2">
                      {node.type === 'delay' ? (
                        <Clock className={cn('h-4 w-4', colors.text)} />
                      ) : node.type === 'condition' ? (
                        <GitBranch className={cn('h-4 w-4', colors.text)} />
                      ) : (
                        renderActionIcon(String(node.config?.actionType || ''), cn('h-4 w-4', colors.text))
                      )}
                      <span className={cn('font-medium text-sm', colors.text)}>{node.title}</span>
                      {Boolean(node.config?.actionType) && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {getActionLabel(String(node.config.actionType))}
                        </Badge>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== EXECUTIONS TAB =====

function ExecutionsTab() {
  const { toast } = useToast();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executionDetail, setExecutionDetail] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchExecutions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '50');
      const data = await apiFetch<{ executions: Execution[]; total: number }>(
        `/api/workflows/executions?${params.toString()}`
      );
      setExecutions(data.executions || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load executions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    let cancelled = false;
    fetchExecutions();
    return () => { cancelled = true; };
  }, [fetchExecutions]);

  const handleExpand = async (execId: string) => {
    if (expandedId === execId) {
      setExpandedId(null);
      setExecutionDetail(null);
      return;
    }
    setExpandedId(execId);
    setDetailLoading(true);
    try {
      const detail = await apiFetch<ExecutionDetail>(
        `/api/workflows/logs?executionId=${execId}`
      );
      setExecutionDetail(detail);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load execution detail',
        variant: 'destructive',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRetry = async (execId: string) => {
    try {
      await apiFetch(`/api/workflows/${execId}/resume`, { method: 'POST' });
      toast({ title: 'Execution retried', description: 'The execution has been retried.' });
      fetchExecutions();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to retry',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (execId: string) => {
    try {
      await apiFetch(`/api/workflows/${execId}/cancel`, { method: 'POST' });
      toast({ title: 'Execution cancelled' });
      fetchExecutions();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to cancel',
        variant: 'destructive',
      });
    }
  };

  const handleRerun = async (workflowId: string) => {
    try {
      await apiFetch(`/api/workflows/${workflowId}/execute`, { method: 'POST', body: JSON.stringify({}) });
      toast({ title: 'Workflow re-executed', description: 'A new execution has been started.' });
      fetchExecutions();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to rerun',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <ExecutionRowSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && executions.length === 0 && (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No executions yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Execute a workflow to see its history here.
          </p>
        </div>
      )}

      {/* Execution list */}
      {!loading && executions.length > 0 && (
        <div className="space-y-2">
          {executions.map(exec => {
            const statusBadge = getStatusBadge(exec.status);
            const progressPercent = exec.totalSteps > 0
              ? Math.round((exec.currentStep / exec.totalSteps) * 100)
              : 0;
            const isExpanded = expandedId === exec.id;

            return (
              <Card key={exec.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleExpand(exec.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate">
                        {exec.workflowName || 'Unknown Workflow'}
                      </span>
                    </div>
                    <Badge variant={statusBadge.variant} className={statusBadge.className}>
                      {statusBadge.label}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{exec.currentStep}/{exec.totalSteps} steps</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{executionDuration(exec)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(exec.startedAt)}
                    </span>
                  </div>
                  {exec.totalSteps > 0 && (
                    <div className="mt-2 ml-6">
                      <Progress value={progressPercent} className="h-1.5" />
                    </div>
                  )}
                  {exec.error && (
                    <div className="mt-2 ml-6 text-xs text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="truncate">{exec.error}</span>
                    </div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : executionDetail ? (
                      <div className="mt-3 space-y-3">
                        {/* Execution actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {(exec.status === 'failed' || exec.status === 'cancelled') && (
                            <Button variant="outline" size="sm" onClick={() => handleRetry(exec.id)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                            </Button>
                          )}
                          {exec.status === 'completed' && (
                            <Button variant="outline" size="sm" onClick={() => handleRerun(exec.workflowId)}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Rerun
                            </Button>
                          )}
                          {exec.status === 'running' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleCancel(exec.id)}>
                                <Square className="h-3.5 w-3.5 mr-1" /> Cancel
                              </Button>
                            </>
                          )}
                          {exec.status === 'paused' && (
                            <Button variant="outline" size="sm" onClick={() => handleRetry(exec.id)}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Resume
                            </Button>
                          )}
                        </div>

                        {/* Step logs */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Step Logs
                          </h4>
                          {executionDetail.stepLogs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No step logs available.</p>
                          ) : (
                            executionDetail.stepLogs.map((log, idx) => {
                              const logStatusBadge = getStatusBadge(log.status);
                              const stepColors = getNodeColor(log.stepType);
                              return (
                                <div
                                  key={log.id}
                                  className={cn(
                                    'rounded-lg border-l-4 p-3',
                                    stepColors.bg,
                                    stepColors.border,
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={cn('font-medium text-sm', stepColors.text)}>
                                        {idx + 1}. {log.stepName}
                                      </span>
                                      <Badge variant={logStatusBadge.variant} className={cn('text-[10px] h-4 px-1.5', logStatusBadge.className)}>
                                        {logStatusBadge.label}
                                      </Badge>
                                    </div>
                                    {log.durationMs !== undefined && log.durationMs !== null && (
                                      <span className="text-xs text-muted-foreground">
                                        {formatDuration(log.durationMs)}
                                      </span>
                                    )}
                                  </div>
                                  {log.error && (
                                    <div className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>{log.error}</span>
                                    </div>
                                  )}
                                  {log.output && (
                                    <div className="mt-1.5">
                                      <button
                                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        onClick={(e) => {
                                          const target = e.currentTarget.nextElementSibling;
                                          if (target) target.classList.toggle('hidden');
                                        }}
                                      >
                                        <Eye className="h-3 w-3" /> View Output
                                      </button>
                                      <pre className="hidden mt-1 text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-32">
                                        {JSON.stringify(log.output, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Metadata */}
                        <Separator />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Retries:</span> {executionDetail.retryCount}/{executionDetail.maxRetries}
                          </div>
                          <div>
                            <span className="font-medium">Started:</span> {formatDate(executionDetail.startedAt)}
                          </div>
                          <div>
                            <span className="font-medium">Completed:</span> {executionDetail.completedAt ? formatDate(executionDetail.completedAt) : 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Trigger:</span> {getTriggerLabel(executionDetail.triggerType)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4">Failed to load execution detail.</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== TEMPLATES TAB =====

function TemplatesTab({ onTemplateUsed }: { onTemplateUsed: () => void }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      const data = await apiFetch<{ templates: Template[] }>(
        `/api/workflows/templates?${params.toString()}`
      );
      setTemplates(data.templates || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [category, toast]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates();
    return () => { cancelled = true; };
  }, [fetchTemplates]);

  const handleUseTemplate = async (template: Template) => {
    setInstantiatingId(template.id);
    try {
      const result = await apiFetch<{ success: boolean; workflowId: string }>(
        '/api/workflows/templates',
        {
          method: 'POST',
          body: JSON.stringify({ templateId: template.id }),
        }
      );
      if (result.success) {
        toast({
          title: 'Template applied',
          description: `Workflow created from "${template.name}"`,
        });
        onTemplateUsed();
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to use template',
        variant: 'destructive',
      });
    } finally {
      setInstantiatingId(null);
    }
  };

  const getCategoryLabel = (cat: string): string => {
    return TEMPLATE_CATEGORIES.find(c => c.value === cat)?.label || cat;
  };

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TEMPLATE_CATEGORIES.map(cat => (
          <Button
            key={cat.value}
            variant={category === cat.value ? 'default' : 'outline'}
            size="sm"
            className="whitespace-nowrap"
            onClick={() => setCategory(cat.value)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <TemplateCardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className="text-center py-12">
          <Copy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No templates in this category</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try a different category or check back later.
          </p>
        </div>
      )}

      {/* Template grid */}
      {!loading && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => {
            const stepCount = (template.nodes as WorkflowNode[])?.filter(n => n.type !== 'trigger').length || 0;
            return (
              <Card key={template.id} className="flex flex-col transition-all hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
                    {template.isPremium && (
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px] h-5 shrink-0">
                        Premium
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs line-clamp-2">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {getCategoryLabel(template.category)}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> {stepCount} steps
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" /> {getTriggerLabel(template.triggerType)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleUseTemplate(template)}
                      disabled={instantiatingId === template.id}
                    >
                      {instantiatingId === template.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      Use Template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Template preview dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>{previewTemplate?.description}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-2 max-h-96 overflow-auto">
              {(previewTemplate.nodes as WorkflowNode[])?.map((node, idx) => {
                const colors = getNodeColor(node.type);
                return (
                  <div key={node.id || idx} className={cn('rounded-lg border-l-4 p-2.5', colors.bg, colors.border)}>
                    <div className="flex items-center gap-2">
                      {node.type === 'trigger' ? (
                        <Zap className={cn('h-3.5 w-3.5', colors.text)} />
                      ) : node.type === 'delay' ? (
                        <Clock className={cn('h-3.5 w-3.5', colors.text)} />
                      ) : node.type === 'condition' ? (
                        <GitBranch className={cn('h-3.5 w-3.5', colors.text)} />
                      ) : (
                        renderActionIcon(String(node.config?.actionType || ''), cn('h-3.5 w-3.5', colors.text))
                      )}
                      <span className={cn('text-sm font-medium', colors.text)}>{node.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
            {previewTemplate && (
              <Button onClick={() => { handleUseTemplate(previewTemplate); setPreviewTemplate(null); }}>
                <Copy className="h-4 w-4 mr-1" /> Use Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== MAIN WORKFLOWS TAB =====

export default function WorkflowsTab() {
  const { toast } = useToast();
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const [subTab, setSubTab] = useState<'workflows' | 'executions' | 'templates'>('workflows');
  const [builderMode, setBuilderMode] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPreset, setAiPreset] = useState<Workflow | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const handleCreateNew = () => {
    setEditingWorkflow(null);
    setAiPreset(null);
    setBuilderMode(true);
  };

  const handleCreateWithAi = () => {
    // Visible to all — functional for Elite only
    if (currentPlan !== 'elite') {
      toast({
        title: 'Upgrade to Elite to use AI workflow creation',
        description: 'AI workflow generation is available on the Elite plan.',
        variant: 'destructive',
      });
      return;
    }
    setAiModalOpen(true);
  };

  const handleAiEdit = (payload: {
    name: string;
    description: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }) => {
    // Open the standard builder prefilled with the generated workflow (creates a NEW workflow on save)
    setEditingWorkflow(null);
    setAiPreset({
      id: 'ai-preset',
      name: payload.name,
      description: payload.description,
      triggerType: payload.triggerType,
      triggerConfig: payload.triggerConfig,
      nodes: payload.nodes,
      edges: payload.edges,
      status: 'draft',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Workflow);
    setBuilderMode(true);
  };

  const handleEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setBuilderMode(true);
  };

  const handleSave = async (data: {
    name: string;
    description: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    steps: { type: string; name: string; config: Record<string, unknown>; order: number }[];
    status: string;
  }) => {
    setSaving(true);
    try {
      if (editingWorkflow) {
        await apiFetch(`/api/workflows/${editingWorkflow.id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        toast({ title: 'Workflow updated', description: `${data.name} has been updated.` });
      } else {
        await apiFetch('/api/workflows', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        toast({ title: 'Workflow created', description: `${data.name} has been created.` });
      }
      setBuilderMode(false);
      setEditingWorkflow(null);
      setAiPreset(null);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save workflow',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBuilder = () => {
    setBuilderMode(false);
    setEditingWorkflow(null);
    setAiPreset(null);
  };

  // If in builder mode, show builder full-screen
  if (builderMode) {
    return (
      <div className="h-full">
        <WorkflowBuilder
          workflow={editingWorkflow ?? aiPreset}
          onSave={handleSave}
          onCancel={handleCancelBuilder}
          saving={saving}
        />
      </div>
    );
  }

  // If viewing a specific workflow detail
  if (selectedWorkflow) {
    return (
      <div className="p-4 h-full overflow-auto">
        <WorkflowDetail
          workflow={selectedWorkflow}
          onBack={() => setSelectedWorkflow(null)}
          onEdit={(wf) => {
            setSelectedWorkflow(null);
            handleEdit(wf);
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)} className="flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-background border-b px-4 pt-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <TabsList>
              <TabsTrigger value="workflows">Workflows</TabsTrigger>
              <TabsTrigger value="executions">Executions</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
            {subTab === 'workflows' && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open('/workflows/documentation', '_blank', 'noopener,noreferrer')
                  }
                >
                  <BookOpen className="h-4 w-4 mr-1" /> Documentation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateWithAi}
                  className="border-primary/30 hover:bg-primary/5"
                >
                  <Sparkles className="h-4 w-4 mr-1 text-primary" /> Create with AI
                </Button>
                <Button size="sm" onClick={handleCreateNew}>
                  <Plus className="h-4 w-4 mr-1" /> New Workflow
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="workflows" className="p-4 mt-0">
            <WorkflowList
              key={listRefreshKey}
              onSelectWorkflow={(wf) => setSelectedWorkflow(wf)}
              onEditWorkflow={handleEdit}
            />
          </TabsContent>

          <TabsContent value="executions" className="p-4 mt-0">
            <ExecutionsTab />
          </TabsContent>

          <TabsContent value="templates" className="p-4 mt-0">
            <TemplatesTab onTemplateUsed={() => setSubTab('workflows')} />
          </TabsContent>
        </div>
      </Tabs>

      {/* AI Workflow Generation modal (Elite only) */}
      <AiGenerateWorkflowModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        onEdit={handleAiEdit}
        onSaved={() => setListRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
