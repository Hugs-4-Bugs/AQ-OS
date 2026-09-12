'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Cloud,
  Phone,
  Shield,
  Loader2,
  Unplug,
  Check,
  AlertTriangle,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

interface WhatsappConnectionStatus {
  connected: boolean;
  provider: 'meta' | 'twilio' | null;
  phoneNumber: string;
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  monthlyUsed: number;
  monthlyQuota: number;
  lastWebhookAt: string | null;
  errorMessage: string | null;
  metaConnected: boolean;
  twilioConnected: boolean;
}

interface MetaConnectParams {
  accessToken: string;
  phoneNumberId: string;
  businessId?: string;
  wabaId?: string;
}

interface TwilioConnectParams {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────

function ConnectCardSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md border-primary/20 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-8 text-center border-b border-primary/10">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-muted animate-pulse" />
          <div className="h-6 w-48 mx-auto bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 mx-auto bg-muted rounded mt-2 animate-pulse" />
        </div>
        <CardContent className="p-6 space-y-4">
          <div className="h-10 w-full bg-muted rounded animate-pulse" />
          <div className="h-10 w-full bg-muted rounded animate-pulse" />
          <div className="h-10 w-full bg-muted rounded animate-pulse" />
          <div className="h-12 w-full bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Benefits ─────────────────────────────────────────────────────

const BENEFITS = [
  { icon: MessageCircle, label: 'Send messages', desc: 'Reach leads on WhatsApp directly from AcquisitionOS' },
  { icon: Zap, label: 'Template messaging', desc: 'Use approved templates for automated outreach' },
  { icon: Cloud, label: 'Dual provider', desc: 'Connect via Meta Cloud API or Twilio' },
  { icon: Shield, label: 'Secure credentials', desc: 'All tokens encrypted at rest, never exposed' },
];

// ─── Health indicator ─────────────────────────────────────────────

function HealthIndicator({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string; pulse: boolean }> = {
    healthy: { color: 'bg-emerald-500', label: 'Healthy', pulse: true },
    degraded: { color: 'bg-amber-500', label: 'Degraded', pulse: true },
    down: { color: 'bg-red-500', label: 'Down', pulse: false },
    unknown: { color: 'bg-gray-400', label: 'Unknown', pulse: false },
  };
  const { color, label, pulse } = config[status] ?? config.unknown;

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2 w-2 rounded-full', color, pulse && 'animate-pulse')} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function WhatsappConnectCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState<WhatsappConnectionStatus | null>(null);
  const [activeTab, setActiveTab] = useState<string>('meta');

  // Meta form state
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaBusinessId, setMetaBusinessId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');

  // Twilio form state
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data as WhatsappConnectionStatus);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStatus();
    return () => { cancelled = true; };
  }, [fetchStatus]);

  // Connect Meta
  const handleConnectMeta = async () => {
    if (!metaAccessToken.trim() || !metaPhoneNumberId.trim()) {
      toast({ title: 'Missing fields', description: 'Access Token and Phone Number ID are required.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const params: MetaConnectParams = {
        accessToken: metaAccessToken,
        phoneNumberId: metaPhoneNumberId,
      };
      if (metaBusinessId.trim()) params.businessId = metaBusinessId;
      if (metaWabaId.trim()) params.wabaId = metaWabaId;

      const res = await fetch('/api/whatsapp/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Connection failed');

      toast({ title: 'WhatsApp Connected', description: 'Meta Cloud API connected successfully.' });
      setMetaAccessToken('');
      setMetaPhoneNumberId('');
      setMetaBusinessId('');
      setMetaWabaId('');
      await fetchStatus();
    } catch {
      toast({ title: 'Connection Failed', description: 'Could not connect WhatsApp via Meta. Check your credentials.', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  // Connect Twilio
  const handleConnectTwilio = async () => {
    if (!twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioPhoneNumber.trim()) {
      toast({ title: 'Missing fields', description: 'Account SID, Auth Token, and Phone Number are required.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const params: TwilioConnectParams = {
        accountSid: twilioAccountSid,
        authToken: twilioAuthToken,
        phoneNumber: twilioPhoneNumber,
      };

      const res = await fetch('/api/whatsapp/twilio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Connection failed');

      toast({ title: 'WhatsApp Connected', description: 'Twilio WhatsApp connected successfully.' });
      setTwilioAccountSid('');
      setTwilioAuthToken('');
      setTwilioPhoneNumber('');
      await fetchStatus();
    } catch {
      toast({ title: 'Connection Failed', description: 'Could not connect WhatsApp via Twilio. Check your credentials.', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: status?.provider }),
      });
      if (!res.ok) throw new Error('Disconnect failed');

      toast({ title: 'WhatsApp Disconnected', description: 'Your WhatsApp connection has been removed.' });
      await fetchStatus();
    } catch {
      toast({ title: 'Disconnect Failed', description: 'Could not disconnect WhatsApp. Please try again.', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <ConnectCardSkeleton />;

  const isConnected = status?.connected ?? false;
  const quotaPercent = status ? Math.min(100, Math.round((status.monthlyUsed / status.monthlyQuota) * 100)) : 0;
  const quotaColor = quotaPercent >= 90 ? 'text-red-500' : quotaPercent >= 70 ? 'text-amber-500' : 'text-emerald-500';

  // ─── Connected state ──────────────────────────────────────────
  if (isConnected && status) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Card className="border-primary/20 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-6 border-b border-primary/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                    <MessageCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">WhatsApp Connected</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        {status.provider === 'meta' ? (
                          <><Cloud className="h-3 w-3" /> Meta Cloud</>
                        ) : (
                          <><Phone className="h-3 w-3" /> Twilio</>
                        )}
                      </Badge>
                      <HealthIndicator status={status.healthStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
            </div>

            <CardContent className="p-6 space-y-4">
              {/* Phone number */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-xs text-muted-foreground">Phone Number</span>
                <span className="text-sm font-medium">{status.phoneNumber}</span>
              </div>

              {/* Quota usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Monthly Quota</span>
                  <span className={cn('text-xs font-medium', quotaColor)}>
                    {status.monthlyUsed} / {status.monthlyQuota}
                  </span>
                </div>
                <Progress
                  value={quotaPercent}
                  className={cn(
                    'h-2',
                    quotaPercent >= 90 && '[&>[data-slot=progress-indicator]]:bg-red-500',
                    quotaPercent >= 70 && quotaPercent < 90 && '[&>[data-slot=progress-indicator]]:bg-amber-500',
                    quotaPercent < 70 && '[&>[data-slot=progress-indicator]]:bg-emerald-500'
                  )}
                />
              </div>

              {/* Last webhook */}
              {status.lastWebhookAt && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <span className="text-xs text-muted-foreground">Last Webhook</span>
                  <span className="text-xs font-medium">
                    {new Date(status.lastWebhookAt).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Error message */}
              {status.errorMessage && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400">{status.errorMessage}</p>
                </div>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 gap-1.5 text-xs"
                  onClick={fetchStatus}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 h-9 gap-1.5 text-xs"
                      disabled={disconnecting}
                    >
                      {disconnecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your WhatsApp connection. You won&apos;t be able to send or receive messages until you reconnect.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ─── Disconnected state (connect form) ────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-primary/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-8 text-center border-b border-primary/10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg dark:bg-card">
              <MessageCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Connect WhatsApp</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your WhatsApp Business account to send messages from AcquisitionOS
            </p>
          </div>

          <CardContent className="p-6 space-y-4">
            {/* Benefits */}
            <div className="space-y-3">
              {BENEFITS.map((benefit, i) => {
                const Icon = benefit.icon;
                return (
                  <motion.div
                    key={benefit.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i, duration: 0.3 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{benefit.label}</p>
                      <p className="text-xs text-muted-foreground">{benefit.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <Separator />

            {/* Provider Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="meta" className="flex-1 gap-1.5">
                  <Cloud className="h-3.5 w-3.5" />
                  Meta Cloud
                </TabsTrigger>
                <TabsTrigger value="twilio" className="flex-1 gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Twilio
                </TabsTrigger>
              </TabsList>

              {/* Meta Cloud Tab */}
              <TabsContent value="meta" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-access-token" className="text-xs">Access Token *</Label>
                  <Input
                    id="meta-access-token"
                    type="password"
                    placeholder="EAAxxxxxxxxxxxxx"
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-phone-id" className="text-xs">Phone Number ID *</Label>
                  <Input
                    id="meta-phone-id"
                    placeholder="123456789012345"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-business-id" className="text-xs">Business ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="meta-business-id"
                    placeholder="123456789012345"
                    value={metaBusinessId}
                    onChange={(e) => setMetaBusinessId(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-waba-id" className="text-xs">WABA ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="meta-waba-id"
                    placeholder="123456789012345"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <Button
                  className="w-full h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleConnectMeta}
                  disabled={connecting || !metaAccessToken.trim() || !metaPhoneNumberId.trim()}
                >
                  {connecting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
                  ) : (
                    <><Cloud className="h-4 w-4" /> Connect Meta Cloud</>
                  )}
                </Button>
              </TabsContent>

              {/* Twilio Tab */}
              <TabsContent value="twilio" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="twilio-sid" className="text-xs">Account SID *</Label>
                  <Input
                    id="twilio-sid"
                    placeholder="ACxxxxxxxxxxxxxxxxxx"
                    value={twilioAccountSid}
                    onChange={(e) => setTwilioAccountSid(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="twilio-auth" className="text-xs">Auth Token *</Label>
                  <Input
                    id="twilio-auth"
                    type="password"
                    placeholder="your_auth_token"
                    value={twilioAuthToken}
                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="twilio-phone" className="text-xs">Phone Number *</Label>
                  <Input
                    id="twilio-phone"
                    placeholder="+1234567890"
                    value={twilioPhoneNumber}
                    onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                    className="h-9 text-sm"
                    disabled={connecting}
                  />
                </div>
                <Button
                  className="w-full h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleConnectTwilio}
                  disabled={connecting || !twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioPhoneNumber.trim()}
                >
                  {connecting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
                  ) : (
                    <><Phone className="h-4 w-4" /> Connect Twilio</>
                  )}
                </Button>
              </TabsContent>
            </Tabs>

            {/* Privacy Notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Your credentials are safe</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All tokens and keys are encrypted at rest and never exposed in API responses.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Free to connect — no credit card required</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
