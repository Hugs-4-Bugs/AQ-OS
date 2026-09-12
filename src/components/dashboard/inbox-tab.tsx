'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Inbox,
  Send,
  RefreshCw,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  Link2,
  ExternalLink,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Reply,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  fetchGmailAccounts,
  fetchGmailThreads,
  fetchGmailStatus,
  type GmailAccountSummary,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import GmailConnectCard from './gmail-connect-card';
import GmailSyncStatusIndicator from './gmail-sync-status';
import GmailAccountSwitcher from './gmail-account-switcher';
import GmailThreadPanel from './gmail-thread-panel';
import GmailComposeDialog from './gmail-compose-dialog';

// ─── Helper Functions ─────────────────────────────────────────

type GmailAccount = GmailAccountSummary;

interface GmailThread {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  leadId?: string | null;
  leadName?: string | null;
  labels: string[];
  messageCount: number;
}

async function syncGmailInbox(emailAccountId?: string): Promise<void> {
  const res = await fetch('/api/gmail/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAccountId }),
  });
  if (!res.ok) throw new Error('Failed to sync inbox');
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatThreadDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHr = Math.floor(diffMs / 3600000);

  // Today: show time
  if (diffHr < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  // Yesterday
  if (diffHr < 48) return 'Yesterday';
  // This year: show month/day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Older: show full date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '...';
}

const LABEL_COLORS: Record<string, string> = {
  INBOX: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
  IMPORTANT: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  SENT: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  DRAFT: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
  SPAM: 'bg-red-500/15 text-red-500 border-red-500/25',
  TRASH: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
  STARRED: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  UNREAD: 'bg-primary/15 text-primary border-primary/25',
  CATEGORY_PERSONAL: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/25',
  CATEGORY_SOCIAL: 'bg-purple-500/15 text-purple-500 border-purple-500/25',
  CATEGORY_PROMOTIONS: 'bg-orange-500/15 text-orange-500 border-orange-500/25',
  CATEGORY_UPDATES: 'bg-teal-500/15 text-teal-500 border-teal-500/25',
};

function getLabelStyle(label: string): string {
  return LABEL_COLORS[label] ?? 'bg-muted text-muted-foreground border-border';
}

// ─── Thread List Item Component ────────────────────────────────

function ThreadListItem({
  thread,
  isSelected,
  onClick,
}: {
  thread: GmailThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'w-full text-left rounded-lg border p-3 sm:p-4 transition-all duration-200',
        'hover:border-primary/30 hover:bg-primary/[0.02]',
        isSelected ? 'border-primary/30 bg-primary/[0.05]' : 'border-border bg-card',
        !thread.isRead && 'border-l-2 border-l-primary'
      )}
      onClick={onClick}
      aria-label={`Email thread: ${thread.subject}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
          <AvatarFallback className="text-xs bg-emerald-500/10 text-emerald-600 font-medium">
            {getInitials(thread.from)}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn('text-sm truncate', !thread.isRead && 'font-semibold')}>
                {thread.from}
              </span>
              {!thread.isRead && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {thread.isStarred && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
              <span className="text-[11px] text-muted-foreground">{formatThreadDate(thread.date)}</span>
            </div>
          </div>

          {/* Subject */}
          <p className={cn('text-sm truncate mt-0.5', !thread.isRead && 'font-medium')}>
            {thread.subject}
          </p>

          {/* Preview */}
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {truncateText(thread.snippet, 80)}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {thread.hasAttachments && (
              <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {thread.messageCount > 1 && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5">
                <Reply className="h-2.5 w-2.5" />
                {thread.messageCount}
              </Badge>
            )}
            {thread.labels.slice(0, 3).map((label) => (
              <Badge
                key={label}
                variant="outline"
                className={cn('text-[9px] h-4 px-1 border', getLabelStyle(label))}
              >
                {label.replace('CATEGORY_', '')}
              </Badge>
            ))}
            {thread.labels.length > 3 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                +{thread.labels.length - 3}
              </Badge>
            )}
            {thread.leadId && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/30 text-emerald-600 gap-0.5">
                <Link2 className="h-2.5 w-2.5" />
                {thread.leadName || 'Lead'}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Mobile Thread Card ────────────────────────────────────────

function MobileThreadCard({
  thread,
  isSelected,
  onClick,
}: {
  thread: GmailThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all duration-200 active:scale-[0.98]',
        'hover:border-primary/30',
        isSelected ? 'border-primary/30 bg-primary/[0.05]' : 'border-border bg-card',
        !thread.isRead && 'border-l-2 border-l-primary'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="text-[10px] bg-emerald-500/10 text-emerald-600 font-medium">
            {getInitials(thread.from)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-sm truncate', !thread.isRead && 'font-semibold')}>
              {thread.from}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {!thread.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
              <span className="text-[10px] text-muted-foreground">{formatThreadDate(thread.date)}</span>
            </div>
          </div>
          <p className={cn('text-sm truncate mt-0.5', !thread.isRead && 'font-medium')}>
            {thread.subject}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {truncateText(thread.snippet, 60)}
          </p>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {thread.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
            {thread.messageCount > 1 && (
              <Badge variant="secondary" className="text-[8px] h-3.5 px-1">{thread.messageCount}</Badge>
            )}
            {thread.leadId && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-500/30 text-emerald-600">
                <Link2 className="h-2 w-2 mr-0.5" />Lead
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Loading Skeletons ─────────────────────────────────────────

function ThreadListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border">
          <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SyncingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Mail className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <RefreshCw className="h-3 w-3 text-white animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">Syncing your inbox</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Fetching your emails from Gmail. This may take a moment...
        </p>
      </div>
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
    </div>
  );
}

// ─── Empty States ──────────────────────────────────────────────

function EmptyInboxState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
        <Inbox className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">
          {hasSearch ? 'No emails found' : 'Your inbox is empty'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {hasSearch
            ? 'Try adjusting your search query or filters.'
            : 'When you receive emails, they\'ll appear here. Try syncing your inbox.'}
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" /> Try Again
      </Button>
    </div>
  );
}

// ─── Main Inbox Tab ────────────────────────────────────────────

export default function InboxTab() {
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeLead, setComposeLead] = useState<{ name: string; email: string } | null>(null);

  // Fetch Gmail status
  const { data: gmailStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: fetchGmailStatus,
    refetchInterval: 30000,
  });

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['gmail-accounts'],
    queryFn: fetchGmailAccounts,
  });

  const accounts: GmailAccount[] = accountsData?.accounts ?? [];
  const connected = gmailStatus?.connected ?? false;
  const isSyncing = gmailStatus?.syncStatus === 'syncing';

  // Set active account on first load
  React.useEffect(() => {
    if (accountsData && !activeAccountId) {
      const activeId = accountsData.activeAccountId;
      if (activeId) {
        setActiveAccountId(activeId);
      } else if (accounts.length > 0) {
        const firstActive = accounts.find((a) => a.status === 'active');
        if (firstActive) setActiveAccountId(firstActive.id);
      }
    }
  }, [accountsData, activeAccountId, accounts]);

  // Fetch threads
  const { data: threadsData, isLoading: threadsLoading, error: threadsError } = useQuery({
    queryKey: ['gmail-threads', { activeAccountId, search }],
    queryFn: () => fetchGmailThreads({
      emailAccountId: activeAccountId ?? undefined,
      query: search || undefined,
      limit: 25,
    }),
    enabled: connected && !!activeAccountId,
  });

  const threads = (threadsData?.threads ?? []) as GmailThread[];
  const pagination = threadsData?.pagination;

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => syncGmailInbox(activeAccountId ?? undefined),
    onSuccess: () => {
      toast.success('Inbox synced');
      queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
      queryClient.invalidateQueries({ queryKey: ['gmail-status'] });
    },
    onError: () => {
      toast.error('Failed to sync inbox');
    },
  });

  const handleSync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  const handleAccountChange = useCallback((accountId: string) => {
    setActiveAccountId(accountId);
    setSelectedThreadId(null);
    setSearch('');
  }, []);

  const handleAccountsChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['gmail-status'] });
  }, [queryClient]);

  const handleComposeFromLead = useCallback((lead: { name: string; email: string }) => {
    setComposeLead(lead);
    setComposeOpen(true);
  }, []);

  // If not connected, show connect card
  if (!statusLoading && !connected) {
    return <GmailConnectCard />;
  }

  // If syncing for the first time
  if (isSyncing && threads.length === 0 && threadsLoading) {
    return (
      <div className="p-4 lg:p-6">
        <SyncingSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 pb-24 lg:pb-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3">
        {/* Top row: Account switcher + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <GmailAccountSwitcher
            accounts={accounts}
            activeAccountId={activeAccountId}
            onAccountChange={handleAccountChange}
            onAccountsChanged={handleAccountsChanged}
          />
          <div className="ml-auto flex items-center gap-2">
            <GmailSyncStatusIndicator
              status={gmailStatus}
              onSyncNow={handleSync}
              isSyncing={syncMutation.isPending}
              compact
            />
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setComposeLead(null);
                setComposeOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compose</span>
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails... (e.g. from:john subject:proposal)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 border-primary/20 focus-visible:ring-primary/30 min-h-[44px]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Thread count */}
      {pagination && (
        <p className="text-sm text-muted-foreground">
          {pagination.total} email{pagination.total !== 1 ? 's' : ''} {search ? 'found' : 'in inbox'}
        </p>
      )}

      {/* Error state */}
      {threadsError && (
        <ErrorState
          message="Failed to load emails. Please check your connection and try again."
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['gmail-threads'] })}
        />
      )}

      {/* Loading state */}
      {threadsLoading && !threadsError && <ThreadListSkeleton />}

      {/* Thread list */}
      {!threadsLoading && !threadsError && (
        <>
          {threads.length === 0 ? (
            <EmptyInboxState hasSearch={!!search} />
          ) : (
            <>
              {/* Desktop thread list */}
              <div className="hidden sm:block space-y-2">
                {threads.map((thread) => (
                  <ThreadListItem
                    key={thread.id}
                    thread={thread}
                    isSelected={selectedThreadId === thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                  />
                ))}
              </div>

              {/* Mobile thread list */}
              <div className="sm:hidden space-y-2">
                {threads.map((thread) => (
                  <MobileThreadCard
                    key={thread.id}
                    thread={thread}
                    isSelected={selectedThreadId === thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs border-primary/20"
                      disabled={pagination.page <= 1}
                      onClick={() => {
                        queryClient.invalidateQueries({
                          queryKey: ['gmail-threads', { activeAccountId, search, page: pagination.page - 1 }],
                        });
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs border-primary/20"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => {
                        queryClient.invalidateQueries({
                          queryKey: ['gmail-threads', { activeAccountId, search, page: pagination.page + 1 }],
                        });
                      }}
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Thread Detail Panel */}
      <GmailThreadPanel
        threadId={selectedThreadId}
        open={!!selectedThreadId}
        onClose={() => setSelectedThreadId(null)}
        accounts={accounts}
        activeAccountId={activeAccountId}
      />

      {/* Compose Dialog */}
      <GmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        activeAccountId={activeAccountId}
        leadContext={composeLead}
      />
    </div>
  );
}
