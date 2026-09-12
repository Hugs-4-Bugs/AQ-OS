'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Shield,
  Zap,
  Link2,
  Loader2,
  Check,
  Unplug,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  MessageSquare,
  AtSign,
  Hash,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
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

const BENEFITS = [
  { icon: MessageSquare, label: 'Send messages', desc: 'Reach leads directly via Telegram' },
  { icon: Zap, label: 'Auto-link leads', desc: 'Match conversations to your pipeline' },
  { icon: Link2, label: 'Bot integration', desc: 'Use your Telegram bot for outreach' },
  { icon: Shield, label: 'Secure access', desc: 'Token encrypted at rest, never shared' },
];

// ─── Telegram API (local wrappers) ──────────────────────────────

interface TelegramStatus {
  connected: boolean;
  isPaused?: boolean;
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  botUsername?: string | null;
  botId?: string | null;
  chatId?: string | null;
  mode?: string;
  errorMessage?: string | null;
  linkCode?: string | null;
  linkCodeExpiresAt?: string | null;
}

export async function fetchTelegramStatus(): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/status');
  if (!res.ok) throw new Error('Failed to fetch Telegram status');
  const data = (await res.json()) as Record<string, unknown>;
  return { ...data, connected: Boolean(data.isConnected ?? data.connected) } as TelegramStatus;
}

export async function connectTelegramBot(botToken: string): Promise<TelegramStatus> {
  const res = await fetch('/api/telegram/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to connect Telegram bot');
  return { ...data, connected: Boolean(data.success) } as TelegramStatus;
}

export async function disconnectTelegramBot(): Promise<void> {
  const res = await fetch('/api/telegram/disconnect', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to disconnect Telegram bot');
}

export async function generateTelegramLinkCode(): Promise<{ linkCode: string; expiresAt?: string | null }> {
  const res = await fetch('/api/telegram/link-code', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to generate link code');
  return (await res.json()) as { linkCode: string; expiresAt?: string | null };
}

export default function TelegramConnectCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiresAt, setLinkCodeExpiresAt] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchTelegramStatus();
      setStatus(s);
      if (s.linkCode) {
        setLinkCode(s.linkCode);
        setLinkCodeExpiresAt(s.linkCodeExpiresAt ?? null);
      }
    } catch {
      // Status fetch failed - stay disconnected
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadStatus();
    return () => { cancelled = true; };
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!botToken.trim()) {
      toast.error('Please enter a bot token');
      return;
    }
    setConnecting(true);
    try {
      const s = await connectTelegramBot(botToken.trim());
      setStatus(s);
      setBotToken('');
      toast.success('Telegram bot connected successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect Telegram bot');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectTelegramBot();
      setStatus(null);
      setLinkCode(null);
      setLinkCodeExpiresAt(null);
      toast.success('Telegram bot disconnected');
    } catch {
      toast.error('Failed to disconnect Telegram bot');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    try {
      const result = await generateTelegramLinkCode();
      setLinkCode(result.linkCode);
      setLinkCodeExpiresAt(result.expiresAt);
      toast.success('Link code generated!');
    } catch {
      toast.error('Failed to generate link code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyLinkCode = () => {
    if (linkCode) {
      navigator.clipboard.writeText(linkCode);
      toast.success('Link code copied to clipboard');
    }
  };

  const formatExpiry = (iso?: string | null) => {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m remaining`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m remaining`;
  };

  // ─── Loading skeleton ─────────────────────────────────────
  if (loading) {
    return (
      <Card className="border-primary/20 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-8 text-center border-b border-primary/10">
          <Skeleton className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto mt-2 h-4 w-64" />
        </div>
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ─── Connected state ─────────────────────────────────────
  if (status?.connected) {
    return (
      <Card className="border-emerald-500/20 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-6 border-b border-emerald-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-lg dark:bg-card">
                <Bot className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  Telegram Bot
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-1.5 py-0">
                    Connected
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">@{status.botUsername || 'Unknown'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={loadStatus}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-6 space-y-4">
          {/* Bot details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <AtSign className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Bot Username</p>
                <p className="text-sm font-medium truncate">@{status.botUsername || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Hash className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Bot ID</p>
                <p className="text-sm font-medium truncate">{status.botId || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Chat ID</p>
                <p className="text-sm font-medium truncate">{status.chatId || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Radio className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mode</p>
                <p className="text-sm font-medium capitalize">{status.mode}</p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {status.errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
              {status.errorMessage}
            </div>
          )}

          <Separator />

          {/* Link code section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Link Code</h4>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleGenerateLinkCode}
                disabled={generatingCode}
              >
                {generatingCode ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Key className="h-3 w-3" />
                )}
                {linkCode ? 'Regenerate' : 'Generate Code'}
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {linkCode ? (
                <motion.div
                  key="link-code"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20"
                >
                  <code className="flex-1 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 tracking-wider">
                    {linkCode}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={copyLinkCode}
                    aria-label="Copy link code"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {linkCodeExpiresAt && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatExpiry(linkCodeExpiresAt)}
                    </span>
                  )}
                </motion.div>
              ) : (
                <motion.p
                  key="no-code"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  Generate a link code to connect your Telegram account to the bot.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Separator />

          {/* Disconnect */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Unplug className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Disconnect this bot</span>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10 hover:text-red-700"
                  disabled={disconnecting}
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Telegram Bot?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the bot connection. You will need to reconnect with a new bot token to use Telegram features again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisconnect}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Disconnected state (default) ────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-primary/20 overflow-hidden">
          {/* Telegram Header */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-8 text-center border-b border-primary/10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg dark:bg-card">
              <Bot className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Connect Your Telegram Bot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your Telegram bot to send messages from AcquisitionOS
            </p>
          </div>

          <CardContent className="p-6 space-y-4">
            {/* Benefits List */}
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

            {/* Bot Token Input */}
            <div className="space-y-2">
              <label htmlFor="bot-token" className="text-sm font-medium">
                Bot Token
              </label>
              <div className="relative">
                <Input
                  id="bot-token"
                  type={showToken ? 'text' : 'password'}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="pr-10 h-10 text-sm font-mono"
                  disabled={connecting}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Get your bot token from @BotFather on Telegram
              </p>
            </div>

            {/* Connect Button */}
            <Button
              className="w-full h-12 text-base gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConnect}
              disabled={connecting || !botToken.trim()}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Bot className="h-5 w-5" />
                  Connect Bot
                </>
              )}
            </Button>

            {/* Privacy Notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Your token is encrypted</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bot tokens are encrypted at rest and never exposed in API responses. We only use your bot to send messages on your behalf.
                </p>
              </div>
            </div>

            {/* What you get */}
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
