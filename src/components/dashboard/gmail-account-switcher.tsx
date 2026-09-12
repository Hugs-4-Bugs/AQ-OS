'use client';

import React from 'react';
import { ChevronDown, Plus, Unplug, Clock, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { connectGmail, disconnectGmail, type GmailAccountSummary } from '@/lib/api';

type GmailAccount = GmailAccountSummary;
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';

interface GmailAccountSwitcherProps {
  accounts: GmailAccount[];
  activeAccountId: string | null;
  onAccountChange: (accountId: string) => void;
  onAccountsChanged: () => void;
}

function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never synced';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just synced';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function StatusIcon({ status }: { status: GmailAccount['status'] }) {
  switch (status) {
    case 'active':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'expired':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case 'revoked':
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
}

export default function GmailAccountSwitcher({
  accounts,
  activeAccountId,
  onAccountChange,
  onAccountsChanged,
}: GmailAccountSwitcherProps) {
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;

  const handleAddAccount = async () => {
    setConnecting(true);
    try {
      const { authUrl } = await connectGmail();
      window.location.href = authUrl;
    } catch {
      toast.error('Failed to add Gmail account');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectId) return;
    setDisconnecting(true);
    try {
      await disconnectGmail(disconnectId);
      toast.success('Account disconnected');
      setDisconnectId(null);
      onAccountsChanged();
    } catch {
      toast.error('Failed to disconnect account');
    } finally {
      setDisconnecting(false);
    }
  };

  if (!activeAccount) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-8 border-primary/20"
        onClick={handleAddAccount}
        disabled={connecting}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Gmail
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs h-8 max-w-[220px] border-primary/20"
          >
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px] bg-emerald-500/10 text-emerald-600">
                {activeAccount.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{activeAccount.email}</span>
            <StatusIcon status={activeAccount.status} />
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Gmail Accounts</DropdownMenuLabel>
          {accounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              className={cn(
                'flex items-center gap-2 py-2 cursor-pointer',
                account.id === activeAccountId && 'bg-primary/5'
              )}
              onClick={() => onAccountChange(account.id)}
            >
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[10px] bg-emerald-500/10 text-emerald-600">
                  {account.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{account.email}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusIcon status={account.status} />
                  <span className="text-[10px] text-muted-foreground">
                    {account.status === 'active'
                      ? getRelativeTime(account.lastSyncAt)
                      : account.status === 'expired'
                        ? 'Token expired'
                        : 'Access revoked'}
                  </span>
                </div>
              </div>
              {account.id === activeAccountId && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">Active</Badge>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleAddAccount} disabled={connecting}>
            <Plus className="h-4 w-4" />
            Add another account
          </DropdownMenuItem>
          {activeAccount.status === 'expired' && (
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleAddAccount}>
              <Clock className="h-4 w-4 text-amber-500" />
              Reconnect {activeAccount.email}
            </DropdownMenuItem>
          )}
          {accounts.length > 0 && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              onClick={() => setDisconnectId(activeAccount.id)}
            >
              <Unplug className="h-4 w-4" />
              Disconnect {activeAccount.email}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectId} onOpenChange={(open) => !open && setDisconnectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove access to {accounts.find((a) => a.id === disconnectId)?.email ?? 'this account'}. You won&apos;t be able to send or receive emails from this account in AcquisitionOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
