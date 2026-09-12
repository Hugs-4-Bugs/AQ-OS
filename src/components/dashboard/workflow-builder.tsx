'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  GitBranch,
  Play,
  Clock,
  Plus,
  Mail,
  MessageSquare,
  Phone,
  ArrowRight,
  Send,
  X,
  Pencil,
  Trash2,
  Workflow as WorkflowIcon,
  Sparkles,
  Check,
  ChevronDown,
  ArrowDown,
  Bot,
  Bell,
  Calendar,
  ToggleLeft,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import PlanGate from './plan-gate';

// ─── Types ────────────────────────────────────────────────

type TriggerType = 'stage_entered' | 'lead_reply' | 'score_change' | 'scheduled' | 'manual';
type NodeType = 'trigger' | 'condition' | 'action' | 'delay';
type ActionType = 'send_whatsapp' | 'send_telegram' | 'send_email' | 'move_to_stage' | 'add_note' | 'generate_ai_message' | 'create_follow_up';

interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  description?: string;
  config: Record<string, string>;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, string>;
  nodes: WorkflowNode[];
  status: 'active' | 'paused' | 'draft';
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  stage_entered: 'Lead enters pipeline stage',
  lead_reply: 'Lead reply detected',
  score_change: 'Lead score changes',
  scheduled: 'Scheduled (daily/weekly)',
  manual: 'Manual trigger',
};

const TRIGGER_ICONS: Record<TriggerType, React.ElementType> = {
  stage_entered: ArrowRight,
  lead_reply: MessageSquare,
  score_change: Zap,
  scheduled: Calendar,
  manual: Play,
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_whatsapp: 'Send WhatsApp',
  send_telegram: 'Send Telegram',
  send_email: 'Send Email',
  move_to_stage: 'Move to Stage',
  add_note: 'Add Note',
  generate_ai_message: 'Generate AI Message',
  create_follow_up: 'Create Follow-up',
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  send_whatsapp: Phone,
  send_telegram: Send,
  send_email: Mail,
  move_to_stage: ArrowRight,
  add_note: Pencil,
  generate_ai_message: Bot,
  create_follow_up: Bell,
};

const NODE_COLORS: Record<NodeType, string> = {
  trigger: 'border-l-purple-500',
  condition: 'border-l-amber-500',
  action: 'border-l-cyan-500',
  delay: 'border-l-slate-400',
};

const NODE_BG_COLORS: Record<NodeType, string> = {
  trigger: 'bg-purple-500/10 text-purple-500',
  condition: 'bg-amber-500/10 text-amber-500',
  action: 'bg-cyan-500/10 text-cyan-500',
  delay: 'bg-slate-400/10 text-slate-400',
};

const NODE_ICONS: Record<NodeType, React.ElementType> = {
  trigger: Zap,
  condition: GitBranch,
  action: Play,
  delay: Clock,
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  draft: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

// ─── API Functions ────────────────────────────────────────

async function fetchWorkflows(): Promise<Workflow[]> {
  const res = await fetch('/api/workflows');
  if (!res.ok) throw new Error('Failed to fetch workflows');
  return res.json();
}

async function createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create workflow');
  return res.json();
}

async function updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update workflow');
  return res.json();
}

async function deleteWorkflow(id: string): Promise<void> {
  const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete workflow');
}

// ─── Node Component ──────────────────────────────────────

function FlowNode({
  node,
  onEdit,
  onDelete,
  isFirst,
  isLast,
}: {
  node: WorkflowNode;
  onEdit: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const Icon = NODE_ICONS[node.type];
  const color = NODE_COLORS[node.type];
  const bgIconColor = NODE_BG_COLORS[node.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="relative"
    >
      {/* Connection line from above */}
      {!isFirst && (
        <div className="flex justify-center mb-0">
          <div className="w-px h-6 border-l-2 border-dashed border-muted-foreground/30" />
        </div>
      )}

      {/* Node card */}
      <Card className={cn('border-l-4', color, 'group hover:shadow-md transition-all duration-200')}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', bgIconColor)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{node.title}</p>
              {node.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{node.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Pencil className="h-3 w-3" />
              </Button>
              {!isFirst && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add node button between nodes */}
      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="w-px h-4 border-l-2 border-dashed border-muted-foreground/30" />
          <button
            className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/10 transition-all duration-200"
            onClick={() => {
              // This will be handled by the parent via the insertIndex
            }}
          >
            <Plus className="h-3 w-3" />
          </button>
          <div className="w-px h-4 border-l-2 border-dashed border-muted-foreground/30" />
        </div>
      )}
    </motion.div>
  );
}

// ─── Node Config Panel ────────────────────────────────────

function NodeConfigPanel({
  node,
  onSave,
  onCancel,
  isNew,
  insertIndex,
}: {
  node: WorkflowNode | null;
  onSave: (node: WorkflowNode, insertIndex?: number) => void;
  onCancel: () => void;
  isNew?: boolean;
  insertIndex?: number;
}) {
  const [type, setType] = useState<NodeType>(node?.type || 'action');
  const [title, setTitle] = useState(node?.title || '');
  const [description, setDescription] = useState(node?.description || '');
  const [actionType, setActionType] = useState<ActionType>((node?.config?.actionType as ActionType) || 'send_whatsapp');
  const [delayDuration, setDelayDuration] = useState(node?.config?.duration || '1');
  const [delayUnit, setDelayUnit] = useState(node?.config?.unit || 'hours');
  const [conditionField, setConditionField] = useState(node?.config?.field || 'stage');
  const [conditionOperator, setConditionOperator] = useState(node?.config?.operator || '==');
  const [conditionValue, setConditionValue] = useState(node?.config?.value || '');

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Node title is required');
      return;
    }

    let config: Record<string, string> = {};

    if (type === 'action') {
      config = { actionType, channel: actionType.includes('send') ? actionType.replace('send_', '') : '', action: actionType };
    } else if (type === 'delay') {
      config = { duration: delayDuration, unit: delayUnit };
    } else if (type === 'condition') {
      config = { field: conditionField, operator: conditionOperator, value: conditionValue };
    } else if (type === 'trigger') {
      config = { triggerType: 'lead_reply' };
    }

    const newNode: WorkflowNode = {
      id: node?.id || `node-${Date.now()}`,
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      config,
    };

    onSave(newNode, isNew ? insertIndex : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isNew ? 'Add Node' : 'Edit Node'}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Node type selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Node Type</label>
        {isNew && (
          <Select value={type} onValueChange={(v) => setType(v as NodeType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="action">
                <div className="flex items-center gap-2">
                  <Play className="h-3 w-3 text-cyan-500" />
                  Action
                </div>
              </SelectItem>
              <SelectItem value="condition">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3 w-3 text-amber-500" />
                  Condition
                </div>
              </SelectItem>
              <SelectItem value="delay">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-slate-400" />
                  Delay
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Node title..."
          className="h-9"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description..."
          className="h-9"
        />
      </div>

      {/* Action type config */}
      {type === 'action' && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Action Type</label>
          <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTION_LABELS).map(([key, label]) => {
                const Icon = ACTION_ICONS[key as ActionType];
                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3" />
                      {label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Condition config */}
      {type === 'condition' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Field</label>
            <Select value={conditionField} onValueChange={setConditionField}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stage">Stage</SelectItem>
                <SelectItem value="urgencyScore">Urgency Score</SelectItem>
                <SelectItem value="conversionScore">Conversion Score</SelectItem>
                <SelectItem value="replyScore">Reply Score</SelectItem>
                <SelectItem value="daysSinceContact">Days Since Contact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Operator</label>
            <Select value={conditionOperator} onValueChange={setConditionOperator}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="==">Equals</SelectItem>
                <SelectItem value="!=">Not equals</SelectItem>
                <SelectItem value=">">Greater than</SelectItem>
                <SelectItem value="<">Less than</SelectItem>
                <SelectItem value=">=">Greater or equal</SelectItem>
                <SelectItem value="in">In</SelectItem>
                <SelectItem value="not_in">Not in</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            <Input
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="Value..."
              className="h-9"
            />
          </div>
        </div>
      )}

      {/* Delay config */}
      {type === 'delay' && (
        <div className="flex gap-3">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Duration</label>
            <Input
              type="number"
              min="1"
              value={delayDuration}
              onChange={(e) => setDelayDuration(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-28 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Unit</label>
            <Select value={delayUnit} onValueChange={setDelayUnit}>
              <SelectTrigger className="h-9">
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
      )}

      <div className="flex gap-2 pt-2">
        <Button size="sm" className="flex-1 gap-1" onClick={handleSave}>
          <Check className="h-3.5 w-3.5" />
          {isNew ? 'Add Node' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Workflow List View ───────────────────────────────────

function WorkflowListView({
  workflows,
  onEdit,
  onCreate,
  onToggleStatus,
  onDelete,
}: {
  workflows: Workflow[];
  onEdit: (wf: Workflow) => void;
  onCreate: () => void;
  onToggleStatus: (wf: Workflow) => void;
  onDelete: (wf: Workflow) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold gradient-text">Workflow Automations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automate actions based on lead events and schedules
          </p>
        </div>
        <PlanGate requiredPlan="pro" featureName="Workflow Builder" fallback={
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        }>
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        </PlanGate>
      </div>

      <Separator />

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="text-center py-12">
          <div className="relative inline-block mb-4">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <WorkflowIcon className="h-10 w-10 text-primary/30" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
            </div>
          </div>
          <h3 className="text-lg font-bold mb-1">No Workflows Yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
            Create your first automation to streamline your lead management process.
          </p>
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {workflows.map((wf) => {
              const TriggerIcon = TRIGGER_ICONS[wf.triggerType];
              const nodeCount = wf.nodes.length;
              const actionCount = wf.nodes.filter((n) => n.type === 'action').length;

              return (
                <motion.div
                  key={wf.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  layout
                >
                  <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-purple-500/40 card-glow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                          <WorkflowIcon className="h-5 w-5 text-purple-500" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold truncate">{wf.name}</p>
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', STATUS_STYLES[wf.status])}>
                              {wf.status.charAt(0).toUpperCase() + wf.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{wf.description}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <TriggerIcon className="h-3 w-3 text-purple-500" />
                              {TRIGGER_LABELS[wf.triggerType]}
                            </span>
                            <span className="flex items-center gap-1">
                              <Play className="h-3 w-3 text-cyan-500" />
                              {actionCount} action{actionCount !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                              <GitBranch className="h-3 w-3 text-amber-500" />
                              {nodeCount} step{nodeCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={wf.status === 'active'}
                            onCheckedChange={() => onToggleStatus(wf)}
                            aria-label={`Toggle ${wf.name}`}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(wf)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit Workflow
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDelete(wf)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete Workflow
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Workflow Editor View ─────────────────────────────────

function WorkflowEditorView({
  workflow,
  onSave,
  onCancel,
}: {
  workflow: Workflow | null;
  onSave: (wf: Workflow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [triggerType, setTriggerType] = useState<TriggerType>(workflow?.triggerType || 'lead_reply');
  const [nodes, setNodes] = useState<WorkflowNode[]>(workflow?.nodes || []);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addNodeIndex, setAddNodeIndex] = useState<number>(0);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const isNew = !workflow;

  const handleAddNode = (insertIndex?: number) => {
    setAddNodeIndex(insertIndex ?? nodes.length);
    setShowAddNode(true);
    setShowConfigPanel(true);
    setEditingNodeId(null);
  };

  const handleEditNode = (nodeId: string) => {
    setEditingNodeId(nodeId);
    setShowAddNode(false);
    setShowConfigPanel(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  const handleSaveNode = (node: WorkflowNode, insertIndex?: number) => {
    if (insertIndex !== undefined) {
      // Insert new node at index
      setNodes((prev) => {
        const updated = [...prev];
        updated.splice(insertIndex, 0, node);
        return updated;
      });
    } else if (editingNodeId) {
      // Update existing node
      setNodes((prev) => prev.map((n) => (n.id === editingNodeId ? node : n)));
    }
    setShowConfigPanel(false);
    setEditingNodeId(null);
    setShowAddNode(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Workflow name is required');
      return;
    }

    // Ensure the first node is a trigger node matching the trigger type
    const triggerNode: WorkflowNode = {
      id: nodes[0]?.id || `node-${Date.now()}`,
      type: 'trigger',
      title: TRIGGER_LABELS[triggerType],
      description: `Trigger: ${TRIGGER_LABELS[triggerType]}`,
      config: { triggerType },
    };

    const updatedNodes = [triggerNode, ...nodes.filter((n) => n.type !== 'trigger')];

    const savedWorkflow: Workflow = {
      id: workflow?.id || `wf-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      triggerType,
      triggerConfig: {},
      nodes: updatedNodes,
      status: workflow?.status || 'draft',
      createdAt: workflow?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(savedWorkflow);
  };

  const editingNode = useMemo(
    () => editingNodeId ? nodes.find((n) => n.id === editingNodeId) ?? null : null,
    [editingNodeId, nodes]
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Main editor area */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Editor header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onCancel}>
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Button>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name..."
              className="h-9 font-semibold border-primary/20"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1" onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>

        {/* Description */}
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this workflow does..."
          className="h-9 text-sm border-primary/10"
        />

        {/* Trigger type selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trigger</label>
          <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
            <SelectTrigger className="h-10 border-purple-500/20 bg-purple-500/5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TRIGGER_LABELS).map(([key, label]) => {
                const Icon = TRIGGER_ICONS[key as TriggerType];
                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-purple-500" />
                      {label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Node flow */}
        <div className="space-y-1">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flow Steps</label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-primary/20"
              onClick={() => handleAddNode(nodes.length)}
            >
              <Plus className="h-3 w-3" />
              Add Step
            </Button>
          </div>

          {/* Trigger node (always first) */}
          <Card className="border-l-4 border-l-purple-500 bg-purple-500/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{TRIGGER_LABELS[triggerType]}</p>
                  <p className="text-xs text-muted-foreground">This is the trigger event</p>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/20 text-purple-500 shrink-0">
                  Trigger
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Dynamic nodes */}
          {nodes.filter((n) => n.type !== 'trigger').length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="w-px h-6 border-l-2 border-dashed border-muted-foreground/30 mb-3" />
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-muted-foreground hover:text-primary"
                onClick={() => handleAddNode(1)}
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">Add your first step</span>
              </button>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {nodes
                .filter((n) => n.type !== 'trigger')
                .map((node, idx) => {
                  const realIndex = idx + 1; // +1 because trigger is at 0
                  return (
                    <FlowNode
                      key={node.id}
                      node={node}
                      isFirst={false}
                      isLast={realIndex === nodes.filter((n) => n.type !== 'trigger').length}
                      onEdit={() => handleEditNode(node.id)}
                      onDelete={() => handleDeleteNode(node.id)}
                    />
                  );
                })}
            </AnimatePresence>
          )}

          {/* Add node at the end */}
          {nodes.filter((n) => n.type !== 'trigger').length > 0 && (
            <div className="flex flex-col items-center pt-1">
              <div className="w-px h-4 border-l-2 border-dashed border-muted-foreground/30" />
              <button
                className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all duration-200"
                onClick={() => handleAddNode(nodes.length)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Config panel (right side on desktop, dialog on mobile) */}
      {showConfigPanel && (
        <>
          {/* Desktop panel */}
          <div className="hidden lg:block w-72 shrink-0">
            <Card className="sticky top-4">
              <CardContent className="p-4">
                <NodeConfigPanel
                  node={showAddNode ? null : editingNode}
                  isNew={showAddNode}
                  insertIndex={addNodeIndex}
                  onSave={handleSaveNode}
                  onCancel={() => {
                    setShowConfigPanel(false);
                    setEditingNodeId(null);
                    setShowAddNode(false);
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Mobile dialog */}
          <Dialog open={showConfigPanel} onOpenChange={(open) => {
            if (!open) {
              setShowConfigPanel(false);
              setEditingNodeId(null);
              setShowAddNode(false);
            }
          }}>
            <DialogContent className="lg:hidden max-w-sm">
              <DialogHeader className="sr-only">
                <DialogTitle>{showAddNode ? 'Add Node' : 'Edit Node'}</DialogTitle>
                <DialogDescription>Configure this workflow node</DialogDescription>
              </DialogHeader>
              <NodeConfigPanel
                node={showAddNode ? null : editingNode}
                isNew={showAddNode}
                insertIndex={addNodeIndex}
                onSave={handleSaveNode}
                onCancel={() => {
                  setShowConfigPanel(false);
                  setEditingNodeId(null);
                  setShowAddNode(false);
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function WorkflowBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow created');
    },
    onError: () => toast.error('Failed to create workflow'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Workflow> }) => updateWorkflow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow updated');
    },
    onError: () => toast.error('Failed to update workflow'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow deleted');
    },
    onError: () => toast.error('Failed to delete workflow'),
  });

  const handleCreate = useCallback(() => {
    setEditingWorkflow(null);
    setView('editor');
  }, []);

  const handleEdit = useCallback((wf: Workflow) => {
    setEditingWorkflow(wf);
    setView('editor');
  }, []);

  const handleSave = useCallback((wf: Workflow) => {
    if (editingWorkflow) {
      updateMutation.mutate({ id: editingWorkflow.id, data: wf });
    } else {
      createMutation.mutate(wf);
    }
    setView('list');
    setEditingWorkflow(null);
  }, [editingWorkflow, createMutation, updateMutation]);

  const handleCancel = useCallback(() => {
    setView('list');
    setEditingWorkflow(null);
  }, []);

  const handleToggleStatus = useCallback((wf: Workflow) => {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    updateMutation.mutate({ id: wf.id, data: { status: newStatus } });
  }, [updateMutation]);

  const handleDelete = useCallback((wf: Workflow) => {
    deleteMutation.mutate(wf.id);
  }, [deleteMutation]);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        setView('list');
        setEditingWorkflow(null);
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Workflow Automations</DialogTitle>
          <DialogDescription>Create and manage workflow automations</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[80vh]">
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Loading workflows...</span>
                </div>
              </div>
            ) : view === 'list' ? (
              <WorkflowListView
                workflows={workflows}
                onEdit={handleEdit}
                onCreate={handleCreate}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
              />
            ) : (
              <WorkflowEditorView
                workflow={editingWorkflow}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
