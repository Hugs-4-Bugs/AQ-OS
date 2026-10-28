// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agents Tab (Phase 26 v3 — Decision 13)
//
// Professional SaaS UI for the AI Agent system.
//
// Agent list shows: name, brain (provider+model), status, last run,
// next run, recent result, error state.
//
// Agent detail has logical sections:
//   1. General (name, description)
//   2. AI Brain (provider, model)
//   3. Tools (checkbox list with per-tool permission)
//   4. Permissions (approval policy)
//   5. Schedule (cron/interval/none)
//   6. Triggers (event-driven)
//   7. Memory (windowSize, maxTokens)
//   8. Execution History (AgentRun rows)
//   9. Activity (AgentActivity + AgentMemory)
//
// The UI makes the distinction clear:
//   Workflow = structured process
//   Agent = autonomous worker
//   Autopilot = scheduler
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Bot, Plus, Play, Pause, Trash2, Loader2, Activity, Clock,
  AlertCircle, CheckCircle2, XCircle, MessageSquare,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  classification: 'system' | 'custom';
  systemKey: string | null;
  modelStrategy: { strategy: string; models?: Array<{ provider?: string; model?: string; role?: string }>; concurrency?: number };
  memoryScopes: string[];
  executionState: string;
  provider: string;
  model: string;
  toolPermissions: Record<string, string>;
  schedule: { type: string; cron?: string; intervalSeconds?: number };
  triggers: Array<{ event: string; condition?: Record<string, unknown> }>;
  approvalPolicy: string;
  status: string;
  totalRuns: number;
  totalTokensUsed: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface Provider {
  id: string;
  label: string;
  defaultModel: string;
  available: boolean;
  source: string;
}

const ALL_TOOLS = [
  { name: 'lead.lookup', label: 'Lead Lookup', category: 'lead', defaultPerm: 'read' },
  { name: 'lead.create', label: 'Lead Create', category: 'lead', defaultPerm: 'read-write' },
  { name: 'lead.update', label: 'Lead Update', category: 'lead', defaultPerm: 'read-write' },
  { name: 'lead.enrich', label: 'Lead Enrich', category: 'lead', defaultPerm: 'read-write' },
  { name: 'workflow.status', label: 'Workflow Status', category: 'workflow', defaultPerm: 'read' },
  { name: 'task.create', label: 'Task Create', category: 'task', defaultPerm: 'read-write' },
  { name: 'message.draft', label: 'Message Draft', category: 'message', defaultPerm: 'read-write' },
  { name: 'profile.lookup', label: 'Profile Lookup', category: 'profile', defaultPerm: 'read' },
  { name: 'company.profile.lookup', label: 'Company Profile', category: 'profile', defaultPerm: 'read' },
  { name: 'activity.log', label: 'Activity Log', category: 'activity', defaultPerm: 'read-write' },
  { name: 'email.search', label: 'Email Search', category: 'email', defaultPerm: 'read' },
  { name: 'email.read', label: 'Email Read', category: 'email', defaultPerm: 'read' },
  { name: 'email.thread', label: 'Email Thread', category: 'email', defaultPerm: 'read' },
  { name: 'email.draft', label: 'Email Draft', category: 'email', defaultPerm: 'draft' },
  { name: 'email.reply', label: 'Email Reply', category: 'email', defaultPerm: 'send_with_approval' },
  { name: 'email.send', label: 'Email Send', category: 'email', defaultPerm: 'send_with_approval' },
];

export function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [aRes, pRes] = await Promise.all([
        fetch('/api/agents', { credentials: 'include' }),
        fetch('/api/integrations/ai-providers', { credentials: 'include' }),
      ]);
      if (aRes.ok) {
        const aData = await aRes.json();
        setAgents(aData.agents || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProviders(pData.providers || []);
      }
    } catch (err) {
      toast.error('Failed to load agents', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedAgent) {
    return <AgentDetail agent={selectedAgent} providers={providers} onBack={() => { setSelectedAgent(null); load(); }} />;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Agents
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous AI workers that reason, use approved tools, and respect per-tool permissions.
            Distinct from <strong>Workflows</strong> (deterministic processes) and <strong>Autopilot</strong> (scheduler).
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium">No agents yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Create an AI agent to autonomously handle lead discovery, outreach, email triage, follow-ups, and more.
              Connect an AI provider first in <strong>Settings → Integrations → AI Providers</strong>.
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create your first agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {agents.map(a => (
            <Card key={a.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedAgent(a)}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{a.name}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {a.classification === 'system' && (
                          <Badge variant="secondary" className="text-[10px] bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200">System</Badge>
                        )}
                        {a.classification === 'custom' && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                        {a.systemKey && (
                          <span className="text-[10px] text-muted-foreground font-mono">[{a.systemKey}]</span>
                        )}
                        {a.executionState && a.executionState !== 'idle' && (
                          <Badge variant="outline" className="text-[10px]">{a.executionState}</Badge>
                        )}
                      </div>
                      <div>Brain: <code className="text-foreground">{a.provider}/{a.model}</code>
                        {a.modelStrategy?.strategy && a.modelStrategy.strategy !== 'single' && (
                          <span className="text-[10px] text-cyan-700 dark:text-cyan-300 ml-1">({a.modelStrategy.strategy})</span>
                        )}
                      </div>
                      {a.objective && (
                        <div className="text-[10px] italic line-clamp-2 mt-0.5" title={a.objective}>{a.objective}</div>
                      )}
                      <div>Runs: {a.totalRuns} · Tokens: {a.totalTokensUsed.toLocaleString()}</div>
                      {a.lastRunAt && <div>Last run: {new Date(a.lastRunAt).toLocaleString()}</div>}
                      {a.lastError && <div className="text-red-600 dark:text-red-400">⚠ {a.lastError.slice(0, 80)}</div>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {Object.keys(a.toolPermissions).filter(k => a.toolPermissions[k] !== 'disabled').length} tools
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {a.approvalPolicy === 'autonomous' ? 'Autonomous' : 'Approval req.'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAgentModal
          providers={providers.filter(p => p.available)}
          onClose={() => setShowCreate(false)}
          onCreated={(newAgent) => {
            setShowCreate(false);
            load();
            toast.success('Agent created', { description: `${newAgent.name} — set status to "active" to enable runs` });
          }}
        />
      )}
    </div>
  );
}

// ─── Agent Detail ─────────────────────────────────────────────────────

function AgentDetail({ agent, providers, onBack }: { agent: Agent; providers: Provider[]; onBack: () => void }) {
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [initialPrompt, setInitialPrompt] = useState('');

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agent.id}/runs`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch { /* non-fatal */ }
  }, [agent.id]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ initialPrompt: initialPrompt.trim() || undefined }),
      });
      const data = await res.json();
      if (data.run?.status === 'completed') {
        toast.success('Agent run completed', {
          description: `${data.run.iterationsUsed} iterations, ${data.run.toolsCalled} tool calls, ${data.run.tokensUsed} tokens`,
        });
      } else if (data.run?.status === 'paused_awaiting_approval') {
        toast.info('Agent paused', { description: data.run.error });
      } else {
        toast.error(`Run ${data.run?.status}`, { description: data.run?.error });
      }
      loadRuns();
    } catch (err) {
      toast.error('Run failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  };

  const handleToggleStatus = async () => {
    const next = agent.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        toast.success(`Agent ${next}`);
        onBack();
      } else {
        toast.error('Status update failed');
      }
    } catch (err) {
      toast.error('Status update failed', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  // Handle approve/reject for paused-awaiting-approval runs.
  // The approvalId is embedded in the run's error string by the agent runtime:
  // "Paused awaiting human approval for email.send (approvalId=abc123)"
  const handleApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/agents/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Approval ${decision}d`, { description: data.message || 'Decision processed' });
        loadRuns(); // refresh the execution history
      } else {
        toast.error('Approval failed', { description: data.error || 'Unknown error' });
      }
    } catch (err) {
      toast.error('Approval failed', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back to agents</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {agent.status === 'active' ? <><Pause className="h-3 w-3 mr-1" /> Pause</> : <><Play className="h-3 w-3 mr-1" /> Activate</>}
          </Button>
          <Button size="sm" disabled={running || agent.status !== 'active'} onClick={handleRun}>
            {running ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running...</> : <><Play className="h-3 w-3 mr-1" /> Run now</>}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> {agent.name}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Description</Label>
            <p className="text-sm text-muted-foreground mt-1">{agent.description || '(no description)'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">AI Brain (single model)</Label>
              <div className="text-sm mt-1"><code>{agent.provider}/{agent.model}</code></div>
            </div>
            <div>
              <Label className="text-xs">Approval Policy</Label>
              <div className="text-sm mt-1">{agent.approvalPolicy === 'autonomous' ? 'Autonomous' : 'Approval required for risky actions'}</div>
            </div>
          </div>
          <div>
            <Label className="text-xs">Initial Task (for manual run)</Label>
            <Textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="e.g., Find 5 qualified restaurant leads in Singapore, research them, and draft outreach."
              className="min-h-[60px] mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Tools & Permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {ALL_TOOLS.map(t => {
              const perm = agent.toolPermissions[t.name];
              const enabled = perm && perm !== 'disabled';
              return (
                <div key={t.name} className={`flex items-center gap-2 p-1.5 rounded border ${enabled ? 'border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/20' : 'border-muted opacity-60'}`}>
                  <Checkbox checked={enabled} disabled />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.label}</div>
                    <div className="text-[10px] text-muted-foreground">{t.name} · {perm || 'disabled'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule & Triggers</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm space-y-1">
            <div>Schedule: <code>{agent.schedule?.type || 'none'}</code>
              {agent.schedule?.cron && <span className="ml-2 text-muted-foreground">cron: {agent.schedule.cron}</span>}
              {agent.schedule?.intervalSeconds && <span className="ml-2 text-muted-foreground">every {agent.schedule.intervalSeconds}s</span>}
            </div>
            <div>Triggers: {agent.triggers?.length || 0} configured</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Execution History</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 10).map((r) => (
                <div key={r.id as string} className="text-xs border-l-2 pl-2 py-1" style={{ borderColor: r.status === 'completed' ? '#10b981' : r.status === 'failed' ? '#ef4444' : '#6b7280' }}>
                  <div className="flex justify-between">
                    <span className="font-medium">{r.status as string}</span>
                    <span className="text-muted-foreground">{new Date(r.createdAt as string).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {r.iterationsUsed as number} iter · {r.toolsCalled as number} tools · {r.tokensUsed as number} tokens
                  </div>
                  {r.error && <div className="text-red-600 dark:text-red-400 mt-0.5">{r.error as string}</div>}
                  {r.status === 'paused_awaiting_approval' && (() => {
                    const approvalId = (r.error as string)?.match(/approvalId=([a-zA-Z0-9_-]+)/)?.[1];
                    return approvalId ? (
                      <div className="flex gap-2 mt-1">
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleApproval(approvalId, 'approve')}>✓ Approve</Button>
                        <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleApproval(approvalId, 'reject')}>✗ Reject</Button>
                      </div>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Create Agent Modal ──────────────────────────────────────────────

function CreateAgentModal({ providers, onClose, onCreated }: {
  providers: Provider[];
  onClose: () => void;
  onCreated: (a: Agent) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState(providers[0]?.id || 'z-ai');
  const [model, setModel] = useState(providers[0]?.defaultModel || 'glm-4.6');
  const [toolPermissions, setToolPermissions] = useState<Record<string, string>>({});
  const [approvalPolicy, setApprovalPolicy] = useState<'approval_required' | 'autonomous'>('approval_required');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (providers.length === 0) { toast.error('No AI providers available. Connect one in Settings → Integrations first.'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name, description, provider, model, toolPermissions, approvalPolicy,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.agent);
      } else {
        toast.error('Create failed', { description: data.error });
      }
    } catch (err) {
      toast.error('Create failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader><CardTitle className="text-base">Create AI Agent</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Lead Outreach Agent" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" className="mt-1 min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">AI Brain (single provider)</Label>
              <Select value={provider} onValueChange={(v) => {
                setProvider(v);
                const p = providers.find(p => p.id === v);
                setModel(p?.defaultModel || '');
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label} ({p.source})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Approval Policy</Label>
            <Select value={approvalPolicy} onValueChange={(v) => setApprovalPolicy(v as never)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approval_required">Approval required — pause before risky actions (email.send, lead.update)</SelectItem>
                <SelectItem value="autonomous">Autonomous — execute all allowed tools without pausing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tools (per-tool permission)</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1 max-h-60 overflow-y-auto">
              {ALL_TOOLS.map(t => {
                const checked = !!toolPermissions[t.name];
                return (
                  <div key={t.name} className="flex items-center gap-2 p-1.5 rounded border">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setToolPermissions(prev => {
                          const next = { ...prev };
                          if (v) next[t.name] = t.defaultPerm;
                          else delete next[t.name];
                          return next;
                        });
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground">{t.defaultPerm}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating...</> : 'Create agent'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    active: { color: 'bg-green-600', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
    paused: { color: 'bg-amber-500', icon: <Pause className="h-3 w-3 mr-1" /> },
    draft: { color: 'bg-gray-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
    disabled: { color: 'bg-red-600', icon: <XCircle className="h-3 w-3 mr-1" /> },
  };
  const m = map[status] || map.draft;
  return <Badge className={`text-xs ${m.color}`}>{m.icon} {status}</Badge>;
}
