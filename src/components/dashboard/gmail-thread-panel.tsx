'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Star,
  Link2,
  ExternalLink,
  ChevronLeft,
  Loader2,
  Send,
  MoreVertical,
  Clock,
  CheckCheck,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchGmailThread, replyGmailEmail, type GmailAccountSummary } from '@/lib/api';

type GmailAccount = GmailAccountSummary;

interface GmailMessage {
  id: string;
  from: string;
  fromEmail?: string;
  date: string;
  to: string[];
  cc?: string[];
  labels: string[];
  body?: string;
  html?: string;
  attachments?: { filename: string; size: number }[];
  leadId?: string;
  leadName?: string;
  isRead?: boolean;
}

interface GmailThread {
  id: string;
  subject?: string;
  participants: string[];
  isStarred?: boolean;
  leadId?: string;
  date: string;
}

interface GmailThreadData {
  thread: GmailThread;
  messages: GmailMessage[];
}
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface GmailThreadPanelProps {
  threadId: string | null;
  open: boolean;
  onClose: () => void;
  accounts: GmailAccount[];
  activeAccountId: string | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffHr < 1) {
    const diffMin = Math.floor(diffMs / 60000);
    return `${diffMin}m ago`;
  }
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function MessageCard({
  message,
  isLast,
  onReply,
}: {
  message: GmailMessage;
  isLast: boolean;
  onReply: (messageId: string, replyAll: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={cn('relative', !isLast && 'pb-2')}>
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-2 w-px bg-border" />
      )}

      <div
        className={cn(
          'rounded-lg border bg-card p-3 sm:p-4 transition-all',
          !message.isRead && 'border-primary/20 bg-primary/[0.02]'
        )}
      >
        {/* Message header */}
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
            <AvatarFallback className="text-xs bg-emerald-500/10 text-emerald-600">
              {getInitials(message.from)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium">{message.from}</span>
                <span className="text-xs text-muted-foreground ml-1.5">&lt;{message.fromEmail}&gt;</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  {formatFullDate(message.date)}
                </span>
                <span className="text-[10px] text-muted-foreground sm:hidden">
                  {formatDate(message.date)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onReply(message.id, false)}>
                      <Reply className="mr-2 h-4 w-4" /> Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReply(message.id, true)}>
                      <ReplyAll className="mr-2 h-4 w-4" /> Reply All
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Forward className="mr-2 h-4 w-4" /> Forward
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {/* Recipients */}
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              to {message.to.join(', ')}
              {message.cc && message.cc.length > 0 && (
                <span> · cc {message.cc.join(', ')}</span>
              )}
            </p>
          </div>
        </div>

        {/* Collapsible body */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 pl-0 sm:pl-12"
          >
            {/* Labels */}
            {message.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {message.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-[9px] h-4 px-1.5">
                    {label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 max-h-[400px] overflow-auto">
              {message.body || (message.html ? '[HTML content]' : '(No content)')}
            </div>

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  {message.attachments.length} attachment{message.attachments.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate max-w-[120px]">{att.filename}</span>
                      <span className="text-muted-foreground">
                        {att.size > 1048576
                          ? `${(att.size / 1048576).toFixed(1)}MB`
                          : `${(att.size / 1024).toFixed(0)}KB`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lead linked badge */}
            {message.leadId && (
              <div className="mt-3 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-emerald-500" />
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                  <ExternalLink className="h-2.5 w-2.5" />
                  Lead: {message.leadName || 'Linked'}
                </Badge>
              </div>
            )}
          </motion.div>
        )}

        {/* Toggle expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] text-primary hover:text-primary/80 transition-colors pl-0 sm:pl-12"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
    </div>
  );
}

export default function GmailThreadPanel({
  threadId,
  open,
  onClose,
  accounts,
  activeAccountId,
}: GmailThreadPanelProps) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [replyAll, setReplyAll] = useState(false);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Fetch thread details
  const { data: threadData, isLoading, error } = useQuery({
    queryKey: ['gmail-thread', threadId],
    queryFn: async (): Promise<GmailThreadData> => {
      const detail = await fetchGmailThread(threadId!);
      return detail as unknown as GmailThreadData;
    },
    enabled: !!threadId && open,
  });

  const thread = threadData?.thread;
  const messages = threadData?.messages ?? [];

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ messageId, body, replyAll: ra }: { messageId: string; body: string; replyAll: boolean }) => {
      const accountId = activeAccountId ?? accounts.find((a) => a.status === 'active')?.id;
      if (!accountId) throw new Error('No active Gmail account');

      return replyGmailEmail({
        emailAccountId: accountId,
        messageId,
        body,
        replyAll: ra,
      });
    },
    onSuccess: () => {
      toast.success(replyAll ? 'Reply All sent' : 'Reply sent');
      setReplyText('');
      setReplyingToMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['gmail-thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
    },
    onError: () => {
      toast.error('Failed to send reply');
    },
  });

  const handleReply = (messageId: string, isReplyAll: boolean) => {
    setReplyingToMessageId(messageId);
    setReplyAll(isReplyAll);
    setReplyText('');
  };

  const handleSendReply = () => {
    if (!replyingToMessageId || !replyText.trim()) return;
    replyMutation.mutate({
      messageId: replyingToMessageId,
      body: replyText,
      replyAll,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && replyText.trim() && replyingToMessageId) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // Loading state
  const loadingContent = (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Separator />
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  );

  // Error state
  const errorContent = (
    <div className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h3 className="text-sm font-medium">Failed to load thread</h3>
      <p className="text-xs text-muted-foreground">There was an error loading this conversation.</p>
      <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['gmail-thread', threadId] })}>
        Try Again
      </Button>
    </div>
  );

  // Main content
  const mainContent = (() => {
    if (isLoading) return loadingContent;
    if (error || !thread) return errorContent;

    return (
      <div className="flex flex-col h-full">
        {/* Thread header */}
        <div className="p-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold leading-tight">{thread.subject}</h2>
              <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                {thread.participants.slice(0, 4).map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] h-5 px-1.5">
                    {p}
                  </Badge>
                ))}
                {thread.participants.length > 4 && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    +{thread.participants.length - 4} more
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {thread.isStarred && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
              {thread.leadId && (
                <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600 gap-0.5">
                  <Link2 className="h-2.5 w-2.5" />
                  Lead
                </Badge>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatFullDate(thread.date)}
            </span>
            <span className="flex items-center gap-1">
              <CheckCheck className="h-3 w-3" />
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <AnimatePresence>
              {messages.map((message, idx) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  isLast={idx === messages.length - 1 && !replyingToMessageId}
                  onReply={handleReply}
                />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Reply box */}
        {replyingToMessageId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t p-4 shrink-0 bg-muted/20"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {replyAll ? 'Reply All' : 'Reply'}
                </span>
                <button
                  onClick={() => setReplyAll(!replyAll)}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  Switch to {replyAll ? 'Reply' : 'Reply All'}
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setReplyingToMessageId(null);
                  setReplyText('');
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              placeholder="Write your reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[80px] text-sm resize-none mb-2"
              disabled={replyMutation.isPending}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Ctrl+Enter to send
              </span>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSendReply}
                disabled={!replyText.trim() || replyMutation.isPending}
              >
                {replyMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send
              </Button>
            </div>
          </motion.div>
        )}

        {/* Quick reply button (when no reply active) */}
        {!replyingToMessageId && messages.length > 0 && (
          <div className="border-t p-3 shrink-0 bg-muted/10">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs flex-1 border-primary/20"
                onClick={() => handleReply(messages[messages.length - 1].id, false)}
              >
                <Reply className="h-3.5 w-3.5" /> Reply
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs flex-1 border-primary/20"
                onClick={() => handleReply(messages[messages.length - 1].id, true)}
              >
                <ReplyAll className="h-3.5 w-3.5" /> Reply All
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  })();

  // Mobile: Sheet (full screen overlay)
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="h-[95vh] rounded-t-2xl p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Email Thread</SheetTitle>
            <SheetDescription>Email conversation thread</SheetDescription>
          </SheetHeader>
          <div className="flex items-center border-b px-4 py-2 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" onClick={onClose}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium truncate">
              {thread?.subject ?? 'Thread'}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {mainContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Dialog side panel
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Email Thread</DialogTitle>
          <DialogDescription>Email conversation thread</DialogDescription>
        </DialogHeader>
        {/* Close button in top-right */}
        <div className="flex items-center border-b px-4 py-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium truncate">
            {thread?.subject ?? 'Thread'}
          </span>
        </div>
        {mainContent}
      </DialogContent>
    </Dialog>
  );
}
