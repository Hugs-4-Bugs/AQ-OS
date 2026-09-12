'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Privacy Settings Component
// Phase 14.6: Compliance
// Consent toggles, data export button, account deletion (2-step),
// policy acceptance status, retention info, GDPR rights
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Download,
  Trash2,
  FileText,
  Lock,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Database,
  Scale,
  Info,
  ChevronDown,
  ChevronUp,
  Key,
  Mail,
  BarChart3,
  Puzzle,
  Brain,
  Cookie,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useLegalStore } from '@/lib/legal-store';

// ── Types ──────────────────────────────────────────────────────────

interface ConsentCategory {
  key: string;
  label: string;
  description: string;
  required: boolean;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  version: string;
}

interface PolicyStatus {
  version: string;
  updatedAt: string;
  url: string;
  accepted: boolean;
  acceptedAt: string | null;
}

interface PoliciesData {
  policies: {
    privacyPolicy: PolicyStatus;
    termsOfService: PolicyStatus;
  };
  requiresAcceptance: boolean;
}

interface RetentionPolicy {
  category: string;
  description: string;
  retentionDays: number;
  action: string;
  legalBasis: string;
  gdprArticle: string;
}

// ── Consent Category Icons ─────────────────────────────────────────

const CONSENT_ICONS: Record<string, React.ElementType> = {
  data_processing: Lock,
  marketing_emails: Mail,
  analytics_tracking: BarChart3,
  third_party_integrations: Puzzle,
  ai_data_usage: Brain,
  cookie_analytics: Cookie,
};

// ── Main Component ─────────────────────────────────────────────────

export default function PrivacySettings() {
  const queryClient = useQueryClient();
  const [expandedRetention, setExpandedRetention] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ── Fetch consent state ──────────────────────────────────────────
  const { data: consentData, isLoading: consentLoading } = useQuery({
    queryKey: ['gdpr-consent'],
    queryFn: async () => {
      const res = await fetch('/api/gdpr/consent', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch consent');
      return res.json() as Promise<{ categories: ConsentCategory[]; lastUpdated: string }>;
    },
    staleTime: 60 * 1000,
  });

  // ── Fetch policy status ──────────────────────────────────────────
  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ['gdpr-policies'],
    queryFn: async () => {
      const res = await fetch('/api/gdpr/policies', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch policies');
      return res.json() as Promise<PoliciesData>;
    },
    staleTime: 60 * 1000,
  });

  // ── Fetch retention policies ─────────────────────────────────────
  const { data: retentionData } = useQuery({
    queryKey: ['gdpr-retention'],
    queryFn: async () => {
      const res = await fetch('/api/gdpr/retention', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch retention');
      return res.json() as Promise<{ policies: RetentionPolicy[]; summary: { totalPolicies: number } }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Update consent mutation ──────────────────────────────────────
  const consentMutation = useMutation({
    mutationFn: async (consents: Record<string, boolean>) => {
      const res = await fetch('/api/gdpr/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ consents }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to update consent' }));
        throw new Error(data.error || 'Failed to update consent');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Consent preferences updated');
      queryClient.invalidateQueries({ queryKey: ['gdpr-consent'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update consent');
    },
  });

  // ── Data export mutation ─────────────────────────────────────────
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/gdpr/export', { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(data.error || 'Export failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Create a downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acquisitionos-gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data export downloaded successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Data export failed');
    },
  });

  // ── Accept policies mutation ─────────────────────────────────────
  const acceptPoliciesMutation = useMutation({
    mutationFn: async ({ acceptPrivacyPolicy, acceptTos }: { acceptPrivacyPolicy: boolean; acceptTos: boolean }) => {
      const res = await fetch('/api/gdpr/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ acceptPrivacyPolicy, acceptTos }),
      });
      if (!res.ok) throw new Error('Failed to accept policies');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Policies accepted');
      queryClient.invalidateQueries({ queryKey: ['gdpr-policies'] });
    },
    onError: () => {
      toast.error('Failed to accept policies');
    },
  });

  // ── Delete account mutation ──────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async ({ step, confirmationCode }: { step: string; confirmationCode?: string }) => {
      const res = await fetch('/api/gdpr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ step, confirmationCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Deletion failed' }));
        throw new Error(data.error || 'Deletion failed');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (variables.step === 'request') {
        setDeleteCode(data.confirmationCode || '');
        setDeleteStep('confirm');
        toast.info('Confirmation code generated. Enter it to confirm deletion.');
      } else if (variables.step === 'confirm') {
        setDeleteStep('done');
        toast.success('Account deletion completed');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Account deletion failed');
    },
  });

  // ── Consent toggle handler ───────────────────────────────────────
  const handleConsentToggle = useCallback((key: string, granted: boolean) => {
    consentMutation.mutate({ [key]: granted });
  }, [consentMutation]);

  // ── Format date ──────────────────────────────────────────────────
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatRetentionDays = (days: number) => {
    if (days >= 365) return `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}`;
    if (days >= 30) return `${Math.round(days / 30)} month${days >= 60 ? 's' : ''}`;
    return `${days} day${days > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* ═══ Privacy & Data Section Header ═══ */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10">
          <Shield className="h-4 w-4 text-purple-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Privacy & Data</h2>
          <p className="text-sm text-muted-foreground">Manage your data privacy, consent, and GDPR rights</p>
        </div>
      </div>

      {/* ═══ Consent Preferences ═══ */}
      <Card className="border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4 text-purple-500" />
            Consent Preferences
          </CardTitle>
          <CardDescription>Control how your data is processed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {consentLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            consentData?.categories.map((category) => {
              const Icon = CONSENT_ICONS[category.key] || Lock;
              return (
                <div key={category.key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10 shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{category.label}</Label>
                      {category.required && (
                        <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">Required</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{category.description}</p>
                    {category.grantedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {category.granted ? 'Accepted' : 'Revoked'} on {formatDate(category.grantedAt || category.revokedAt)}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={category.granted}
                    disabled={category.required}
                    onCheckedChange={(checked) => handleConsentToggle(category.key, checked)}
                    className="shrink-0"
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ═══ Policy Acceptance ═══ */}
      <Card className="border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-500" />
            Policy Acceptance
          </CardTitle>
          <CardDescription>Current policy versions and your acceptance status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policiesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Privacy Policy */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${policiesData?.policies.privacyPolicy.accepted ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    {policiesData?.policies.privacyPolicy.accepted
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Privacy Policy</p>
                    <p className="text-xs text-muted-foreground">
                      v{policiesData?.policies.privacyPolicy.version} · Updated {formatDate(policiesData?.policies.privacyPolicy.updatedAt || null)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-primary hover:text-primary/80"
                    onClick={() => useLegalStore.getState().openLegal('privacy')}
                  >
                    Read
                  </Button>
                  <Badge variant={policiesData?.policies.privacyPolicy.accepted ? 'default' : 'destructive'} className="text-xs">
                    {policiesData?.policies.privacyPolicy.accepted ? 'Accepted' : 'Not Accepted'}
                  </Badge>
                  {!policiesData?.policies.privacyPolicy.accepted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-500/20"
                      onClick={() => acceptPoliciesMutation.mutate({ acceptPrivacyPolicy: true, acceptTos: false })}
                      disabled={acceptPoliciesMutation.isPending}
                    >
                      Accept
                    </Button>
                  )}
                </div>
              </div>

              {/* Terms of Service */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${policiesData?.policies.termsOfService.accepted ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    {policiesData?.policies.termsOfService.accepted
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Terms of Service</p>
                    <p className="text-xs text-muted-foreground">
                      v{policiesData?.policies.termsOfService.version} · Updated {formatDate(policiesData?.policies.termsOfService.updatedAt || null)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-primary hover:text-primary/80"
                    onClick={() => useLegalStore.getState().openLegal('terms')}
                  >
                    Read
                  </Button>
                  <Badge variant={policiesData?.policies.termsOfService.accepted ? 'default' : 'destructive'} className="text-xs">
                    {policiesData?.policies.termsOfService.accepted ? 'Accepted' : 'Not Accepted'}
                  </Badge>
                  {!policiesData?.policies.termsOfService.accepted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-500/20"
                      onClick={() => acceptPoliciesMutation.mutate({ acceptPrivacyPolicy: false, acceptTos: true })}
                      disabled={acceptPoliciesMutation.isPending}
                    >
                      Accept
                    </Button>
                  )}
                </div>
              </div>

              {/* Accept All Button */}
              {policiesData?.requiresAcceptance && (
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => acceptPoliciesMutation.mutate({ acceptPrivacyPolicy: true, acceptTos: true })}
                  disabled={acceptPoliciesMutation.isPending}
                >
                  {acceptPoliciesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Accept All Policies
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══ Data Export ═══ */}
      <Card className="border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4 text-purple-500" />
            Data Export
          </CardTitle>
          <CardDescription>Download all your personal data (GDPR Article 20 — Right to Portability)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">Full Data Export</p>
              <p className="text-xs text-muted-foreground">
                Download all personal data in JSON format. Rate limited to once per 24 hours.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-purple-500/20"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Data Retention ═══ */}
      <Card className="border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            Data Retention
          </CardTitle>
          <CardDescription>How long we keep different types of data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {retentionData?.policies.map((policy) => (
            <div
              key={policy.category}
              className="border rounded-lg overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpandedRetention(
                  expandedRetention === policy.category ? null : policy.category
                )}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize border-purple-500/20">
                    {policy.category.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-sm">{formatRetentionDays(policy.retentionDays)}</span>
                </div>
                {expandedRetention === policy.category
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandedRetention === policy.category && (
                <div className="px-3 pb-3 pt-1 border-t bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">{policy.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Action:</span>{' '}
                      <span className="font-medium capitalize">{policy.action}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Legal basis:</span>{' '}
                      <span className="font-medium">{policy.legalBasis.split('—')[0].trim()}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">GDPR Article:</span>{' '}
                      <span className="font-medium">{policy.gdprArticle}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ═══ Your GDPR Rights ═══ */}
      <Card className="border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-purple-500" />
            Your GDPR Rights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'Right of Access', desc: 'Request a copy of your personal data', icon: Eye, article: 'Art. 15' },
              { title: 'Right to Rectification', desc: 'Correct inaccurate personal data', icon: RefreshCw, article: 'Art. 16' },
              { title: 'Right to Erasure', desc: 'Request deletion of your data', icon: Trash2, article: 'Art. 17' },
              { title: 'Right to Portability', desc: 'Export your data in a machine-readable format', icon: Download, article: 'Art. 20' },
              { title: 'Right to Restrict', desc: 'Limit how your data is processed', icon: Lock, article: 'Art. 18' },
              { title: 'Right to Object', desc: 'Object to processing of your data', icon: Shield, article: 'Art. 21' },
            ].map((right) => (
              <div key={right.title} className="p-3 rounded-lg border flex items-start gap-2.5">
                <right.icon className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{right.title}</p>
                  <p className="text-xs text-muted-foreground">{right.desc}</p>
                  <Badge variant="outline" className="text-[10px] mt-1 border-purple-500/20">{right.article}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Account Deletion ═══ */}
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            Account Deletion
          </CardTitle>
          <CardDescription className="text-red-500/70">
            Permanently delete your account and personal data (GDPR Article 17)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deleteStep === 'done' ? (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-600">Account Deletion Completed</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your personal data has been anonymized. Financial records are retained for legal compliance.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  <span>This action is irreversible. All your data will be permanently deleted or anonymized.</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span>Financial records will be retained for 7 years (legal/tax compliance), but PII will be anonymized.</span>
                </div>
              </div>

              {deleteStep === 'request' ? (
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Request Account Deletion
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will initiate a two-step deletion process. You will receive a confirmation code
                        that must be entered within 24 hours to complete the deletion.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => {
                          deleteMutation.mutate({ step: 'request' });
                          setDeleteDialogOpen(false);
                        }}
                      >
                        Request Deletion
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Dialog open={deleteStep === 'confirm'} onOpenChange={(open) => { if (!open) setDeleteStep('request'); }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm Account Deletion</DialogTitle>
                      <DialogDescription>
                        Enter the confirmation code to permanently delete your account.
                        This code expires in 24 hours.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      {deleteCode && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-600 font-medium">Your confirmation code:</p>
                          <p className="text-lg font-mono font-bold text-amber-700 mt-1">{deleteCode}</p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="confirm-code" className="text-xs">Confirmation Code</Label>
                        <Input
                          id="confirm-code"
                          placeholder="Enter confirmation code"
                          value={deleteCode}
                          onChange={(e) => setDeleteCode(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDeleteStep('request')}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteMutation.mutate({ step: 'confirm', confirmationCode: deleteCode })}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Delete My Account
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
