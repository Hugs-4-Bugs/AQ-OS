'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unified Connected Accounts View (Phase 26+27)
//
// Single unified surface for ALL connected accounts across three categories:
//   1. AI Providers       (Z-AI, OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Local)
//   2. Business Accounts  (Gmail SMTP, Hostinger Mail, Gmail OAuth)
//   3. Human Channels     (Telegram, WhatsApp, LinkedIn, Instagram)
//
// Each card surfaces:
//   - connected/not connected / provider_blocked
//   - account identity (NEVER the secret)
//   - capabilities (as plain-language list)
//   - last successful validation
//   - configuration requirement / next step
//   - test connection / reconnect / disconnect
//   - error state with actionable message
//
// LinkedIn / Instagram are reported honestly as `provider_blocked` — the UI
// explains WHY they cannot send messages (Partner Program / App Review) and
// points the user at alternative channels (Email / WhatsApp).
//
// Secrets are NEVER exposed. The backend returns `credentialMeta` with
// masked/structural hints only (host, port, username prefix, "configured").
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2,
  RefreshCw, Plug, Unplug, Bot, Mail, Send, ShieldAlert,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface UnifiedAccount {
  id: string;
  kind: 'ai_provider' | 'business_account' | 'human_channel';
  provider: string;
  accountIdentifier: string;
  accountType: string;
  status: string; // connected | disconnected | error | revoked
  capabilities: string[];
  scopes: string[];
  lastValidatedAt: string | null;
  lastError: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
  credentialMeta: Record<string, unknown>;
}

interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  configurableByUser: boolean;
  configuredByServer?: boolean;
  requiresOAuth?: boolean;
  status?: string; // for provider_blocked entries (linkedin/instagram)
  reason?: string;
  capabilities: string[];
}

interface CatalogResponse {
  aiProviders: CatalogEntry[];
  businessAccounts: CatalogEntry[];
  humanChannels: CatalogEntry[];
}

// ─── Main component ──────────────────────────────────────────────────

export function UnifiedConnectedAccounts() {
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, catRes] = await Promise.all([
        fetch('/api/connected-accounts', { credentials: 'include' }),
        fetch('/api/connected-accounts/catalog', { credentials: 'include' }),
      ]);
      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(data.accounts || []);
      }
      if (catRes.ok) {
        setCatalog(await catRes.json());
      }
    } catch (e) {
      toast.error('Failed to load connected accounts', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const findConnected = (provider: string): UnifiedAccount | undefined =>
    accounts.find(a => a.provider === provider && a.status === 'connected');

  return (
    <div className="space-y-6">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connected accounts…
        </div>
      )}

      {/* ── AI Providers ── */}
      {catalog && (
        <Section
          icon={<Bot className="h-4 w-4" />}
          title="AI Providers"
          description="LLM backends used by agents, workflows, and chat. Z-AI is built-in and configured by the server. Others require an API key."
        >
          {catalog.aiProviders.map(p => (
            <AccountCard
              key={p.id}
              entry={p}
              connected={findConnected(p.id)}
              onTest={async () => {
                toast.info(`Testing ${p.label}…`);
                load();
              }}
              onDisconnect={async () => {
                const acc = findConnected(p.id);
                if (!acc) return;
                try {
                  await fetch('/api/settings/integrations', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'disconnect', provider: p.id }),
                  });
                  toast.success(`${p.label} disconnected`);
                  load();
                } catch (e) {
                  toast.error('Disconnect failed', { description: e instanceof Error ? e.message : String(e) });
                }
              }}
            />
          ))}
        </Section>
      )}

      {/* ── Business Accounts ── */}
      {catalog && (
        <Section
          icon={<Mail className="h-4 w-4" />}
          title="Business Accounts"
          description="Email addresses used for outbound outreach. SMTP adapters (Gmail/Hostinger) support send + reply + verify. Gmail OAuth additionally supports inbox sync + thread correlation."
        >
          {catalog.businessAccounts.map(p => (
            <AccountCard
              key={p.id}
              entry={p}
              connected={findConnected(p.id)}
              onConnect={() => setShowConnect(p.id)}
              onTest={async () => {
                const acc = findConnected(p.id);
                if (!acc) return;
                try {
                  const res = await fetch(`/api/connected-accounts/${acc.id}/validate`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const data = await res.json();
                  if (data.ok) toast.success(`${p.label} connection OK`);
                  else toast.error(`${p.label} validation failed`, { description: data.error });
                  load();
                } catch (e) {
                  toast.error('Test failed', { description: e instanceof Error ? e.message : String(e) });
                }
              }}
              onDisconnect={async () => {
                const acc = findConnected(p.id);
                if (!acc) return;
                try {
                  await fetch(`/api/connected-accounts/${acc.id}/disconnect`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  toast.success(`${p.label} disconnected`);
                  load();
                } catch (e) {
                  toast.error('Disconnect failed', { description: e instanceof Error ? e.message : String(e) });
                }
              }}
            />
          ))}
        </Section>
      )}

      {/* ── Human Channels ── */}
      {catalog && (
        <Section
          icon={<Send className="h-4 w-4" />}
          title="Human Channels"
          description="Notification + human-escalation channels. Telegram + WhatsApp are fully wired. LinkedIn + Instagram are reported as provider_blocked — see each card for the specific API limitation."
        >
          {catalog.humanChannels.map(p => (
            <AccountCard
              key={p.id}
              entry={p}
              connected={findConnected(p.id === 'whatsapp-meta' || p.id === 'whatsapp-twilio' ? 'whatsapp' : p.id)}
              onConnect={() => {
                // Route to existing integration tabs (legacy paths)
                window.location.hash = p.id === 'telegram' ? '#integrations/telegram' : p.id.startsWith('whatsapp') ? '#integrations/whatsapp' : '';
                toast.info(`Use the ${p.label} tab in Settings → Integrations to connect`);
              }}
            />
          ))}
        </Section>
      )}

      {showConnect && (
        <ConnectBusinessModal
          provider={showConnect}
          onClose={() => setShowConnect(null)}
          onConnected={() => { setShowConnect(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function Section({ icon, title, description, children }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function AccountCard({ entry, connected, onConnect, onTest, onDisconnect }: {
  entry: CatalogEntry;
  connected?: UnifiedAccount;
  onConnect?: () => void;
  onTest?: () => void;
  onDisconnect?: () => void;
}) {
  const isBlocked = entry.status === 'provider_blocked';
  const isServerConfigured = !!entry.configuredByServer;
  const isConnected = !!connected;
  const hasError = connected?.status === 'error';

  const statusColor = isBlocked
    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    : isServerConfigured
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : isConnected
    ? (hasError ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')
    : 'bg-zinc-500/15 text-zinc-500';

  const statusLabel = isBlocked
    ? 'PROVIDER BLOCKED'
    : isServerConfigured
    ? 'CONFIGURED BY SERVER'
    : isConnected
    ? (hasError ? 'ERROR' : 'CONNECTED')
    : 'NOT CONNECTED';

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{entry.label}</CardTitle>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {isBlocked && entry.reason && (
          <div className="text-[11px] bg-amber-500/5 border border-amber-500/20 rounded-md p-2 text-amber-700 dark:text-amber-300 leading-relaxed">
            <ShieldAlert className="inline h-3 w-3 mr-1" />{entry.reason}
          </div>
        )}

        {isConnected && connected && (
          <div className="text-xs space-y-1">
            <div><span className="text-muted-foreground">Identity:</span> <span className="font-mono">{connected.accountIdentifier}</span></div>
            {connected.lastValidatedAt && (
              <div><span className="text-muted-foreground">Last check:</span> {new Date(connected.lastValidatedAt).toLocaleString()}</div>
            )}
            {connected.lastError && (
              <div className="text-red-600 dark:text-red-400">Error: {connected.lastError}</div>
            )}
          </div>
        )}

        {entry.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.capabilities.map(c => (
              <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-2">
          {!isBlocked && !isServerConfigured && !isConnected && onConnect && (
            <Button size="sm" className="h-7 text-xs" onClick={onConnect}>
              <Plug className="h-3 w-3 mr-1" /> Connect
            </Button>
          )}
          {isServerConfigured && (
            <div className="text-[11px] text-muted-foreground italic flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured by server
            </div>
          )}
          {isConnected && onTest && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onTest}>
              <RefreshCw className="h-3 w-3 mr-1" /> Test
            </Button>
          )}
          {isConnected && onDisconnect && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDisconnect}>
              <Unplug className="h-3 w-3 mr-1" /> Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Connect Business Account Modal (SMTP) ──────────────────────────

function ConnectBusinessModal({ provider, onClose, onConnected }: {
  provider: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [host, setHost] = useState(provider === 'gmail-smtp' ? 'smtp.gmail.com' : provider === 'hostinger-mail' ? 'smtp.hostinger.com' : '');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(false);
  const [fromName, setFromName] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!host || !user || !password || !port) {
      toast.error('All fields are required');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch('/api/connected-accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider,
          accountIdentifier: user,
          credentials: { host, port: parseInt(port, 10), user, password, secure, fromName: fromName || undefined },
        }),
      });
      const data = await res.json();
      if (res.ok && data.validation?.ok) {
        toast.success(`${provider} connected and validated`);
        onConnected();
      } else {
        toast.error('Validation failed', { description: data.error || data.validation?.error || 'Unknown error' });
      }
    } catch (e) {
      toast.error('Connect failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-base">Connect {provider}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">SMTP Host</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} className="mt-1" placeholder="smtp.gmail.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Port</Label>
              <Input value={port} onChange={(e) => setPort(e.target.value)} className="mt-1" placeholder="587" />
            </div>
            <div>
              <Label className="text-xs">Security</Label>
              <select value={secure ? 'tls' : 'starttls'} onChange={(e) => setSecure(e.target.value === 'tls')} className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm">
                <option value="starttls">STARTTLS (587)</option>
                <option value="tls">TLS (465)</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Username (email)</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} className="mt-1" placeholder="you@example.com" />
          </div>
          <div>
            <Label className="text-xs">Password / App Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" placeholder="••••••••" />
            <p className="text-[10px] text-muted-foreground mt-1">For Gmail, use an App Password (16 chars), NOT your account password.</p>
          </div>
          <div>
            <Label className="text-xs">From Name (optional)</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} className="mt-1" placeholder="Your Name" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
              {connecting ? 'Validating…' : 'Connect'}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
