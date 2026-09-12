'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  ShieldOff,
  ShieldCheck,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  Zap,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Shield,
  MoreHorizontal,
  BarChart3,
  Activity,
  FileCode,
  TrendingUp,
  ArrowUpRight,
  Server,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

// ===== TYPES =====

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  scopes: string[];
  status: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  rateLimitPerHour: number;
  createdAt: string;
  updatedAt: string;
}

interface AnalyticsSummary {
  totalKeys: number;
  activeKeys: number;
  requests24h: number;
  requests7d: number;
  requests30d: number;
  errors24h: number;
  errors7d: number;
  avgResponseTime: number;
  errorRate24h: number;
  errorRate7d: number;
}

interface EndpointUsageItem {
  endpoint: string;
  count: number;
}

interface MethodUsageItem {
  method: string;
  count: number;
}

interface StatusBreakdownItem {
  statusCode: number;
  count: number;
}

interface DailyUsageItem {
  date: string;
  requests: number;
  errors: number;
}

interface PerKeyStat {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  status: string;
  lastUsedAt: string | null;
  usage24h: number;
  usage7d: number;
  usage30d: number;
  rateLimitPerHour: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  endpointUsage: EndpointUsageItem[];
  methodUsage: MethodUsageItem[];
  statusBreakdown: StatusBreakdownItem[];
  dailyUsage: DailyUsageItem[];
  perKeyStats: PerKeyStat[];
}

interface DocsEndpoint {
  method: string;
  path: string;
  scope: string;
  description: string;
}

interface DocsData {
  version: string;
  baseUrl: string;
  authentication: {
    type: string;
    header: string;
    description: string;
    keyFormats: { live: string; test: string };
  };
  endpoints: Record<string, Record<string, DocsEndpoint>>;
  examples: {
    curl: Record<string, string>;
    javascript: Record<string, string>;
    python: Record<string, string>;
    postman: Record<string, unknown>;
  };
  rateLimits: {
    default: string;
    burst: string;
    headers: Record<string, string>;
  };
  errors: Record<number, { description: string; code: string }>;
}

const API_KEY_SCOPES = [
  { value: 'leads.read', label: 'Leads — Read', description: 'View leads data' },
  { value: 'leads.write', label: 'Leads — Write', description: 'Create and modify leads' },
  { value: 'workflows.read', label: 'Workflows — Read', description: 'View workflows' },
  { value: 'workflows.write', label: 'Workflows — Write', description: 'Create and modify workflows' },
  { value: 'ai.read', label: 'AI — Read', description: 'View AI analysis results' },
  { value: 'ai.write', label: 'AI — Write', description: 'Trigger AI analysis' },
  { value: 'billing.read', label: 'Billing — Read', description: 'View billing information' },
  { value: 'analytics.read', label: 'Analytics — Read', description: 'View analytics data' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access' },
] as const;

const EXPIRATION_OPTIONS = [
  { value: '', label: 'Never' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '365d', label: '1 year' },
];

// ===== MAIN COMPONENT =====

export default function ApiKeysPanel() {
  const queryClient = useQueryClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('keys');

  // State
  const [createOpen, setCreateOpen] = useState(false);
  const [revealKeyOpen, setRevealKeyOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedKeyName, setRevealedKeyName] = useState('');
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedKeyName, setSelectedKeyName] = useState('');

  // Create form state
  const [formName, setFormName] = useState('');
  const [formEnvironment, setFormEnvironment] = useState<'live' | 'test'>('live');
  const [formScopes, setFormScopes] = useState<string[]>(['leads.read']);
  const [formExpiration, setFormExpiration] = useState('');
  const [formRateLimit, setFormRateLimit] = useState(1000);

  // Fetch API keys
  const { data: keysData, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch API keys');
      return res.json() as Promise<{ apiKeys: ApiKeyData[] }>;
    },
    staleTime: 10 * 1000,
  });

  // Fetch analytics data
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['api-keys-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/analytics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json() as Promise<AnalyticsData>;
    },
    staleTime: 30 * 1000,
    enabled: activeTab === 'analytics',
  });

  // Fetch docs data
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['api-keys-docs'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/docs', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch docs');
      return res.json() as Promise<DocsData>;
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'docs',
  });

  const apiKeys = keysData?.apiKeys ?? [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      environment: string;
      scopes: string[];
      expiresAt?: string;
      rateLimitPerHour: number;
    }) => {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create key' }));
        throw new Error(err.error || 'Failed to create key');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreateOpen(false);
      resetForm();
      // Show the raw key
      setRevealedKey(data.apiKey.key);
      setRevealedKeyName(data.apiKey.name);
      setRevealKeyOpen(true);
      toast.success('API key created successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create API key');
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to revoke key');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setRevokeConfirmOpen(false);
      toast.success('API key revoked');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete key');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setDeleteConfirmOpen(false);
      toast.success('API key deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Rotate mutation
  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}/rotate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to rotate key');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setRotateConfirmOpen(false);
      setRevealedKey(data.apiKey.key);
      setRevealedKeyName(data.apiKey.name);
      setRevealKeyOpen(true);
      toast.success('API key rotated! New key shown below.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Enable/Disable mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'enable' | 'disable' }) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Failed to ${action} key`);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success(`API key ${variables.action === 'enable' ? 'enabled' : 'disabled'}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Helpers
  const resetForm = useCallback(() => {
    setFormName('');
    setFormEnvironment('live');
    setFormScopes(['leads.read']);
    setFormExpiration('');
    setFormRateLimit(1000);
  }, []);

  const handleCreate = useCallback(() => {
    if (!formName.trim()) {
      toast.error('Enter a key name');
      return;
    }
    if (formScopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    let expiresAt: string | undefined;
    if (formExpiration) {
      const days = parseInt(formExpiration.replace('d', ''));
      const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      expiresAt = date.toISOString();
    }

    createMutation.mutate({
      name: formName.trim(),
      environment: formEnvironment,
      scopes: formScopes,
      expiresAt,
      rateLimitPerHour: formRateLimit,
    });
  }, [formName, formEnvironment, formScopes, formExpiration, formRateLimit, createMutation]);

  const toggleScope = useCallback((scope: string) => {
    setFormScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  }, []);

  const downloadKey = useCallback((key: string, name: string) => {
    const content = `AcquisitionOS API Key\nName: ${name}\nKey: ${key}\nCreated: ${new Date().toISOString()}\n\nIMPORTANT: Store this key securely. It will not be shown again.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acquisitionos-${name.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Key downloaded');
  }, []);

  const getStatusBadge = useCallback((status: string, expiresAt: string | null) => {
    // Check if expired
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Expired</Badge>;
    }
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>;
      case 'disabled':
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Disabled</Badge>;
      case 'revoked':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }, []);

  const formatDate = useCallback((date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  const formatRelativeTime = useCallback((date: string | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }, []);

  // ===== COLOR HELPERS =====
  const getErrorRateColor = useCallback((rate: number) => {
    if (rate >= 10) return 'text-red-600';
    if (rate >= 5) return 'text-amber-600';
    return 'text-emerald-600';
  }, []);

  const getErrorRateBg = useCallback((rate: number) => {
    if (rate >= 10) return 'bg-red-500/10 border-red-500/20';
    if (rate >= 5) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-emerald-500/10 border-emerald-500/20';
  }, []);

  const getResponseTimeColor = useCallback((ms: number) => {
    if (ms >= 500) return 'text-red-600';
    if (ms >= 200) return 'text-amber-600';
    return 'text-emerald-600';
  }, []);

  const getResponseTimeBg = useCallback((ms: number) => {
    if (ms >= 500) return 'bg-red-500/10 border-red-500/20';
    if (ms >= 200) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-emerald-500/10 border-emerald-500/20';
  }, []);

  const getUtilizationColor = useCallback((pct: number) => {
    if (pct >= 80) return 'bg-red-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-emerald-500';
  }, []);

  const getUtilizationTextColor = useCallback((pct: number) => {
    if (pct >= 80) return 'text-red-600';
    if (pct >= 50) return 'text-amber-600';
    return 'text-emerald-600';
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10">
              <Key className="h-4 w-4 text-purple-500" />
            </div>
            API Keys
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys for programmatic access to AcquisitionOS
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href="/api-docs" target="_blank" rel="noopener noreferrer">
              <FileCode className="h-4 w-4 mr-1.5" />
              View API Docs
              <ExternalLink className="h-3 w-3 ml-1 text-muted-foreground" />
            </a>
          </Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create API Key
          </Button>
        </div>
      </div>

      {/* Tab Toggle */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="keys" className="gap-1.5">
            <Key className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">API Keys</span>
            <span className="sm:hidden">Keys</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Usage Analytics</span>
            <span className="sm:hidden">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5">
            <FileCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Documentation</span>
            <span className="sm:hidden">Docs</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ API KEYS TAB ═══════════ */}
        <TabsContent value="keys" className="space-y-6 mt-4">
          {/* Key Format Info */}
          <Card className="border-purple-500/10 bg-purple-500/[0.02]">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <span className="font-mono text-purple-600 dark:text-purple-400">aq_live_</span> keys work with real data.{' '}
                    <span className="font-mono text-purple-600 dark:text-purple-400">aq_test_</span> keys work in sandbox mode.
                  </p>
                  <p>Use the key as a Bearer token: <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Authorization: Bearer aq_live_xxxxx</code></p>
                  <p className="text-amber-600 dark:text-amber-400">API keys are shown only once. Store them securely — they cannot be retrieved again.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Keys List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Key className="h-7 w-7 text-purple-500" />
                </div>
                <p className="font-medium text-sm mb-1">No API keys yet</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                  Create an API key to access AcquisitionOS programmatically.
                  Keys support scoped permissions and rate limiting.
                </p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create API Key
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((apiKey) => (
                <Card
                  key={apiKey.id}
                  className={`border transition-colors ${
                    apiKey.status === 'revoked'
                      ? 'border-red-500/20 bg-red-500/[0.01]'
                      : apiKey.status === 'disabled'
                      ? 'border-gray-500/20 bg-gray-500/[0.01]'
                      : 'border-purple-500/10'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Key Info */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                          apiKey.status === 'active'
                            ? 'bg-emerald-500/10'
                            : apiKey.status === 'revoked'
                            ? 'bg-red-500/10'
                            : 'bg-gray-500/10'
                        }`}>
                          <Key className={`h-5 w-5 ${
                            apiKey.status === 'active'
                              ? 'text-emerald-500'
                              : apiKey.status === 'revoked'
                              ? 'text-red-500'
                              : 'text-gray-500'
                          }`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{apiKey.name}</p>
                            {getStatusBadge(apiKey.status, apiKey.expiresAt)}
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {apiKey.environment === 'live' ? '🔴' : '🟡'} {apiKey.environment}
                            </Badge>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{apiKey.keyPrefix}••••••••</p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Created {formatDate(apiKey.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              Last used {formatRelativeTime(apiKey.lastUsedAt)}
                            </span>
                            {apiKey.expiresAt && (
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Expires {formatDate(apiKey.expiresAt)}
                              </span>
                            )}
                          </div>
                          {/* Scopes */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {apiKey.scopes.slice(0, 4).map((scope) => (
                              <Badge key={scope} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                                {scope}
                              </Badge>
                            ))}
                            {apiKey.scopes.length > 4 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 cursor-help">
                                      +{apiKey.scopes.length - 4} more
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      {apiKey.scopes.slice(4).map((s) => (
                                        <div key={s}>{s}</div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {apiKey.rateLimitPerHour.toLocaleString()}/hr
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => copyToClipboard(apiKey.keyPrefix)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy prefix</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {apiKey.status === 'active' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedKeyId(apiKey.id);
                                  setSelectedKeyName(apiKey.name);
                                  setRotateConfirmOpen(true);
                                }}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Rotate key
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toggleMutation.mutate({ id: apiKey.id, action: 'disable' })}
                              >
                                <ShieldOff className="h-4 w-4 mr-2" />
                                Disable
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => {
                                  setSelectedKeyId(apiKey.id);
                                  setSelectedKeyName(apiKey.name);
                                  setRevokeConfirmOpen(true);
                                }}
                              >
                                <ShieldOff className="h-4 w-4 mr-2" />
                                Revoke
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {(apiKey.status === 'disabled') && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => toggleMutation.mutate({ id: apiKey.id, action: 'enable' })}
                              >
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Enable
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedKeyId(apiKey.id);
                                  setSelectedKeyName(apiKey.name);
                                  setRotateConfirmOpen(true);
                                }}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Rotate key
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => {
                                  setSelectedKeyId(apiKey.id);
                                  setSelectedKeyName(apiKey.name);
                                  setRevokeConfirmOpen(true);
                                }}
                              >
                                <ShieldOff className="h-4 w-4 mr-2" />
                                Revoke
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {apiKey.status === 'revoked' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                  onClick={() => {
                                    setSelectedKeyId(apiKey.id);
                                    setSelectedKeyName(apiKey.name);
                                    setDeleteConfirmOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete permanently</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ USAGE ANALYTICS TAB ═══════════ */}
        <TabsContent value="analytics" className="space-y-6 mt-4">
          {analyticsLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 rounded-lg bg-muted/50 animate-pulse" />
                ))}
              </div>
              <div className="h-64 rounded-lg bg-muted/50 animate-pulse" />
              <div className="h-48 rounded-lg bg-muted/50 animate-pulse" />
            </div>
          ) : !analyticsData ? (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <BarChart3 className="h-7 w-7 text-purple-500" />
                </div>
                <p className="font-medium text-sm mb-1">No analytics data yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Analytics will appear once your API keys start receiving requests.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Requests Card */}
                <Card className="border-purple-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-purple-500" />
                      </div>
                      <span className="text-xs text-muted-foreground">Total Requests</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">{analyticsData.summary.requests24h.toLocaleString()}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>24h</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>7d: {analyticsData.summary.requests7d.toLocaleString()}</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>30d: {analyticsData.summary.requests30d.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Error Rate Card */}
                <Card className={`border ${getErrorRateBg(analyticsData.summary.errorRate24h)}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        analyticsData.summary.errorRate24h >= 10
                          ? 'bg-red-500/10'
                          : analyticsData.summary.errorRate24h >= 5
                          ? 'bg-amber-500/10'
                          : 'bg-emerald-500/10'
                      }`}>
                        <AlertCircle className={`h-4 w-4 ${
                          analyticsData.summary.errorRate24h >= 10
                            ? 'text-red-500'
                            : analyticsData.summary.errorRate24h >= 5
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                        }`} />
                      </div>
                      <span className="text-xs text-muted-foreground">Error Rate</span>
                    </div>
                    <div className="space-y-1">
                      <p className={`text-2xl font-bold ${getErrorRateColor(analyticsData.summary.errorRate24h)}`}>
                        {analyticsData.summary.errorRate24h}%
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{analyticsData.summary.errors24h} errors (24h)</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>7d: {analyticsData.summary.errorRate7d}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Avg Response Time Card */}
                <Card className={`border ${getResponseTimeBg(analyticsData.summary.avgResponseTime)}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        analyticsData.summary.avgResponseTime >= 500
                          ? 'bg-red-500/10'
                          : analyticsData.summary.avgResponseTime >= 200
                          ? 'bg-amber-500/10'
                          : 'bg-emerald-500/10'
                      }`}>
                        <Clock className={`h-4 w-4 ${
                          analyticsData.summary.avgResponseTime >= 500
                            ? 'text-red-500'
                            : analyticsData.summary.avgResponseTime >= 200
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                        }`} />
                      </div>
                      <span className="text-xs text-muted-foreground">Avg Response</span>
                    </div>
                    <div className="space-y-1">
                      <p className={`text-2xl font-bold ${getResponseTimeColor(analyticsData.summary.avgResponseTime)}`}>
                        {analyticsData.summary.avgResponseTime}ms
                      </p>
                      <div className="text-[11px] text-muted-foreground">
                        {analyticsData.summary.avgResponseTime < 200
                          ? 'Excellent response time'
                          : analyticsData.summary.avgResponseTime < 500
                          ? 'Acceptable response time'
                          : 'Slow — consider optimizing'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Active Keys Card */}
                <Card className="border-purple-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Key className="h-4 w-4 text-purple-500" />
                      </div>
                      <span className="text-xs text-muted-foreground">Active Keys</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">
                        <span className="text-emerald-600">{analyticsData.summary.activeKeys}</span>
                        <span className="text-muted-foreground text-base font-normal"> / {analyticsData.summary.totalKeys}</span>
                      </p>
                      <div className="text-[11px] text-muted-foreground">
                        {analyticsData.summary.activeKeys === analyticsData.summary.totalKeys
                          ? 'All keys active'
                          : `${analyticsData.summary.totalKeys - analyticsData.summary.activeKeys} inactive`}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Usage Chart */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                    Daily Usage (Last 14 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {analyticsData.dailyUsage.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                      No usage data available yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Chart area */}
                      <div className="flex items-end gap-1 h-48">
                        {(() => {
                          const maxRequests = Math.max(...analyticsData.dailyUsage.map((d) => d.requests), 1);
                          return analyticsData.dailyUsage.map((day, i) => {
                            const heightPct = (day.requests / maxRequests) * 100;
                            const errorHeightPct = day.requests > 0 ? (day.errors / day.requests) * 100 : 0;
                            return (
                              <TooltipProvider key={day.date}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer">
                                      <div className="relative w-full flex flex-col justify-end" style={{ height: `${Math.max(heightPct, 2)}%` }}>
                                        {/* Error overlay at top of bar */}
                                        {day.errors > 0 && (
                                          <div
                                            className="w-full bg-red-400 rounded-t-sm min-h-[2px]"
                                            style={{ height: `${Math.max(errorHeightPct, 8)}%` }}
                                          />
                                        )}
                                        {/* Main bar */}
                                        <div className="w-full bg-purple-400 group-hover:bg-purple-500 transition-colors rounded-t-sm flex-1" />
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <div className="font-medium">{new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                    <div>{day.requests} requests</div>
                                    {day.errors > 0 && <div className="text-red-400">{day.errors} errors</div>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          });
                        })()}
                      </div>
                      {/* Date labels */}
                      <div className="flex gap-1">
                        {analyticsData.dailyUsage.map((day, i) => (
                          <div key={day.date} className="flex-1 text-center">
                            <span className="text-[9px] text-muted-foreground">
                              {i % 2 === 0
                                ? new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })
                                : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 pt-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="h-2.5 w-2.5 rounded-sm bg-purple-400" />
                          Requests
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                          Errors
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Endpoint Usage + Method/Status side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Endpoint Usage */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Server className="h-4 w-4 text-purple-500" />
                      Top Endpoints (30d)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {analyticsData.endpointUsage.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                        No endpoint data yet
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {analyticsData.endpointUsage.slice(0, 10).map((ep) => {
                          const maxCount = analyticsData.endpointUsage[0]?.count || 1;
                          const pct = (ep.count / maxCount) * 100;
                          return (
                            <div key={ep.endpoint} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <code className="font-mono text-muted-foreground truncate mr-2">{ep.endpoint}</code>
                                <span className="font-medium shrink-0">{ep.count.toLocaleString()}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status Code Breakdown */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4 text-purple-500" />
                      Status Codes (7d)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {analyticsData.statusBreakdown.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                        No status data yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {analyticsData.statusBreakdown.map((s) => {
                          const total = analyticsData.statusBreakdown.reduce((sum, x) => sum + x.count, 0) || 1;
                          const pct = Math.round((s.count / total) * 100);
                          const isSuccess = s.statusCode < 400;
                          const isClientError = s.statusCode >= 400 && s.statusCode < 500;
                          return (
                            <div key={s.statusCode} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`font-mono text-[10px] px-1.5 ${
                                      isSuccess
                                        ? 'border-emerald-500/30 text-emerald-600'
                                        : isClientError
                                        ? 'border-amber-500/30 text-amber-600'
                                        : 'border-red-500/30 text-red-600'
                                    }`}
                                  >
                                    {s.statusCode}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    {s.statusCode === 200 ? 'OK'
                                      : s.statusCode === 201 ? 'Created'
                                      : s.statusCode === 400 ? 'Bad Request'
                                      : s.statusCode === 401 ? 'Unauthorized'
                                      : s.statusCode === 403 ? 'Forbidden'
                                      : s.statusCode === 404 ? 'Not Found'
                                      : s.statusCode === 429 ? 'Rate Limited'
                                      : s.statusCode >= 500 ? 'Server Error'
                                      : 'Other'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{s.count.toLocaleString()}</span>
                                  <span className="text-muted-foreground text-[10px]">({pct}%)</span>
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isSuccess ? 'bg-emerald-500' : isClientError ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Per-Key Stats Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4 text-purple-500" />
                    Per-Key Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {analyticsData.perKeyStats.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                      No key statistics available
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Key</th>
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Env</th>
                            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">24h</th>
                            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">7d</th>
                            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">30d</th>
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Rate Limit Utilization</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.perKeyStats.map((key) => {
                            // Estimate hourly rate from 24h usage
                            const estimatedHourly = Math.round(key.usage24h / 24);
                            const utilizationPct = key.rateLimitPerHour > 0
                              ? Math.min(Math.round((estimatedHourly / key.rateLimitPerHour) * 100), 100)
                              : 0;
                            return (
                              <tr key={key.id} className="border-b last:border-0">
                                <td className="py-2.5 pr-4">
                                  <div>
                                    <p className="font-medium truncate max-w-[140px]">{key.name}</p>
                                    <p className="font-mono text-[10px] text-muted-foreground">{key.keyPrefix}••••</p>
                                  </div>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    {key.environment === 'live' ? '🔴' : '🟡'} {key.environment}
                                  </Badge>
                                </td>
                                <td className="py-2.5 pr-4 text-right font-mono">{key.usage24h.toLocaleString()}</td>
                                <td className="py-2.5 pr-4 text-right font-mono">{key.usage7d.toLocaleString()}</td>
                                <td className="py-2.5 pr-4 text-right font-mono">{key.usage30d.toLocaleString()}</td>
                                <td className="py-2.5 pr-4">
                                  <div className="flex items-center gap-2 min-w-[120px]">
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${getUtilizationColor(utilizationPct)}`}
                                        style={{ width: `${utilizationPct}%` }}
                                      />
                                    </div>
                                    <span className={`font-mono text-[10px] w-8 text-right ${getUtilizationTextColor(utilizationPct)}`}>
                                      {utilizationPct}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5">
                                  {getStatusBadge(key.status, null)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════ DOCUMENTATION TAB ═══════════ */}
        <TabsContent value="docs" className="space-y-6 mt-4">
          {docsLoading ? (
            <div className="space-y-4">
              <div className="h-40 rounded-lg bg-muted/50 animate-pulse" />
              <div className="h-64 rounded-lg bg-muted/50 animate-pulse" />
              <div className="h-48 rounded-lg bg-muted/50 animate-pulse" />
            </div>
          ) : !docsData ? (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <FileCode className="h-7 w-7 text-purple-500" />
                </div>
                <p className="font-medium text-sm mb-1">Documentation unavailable</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Could not load API documentation. Please try again later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Authentication Section */}
              <Card className="border-purple-500/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    Authentication
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <p className="text-xs text-muted-foreground">{docsData.authentication.description}</p>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-[10px] text-muted-foreground mb-1">Authorization Header</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono flex-1 select-all">{docsData.authentication.header}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => copyToClipboard(docsData.authentication.header)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-[10px] font-medium text-emerald-600 mb-1">Live Key Format</p>
                      <code className="text-[11px] font-mono text-muted-foreground">{docsData.authentication.keyFormats.live}</code>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-[10px] font-medium text-amber-600 mb-1">Test Key Format</p>
                      <code className="text-[11px] font-mono text-muted-foreground">{docsData.authentication.keyFormats.test}</code>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Endpoint Catalog */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4 text-purple-500" />
                    Endpoint Catalog
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Method</th>
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Path</th>
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Scope</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(docsData.endpoints).map(([category, endpoints]) => (
                          <React.Fragment key={category}>
                            <tr>
                              <td colSpan={4} className="pt-3 pb-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600">
                                  {category}
                                </span>
                              </td>
                            </tr>
                            {Object.entries(endpoints).map(([name, ep]) => (
                              <tr key={name} className="border-b last:border-0">
                                <td className="py-2 pr-3">
                                  <Badge
                                    variant="outline"
                                    className={`font-mono text-[10px] px-1.5 ${
                                      ep.method === 'GET'
                                        ? 'border-emerald-500/30 text-emerald-600'
                                        : 'border-amber-500/30 text-amber-600'
                                    }`}
                                  >
                                    {ep.method}
                                  </Badge>
                                </td>
                                <td className="py-2 pr-3">
                                  <code className="font-mono text-muted-foreground">{ep.path}</code>
                                </td>
                                <td className="py-2 pr-3">
                                  <Badge variant="outline" className="text-[10px] px-1.5">
                                    {ep.scope}
                                  </Badge>
                                </td>
                                <td className="py-2 text-muted-foreground">{ep.description}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Code Examples */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-purple-500" />
                    Code Examples
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <CodeExamples docsData={docsData} copyToClipboard={copyToClipboard} />
                </CardContent>
              </Card>

              {/* Rate Limits */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    Rate Limits
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-[10px] text-muted-foreground mb-1">Default Limit</p>
                      <p className="text-sm font-medium">{docsData.rateLimits.default}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-[10px] text-muted-foreground mb-1">Burst Limit</p>
                      <p className="text-sm font-medium">{docsData.rateLimits.burst}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2">Response Headers</p>
                    <div className="space-y-1.5">
                      {Object.entries(docsData.rateLimits.headers).map(([header, desc]) => (
                        <div key={header} className="flex items-start gap-3 text-xs">
                          <code className="font-mono text-purple-600 dark:text-purple-400 shrink-0 min-w-[160px]">{header}</code>
                          <span className="text-muted-foreground">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Error Codes */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-purple-500" />
                    Error Codes Reference
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Code</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Error</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(docsData.errors).map(([code, info]) => (
                          <tr key={code} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <Badge
                                variant="outline"
                                className={`font-mono text-[10px] px-1.5 ${
                                  parseInt(code) >= 500
                                    ? 'border-red-500/30 text-red-600'
                                    : parseInt(code) >= 400
                                    ? 'border-amber-500/30 text-amber-600'
                                    : 'border-emerald-500/30 text-emerald-600'
                                }`}
                              >
                                {code}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4">
                              <code className="font-mono text-muted-foreground">{info.code}</code>
                            </td>
                            <td className="py-2 text-muted-foreground">{info.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════ CREATE API KEY DIALOG ═══════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="sm:max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto w-[calc(100%-2rem)] sm:w-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-purple-500" />
              Create API Key
            </DialogTitle>
            <DialogDescription>
              Generate a new API key. The key will be shown only once — store it securely.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Key Name</Label>
              <Input
                placeholder="e.g. Production Backend, CI/CD Pipeline"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={50}
                className="border-purple-500/20 focus:ring-purple-500/30"
              />
              <p className="text-xs text-muted-foreground">Helps you identify this key later</p>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Environment</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formEnvironment === 'live' ? 'default' : 'outline'}
                  className={formEnvironment === 'live' ? 'bg-purple-600 hover:bg-purple-700 text-white flex-1' : 'flex-1 border-purple-500/20'}
                  onClick={() => setFormEnvironment('live')}
                >
                  🔴 Live
                </Button>
                <Button
                  type="button"
                  variant={formEnvironment === 'test' ? 'default' : 'outline'}
                  className={formEnvironment === 'test' ? 'bg-purple-600 hover:bg-purple-700 text-white flex-1' : 'flex-1 border-purple-500/20'}
                  onClick={() => setFormEnvironment('test')}
                >
                  🟡 Test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formEnvironment === 'live'
                  ? 'Live keys interact with real data'
                  : 'Test keys use sandbox mode — no real data affected'}
              </p>
            </div>

            {/* Scopes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Permissions (Scopes)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {API_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-xs ${
                      formScopes.includes(scope.value)
                        ? 'border-purple-500/40 bg-purple-500/5'
                        : 'border-border hover:border-purple-500/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-purple-600"
                      checked={formScopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                    />
                    <div>
                      <p className="font-medium">{scope.label}</p>
                      <p className="text-muted-foreground text-[10px]">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Expiration */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Expiration</Label>
              <Select value={formExpiration} onValueChange={setFormExpiration}>
                <SelectTrigger className="border-purple-500/20 focus:ring-purple-500/30">
                  <SelectValue placeholder="Select expiration" />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || 'never'} value={opt.value || 'never'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rate Limit */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Rate Limit (requests/hour)
              </Label>
              <Input
                type="number"
                min={100}
                max={10000}
                value={formRateLimit}
                onChange={(e) => setFormRateLimit(parseInt(e.target.value) || 1000)}
                className="border-purple-500/20 focus:ring-purple-500/30"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleCreate}
              disabled={createMutation.isPending || !formName.trim() || formScopes.length === 0}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ REVEAL KEY DIALOG ═══════════ */}
      <Dialog open={revealKeyOpen} onOpenChange={(open) => {
        if (!open) {
          setRevealedKey(null);
          setRevealedKeyName('');
        }
        setRevealKeyOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy this key now — it will <strong>NOT</strong> be shown again.
            </DialogDescription>
          </DialogHeader>

          {revealedKey && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-xs text-muted-foreground mb-2">{revealedKeyName}</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono break-all flex-1 select-all bg-muted px-3 py-2 rounded">
                    {revealedKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => copyToClipboard(revealedKey)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    This key will not be shown again. Copy it now.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    If you lose it, you will need to rotate the key to get a new one.
                    Treat it like a password — anyone with this key can access your account
                    with the scopes you selected.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => copyToClipboard(revealedKey)}
                >
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copy Key
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => downloadKey(revealedKey, revealedKeyName)}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download .txt
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => {
                setRevealKeyOpen(false);
                setRevealedKey(null);
                setRevealedKeyName('');
              }}
            >
              I&apos;ve saved the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ ROTATE CONFIRM ═══════════ */}
      <AlertDialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate &quot;{selectedKeyName}&quot; and issue a new key with the same permissions.
              The old key will stop working immediately. Make sure no services are using the old key before rotating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => selectedKeyId && rotateMutation.mutate(selectedKeyId)}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Rotate Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ REVOKE CONFIRM ═══════════ */}
      <AlertDialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke &quot;{selectedKeyName}&quot;. Any services using this key will immediately lose access.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => selectedKeyId && revokeMutation.mutate(selectedKeyId)}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ DELETE CONFIRM ═══════════ */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &quot;{selectedKeyName}&quot; and all its usage history? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => selectedKeyId && deleteMutation.mutate(selectedKeyId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ===== CODE EXAMPLES SUB-COMPONENT =====

function CodeExamples({
  docsData,
  copyToClipboard,
}: {
  docsData: DocsData;
  copyToClipboard: (text: string) => void;
}) {
  const [activeLang, setActiveLang] = useState<string>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      copyToClipboard(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, [copyToClipboard]);

  const langLabels: Record<string, string> = {
    curl: 'cURL',
    javascript: 'JavaScript',
    python: 'Python',
    postman: 'Postman',
  };

  const getCodeContent = (lang: string): { id: string; label: string; code: string }[] => {
    switch (lang) {
      case 'curl':
        return Object.entries(docsData.examples.curl).map(([key, code]) => ({
          id: `curl-${key}`,
          label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          code,
        }));
      case 'javascript':
        return Object.entries(docsData.examples.javascript).map(([key, code]) => ({
          id: `js-${key}`,
          label: key === 'sdk' ? 'SDK Client' : key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          code,
        }));
      case 'python':
        return Object.entries(docsData.examples.python).map(([key, code]) => ({
          id: `py-${key}`,
          label: key === 'sdk' ? 'SDK Client' : key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          code,
        }));
      case 'postman':
        return [{
          id: 'postman-collection',
          label: 'Collection JSON',
          code: JSON.stringify(docsData.examples.postman.collection, null, 2),
        }];
      default:
        return [];
    }
  };

  const codeBlocks = getCodeContent(activeLang);

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {Object.keys(langLabels).map((lang) => (
          <button
            key={lang}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeLang === lang
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveLang(lang)}
          >
            {langLabels[lang]}
          </button>
        ))}
      </div>

      {/* Code Blocks */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {codeBlocks.map((block) => (
          <div key={block.id} className="rounded-lg border bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
              <span className="text-xs font-medium">{block.label}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleCopy(block.code, block.id)}
              >
                {copiedId === block.id ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="p-3 overflow-x-auto">
              <code className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                {block.code}
              </code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
