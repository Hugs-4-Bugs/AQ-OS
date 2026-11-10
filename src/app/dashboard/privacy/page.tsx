'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Shield,
  ShieldCheck,
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  Mail,
  Scale,
} from 'lucide-react';

interface ConsentRecord {
  purpose: string;
  status: 'granted' | 'declined' | 'withdrawn';
  timestamp: string;
  noticeVersion: string;
}

interface GdprRequest {
  id: string;
  requestType: 'access' | 'deletion' | 'portability' | 'rectification';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: string;
  completedAt?: string;
}

const PURPOSE_LABELS: Record<string, { title: string; description: string; essential: boolean }> = {
  essential_service: {
    title: 'Essential Service',
    description: 'Account creation, authentication, billing. Required to provide the core AcquisitionOS service.',
    essential: true,
  },
  ai_processing: {
    title: 'AI Processing',
    description: 'Use AI providers to analyze leads, generate outreach, and provide chat assistance. Your prompts and lead data are sent to the configured AI provider.',
    essential: false,
  },
  marketing_communications: {
    title: 'Marketing Communications',
    description: 'Product updates, feature announcements, promotional offers. You can unsubscribe at any time.',
    essential: false,
  },
  analytics_telemetry: {
    title: 'Analytics & Telemetry',
    description: 'Aggregated, anonymized usage analytics to improve the product. No personal identification.',
    essential: false,
  },
  third_party_integrations: {
    title: 'Third-Party Integrations',
    description: 'Connect Gmail, WhatsApp, Telegram, Google Calendar. Each integration shares only the data necessary for that integration.',
    essential: false,
  },
};

export default function PrivacyDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [consentRes, requestsRes] = await Promise.all([
        fetch('/api/gdpr/consent'),
        fetch('/api/gdpr/consent?type=requests'),
      ]);
      if (consentRes.ok) {
        const data = await consentRes.json();
        setConsents(data.consents || data.records || []);
      }
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setRequests(data.requests || data.records || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load privacy data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleConsentAction = async (purpose: string, action: 'grant' | 'withdraw') => {
    setActionLoading(`${purpose}-${action}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/gdpr/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} consent`);
      }
      setSuccess(`Consent ${action === 'grant' ? 'granted' : 'withdrawn'} for ${purpose}`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDataRequest = async (requestType: GdprRequest['requestType']) => {
    setActionLoading(`request-${requestType}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/settings/account/export-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit request');
      }
      setSuccess(`${requestType} request submitted — we will acknowledge within 48 hours`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setActionLoading(null);
    }
  };

  const getConsentStatus = (purpose: string): ConsentRecord['status'] | 'not_set' => {
    const record = consents.find((c) => c.purpose === purpose);
    return record?.status || 'not_set';
  };

  if (loading) {
    return (
      <div className="container-app px-4 sm:px-6 py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading privacy dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="container-app px-4 sm:px-6 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold">Privacy & Data Protection</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your consent preferences, exercise your data subject rights under DPDP Act 2023
            and GDPR, and review the personal data we process.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-md bg-destructive/10 border border-destructive/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">{error}</div>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-700">{success}</div>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Consent Preferences
            </CardTitle>
            <CardDescription>
              Choose which processing activities you consent to. Essential service consent is
              required to use AcquisitionOS; other consents are optional and can be withdrawn at
              any time without affecting core functionality.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(PURPOSE_LABELS).map(([purpose, info]) => {
              const status = getConsentStatus(purpose);
              return (
                <div key={purpose} className="border rounded-md p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{info.title}</h3>
                        {info.essential && (
                          <Badge variant="secondary" className="text-xs">Required</Badge>
                        )}
                        {status === 'granted' && (
                          <Badge variant="default" className="text-xs bg-emerald-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Granted
                          </Badge>
                        )}
                        {status === 'declined' && (
                          <Badge variant="outline" className="text-xs">
                            <XCircle className="w-3 h-3 mr-1" />
                            Declined
                          </Badge>
                        )}
                        {status === 'withdrawn' && (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Withdrawn
                          </Badge>
                        )}
                        {status === 'not_set' && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Not set
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {!info.essential && (
                      <>
                        <Button
                          size="sm"
                          variant={status === 'granted' ? 'default' : 'outline'}
                          onClick={() => handleConsentAction(purpose, 'grant')}
                          disabled={actionLoading === `${purpose}-grant` || status === 'granted'}
                        >
                          {actionLoading === `${purpose}-grant` && (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          )}
                          Grant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConsentAction(purpose, 'withdraw')}
                          disabled={
                            actionLoading === `${purpose}-withdraw` ||
                            status === 'withdrawn' ||
                            status === 'not_set'
                          }
                        >
                          {actionLoading === `${purpose}-withdraw` && (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          )}
                          Withdraw
                        </Button>
                      </>
                    )}
                    {info.essential && (
                      <p className="text-xs text-muted-foreground italic">
                        This consent is required and cannot be withdrawn while your account is active.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Your Data Subject Rights
            </CardTitle>
            <CardDescription>
              Under the DPDP Act 2023 (India) and GDPR (EU), you have the right to access,
              correct, export, or delete your personal data. Submit a request below — we will
              acknowledge within 48 hours and respond substantively within the timelines
              prescribed by applicable law.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => handleDataRequest('access')} disabled={actionLoading === 'request-access'} className="justify-start h-auto py-3">
                <Eye className="w-4 h-4 mr-3 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium text-sm">Access My Data</div>
                  <div className="text-xs text-muted-foreground">Receive a copy of your personal data</div>
                </div>
              </Button>
              <Button variant="outline" onClick={() => handleDataRequest('portability')} disabled={actionLoading === 'request-portability'} className="justify-start h-auto py-3">
                <Download className="w-4 h-4 mr-3 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium text-sm">Export My Data</div>
                  <div className="text-xs text-muted-foreground">Machine-readable export</div>
                </div>
              </Button>
              <Button variant="outline" onClick={() => router.push('/settings')} className="justify-start h-auto py-3">
                <Pencil className="w-4 h-4 mr-3 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium text-sm">Correct My Data</div>
                  <div className="text-xs text-muted-foreground">Edit profile in Settings</div>
                </div>
              </Button>
              <Button variant="outline" onClick={() => router.push('/settings')} className="justify-start h-auto py-3 text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-3 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium text-sm">Delete My Account</div>
                  <div className="text-xs text-muted-foreground">Permanently erase your data</div>
                </div>
              </Button>
            </div>
            <Separator className="my-2" />
            <div className="text-xs text-muted-foreground">
              <Mail className="w-3 h-3 inline mr-1" />
              For grievances or nomination requests, email{' '}
              <a href="mailto:dpo@acquisitionos.com" className="text-primary hover:underline">
                dpo@acquisitionos.com
              </a>
            </div>
          </CardContent>
        </Card>

        {requests.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Your Data Requests
              </CardTitle>
              <CardDescription>
                Track the status of your submitted data subject rights requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {requests.map((req) => (
                  <div key={req.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm capitalize">{req.requestType} request</div>
                      <div className="text-xs text-muted-foreground">
                        Submitted {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      variant={
                        req.status === 'completed' ? 'default' :
                        req.status === 'rejected' ? 'destructive' :
                        req.status === 'processing' ? 'secondary' :
                        'outline'
                      }
                    >
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Privacy Documentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a href="/legal/privacy" className="block text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              → Privacy Policy (full text, including AI sub-processor disclosure)
            </a>
            <a href="/legal/data-retention" className="block text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              → Data Retention Policy
            </a>
            <a href="/legal/ai-disclaimer" className="block text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              → AI Processing Disclaimer
            </a>
            <a href="/legal/gdpr" className="block text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              → GDPR Data Processing Agreement
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
