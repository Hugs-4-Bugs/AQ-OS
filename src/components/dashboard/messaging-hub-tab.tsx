'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MessageCircle,
  Phone,
  Search,
  Plus,
  ChevronLeft,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Send,
  Sparkles,
  FileText,
  ArrowDown,
  Filter,
  MessageSquare,
  RefreshCw,
  Inbox,
  Hash,
  Bot,
  User,
  ExternalLink,
  Save,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── TypeScript Interfaces ──────────────────────────────────

type MessageChannel = 'all' | 'gmail' | 'telegram' | 'whatsapp';
type MessageFilter = 'all' | 'unread' | 'starred' | 'drafts';
type SenderType = 'user' | 'lead' | 'ai';
type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

interface ConversationItem {
  id: string;
  leadId: string;
  leadName: string;
  leadAvatar?: string;
  channel: 'gmail' | 'telegram' | 'whatsapp';
  subject?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  status: 'active' | 'closed' | 'archived';
  leadStage?: string;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderName: string;
  content: string;
  channel: string;
  direction: 'inbound' | 'outbound';
  status: MessageStatus;
  aiGenerated: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface TemplateItem {
  id: string;
  name: string;
  channel: string;
  content: string;
  subject?: string;
  createdAt: string;
}

interface AccountItem {
  id: string;
  label: string;
  channel: MessageChannel;
  email?: string;
  connected: boolean;
}

// ─── Channel Configuration ──────────────────────────────────

const CHANNEL_CONFIG: Record<Exclude<MessageChannel, 'all'>, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  gmail: { label: 'Gmail', icon: Mail, color: 'text-emerald-600', bgColor: 'bg-emerald-500/10' },
  telegram: { label: 'Telegram', icon: Send, color: 'text-teal-600', bgColor: 'bg-teal-500/10' },
  whatsapp: { label: 'WhatsApp', icon: Phone, color: 'text-green-600', bgColor: 'bg-green-500/10' },
};

const CHANNEL_TABS: { value: MessageChannel; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: MessageSquare },
  { value: 'gmail', label: 'Gmail', icon: Mail },
  { value: 'telegram', label: 'Telegram', icon: Send },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone },
];

const FILTER_OPTIONS: { value: MessageFilter; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Inbox },
  { value: 'unread', label: 'Unread', icon: Mail },
  { value: 'starred', label: 'Starred', icon: Star },
  { value: 'drafts', label: 'Drafts', icon: FileText },
];

// ─── Helper Functions ───────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDay = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDay === 0) return 'Today';
  if (diffDay === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '...';
}

function getChannelIcon(channel: string, size = 'h-3.5 w-3.5') {
  switch (channel) {
    case 'gmail': return <Mail className={cn(size, 'text-emerald-500')} />;
    case 'telegram': return <Send className={cn(size, 'text-teal-500')} />;
    case 'whatsapp': return <Phone className={cn(size, 'text-green-500')} />;
    default: return <MessageSquare className={cn(size, 'text-muted-foreground')} />;
  }
}

function getStatusIcon(status: MessageStatus) {
  switch (status) {
    case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read': return <CheckCheck className="h-3 w-3 text-emerald-500" />;
    case 'failed': return <AlertCircle className="h-3 w-3 text-destructive" />;
  }
}

// ─── Data (loaded from API) ────────────────────────────────────────

const accounts: AccountItem[] = [];
const conversations: ConversationItem[] = [];
const messages: Record<string, MessageItem[]> = {};
const templates: TemplateItem[] = [];

// ─── API Functions ──────────────────────────────────────────

async function fetchConversations(params?: {
  channel?: MessageChannel;
  search?: string;
  filter?: MessageFilter;
  page?: number;
  limit?: number;
}): Promise<{ conversations: ConversationItem[]; counts: Record<MessageChannel, number> }> {
  let filtered = [...conversations];

  if (params?.channel && params.channel !== 'all') {
    filtered = filtered.filter((c) => c.channel === params.channel);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.leadName.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        (c.subject && c.subject.toLowerCase().includes(q))
    );
  }
  if (params?.filter === 'unread') {
    filtered = filtered.filter((c) => c.unreadCount > 0);
  }
  if (params?.filter === 'starred') {
    filtered = filtered.filter((c) => c.isStarred);
  }
  if (params?.filter === 'drafts') {
    filtered = [];
  }

  // Exclude archived by default
  if (params?.filter !== 'drafts') {
    filtered = filtered.filter((c) => !c.isArchived);
  }

  filtered.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  const counts: Record<MessageChannel, number> = {
    all: conversations.filter((c) => !c.isArchived).reduce((sum, c) => sum + c.unreadCount, 0),
    gmail: conversations.filter((c) => c.channel === 'gmail' && !c.isArchived).reduce((sum, c) => sum + c.unreadCount, 0),
    telegram: conversations.filter((c) => c.channel === 'telegram' && !c.isArchived).reduce((sum, c) => sum + c.unreadCount, 0),
    whatsapp: conversations.filter((c) => c.channel === 'whatsapp' && !c.isArchived).reduce((sum, c) => sum + c.unreadCount, 0),
  };

  return { conversations: filtered, counts };
}

async function fetchConversationMessages(conversationId: string): Promise<MessageItem[]> {
  return messages[conversationId] || [];
}

async function sendMessage(conversationId: string, content: string): Promise<MessageItem> {
  await new Promise((r) => setTimeout(r, 500));
  return {
    id: `msg-${Date.now()}`,
    conversationId,
    senderType: 'user',
    senderName: 'You',
    content,
    channel: 'gmail',
    direction: 'outbound',
    status: 'sent',
    aiGenerated: false,
    createdAt: new Date().toISOString(),
  };
}

async function fetchTemplates(channel?: string): Promise<TemplateItem[]> {
  let filtered = [...templates];
  if (channel && channel !== 'all') {
    filtered = filtered.filter((t) => t.channel === channel);
  }
  return filtered;
}

async function generateAIDraft(conversationId: string, context?: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1500));
  return 'Hi there,\n\nThank you for your interest! I\'d be happy to help you with that. Let me put together some options and get back to you shortly.\n\nBest regards';
}

// ─── Conversation List Item ─────────────────────────────────

function ConversationListItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const channelConfig = CHANNEL_CONFIG[conversation.channel];

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all duration-200',
        'hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]',
        isSelected
          ? 'border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20'
          : 'border-border bg-card',
        conversation.unreadCount > 0 && !isSelected && 'border-l-2 border-l-emerald-500'
      )}
      onClick={onClick}
      aria-label={`Conversation with ${conversation.leadName}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
            <AvatarFallback className={cn('text-[10px] font-medium', channelConfig.bgColor, channelConfig.color)}>
              {getInitials(conversation.leadName)}
            </AvatarFallback>
          </Avatar>
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center border-2 border-background',
            channelConfig.bgColor
          )}>
            <channelConfig.icon className="h-2 w-2" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <span className={cn('text-sm truncate', conversation.unreadCount > 0 && 'font-semibold')}>
                {conversation.leadName}
              </span>
              {conversation.unreadCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-label="Unread" />
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {conversation.isStarred && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatRelativeDate(conversation.lastMessageAt)}
              </span>
            </div>
          </div>

          {/* Subject (for email) */}
          {conversation.subject && (
            <p className={cn('text-xs truncate mt-0.5', conversation.unreadCount > 0 && 'font-medium')}>
              {conversation.subject}
            </p>
          )}

          {/* Preview */}
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {truncateText(conversation.lastMessage, 60)}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-1">
            {conversation.leadStage && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-500/25 text-emerald-600 capitalize">
                {conversation.leadStage}
              </Badge>
            )}
            {conversation.unreadCount > 1 && (
              <Badge className="text-[8px] h-4 px-1 bg-emerald-600 text-white hover:bg-emerald-700">
                {conversation.unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Loading Skeletons ──────────────────────────────────────

function ConversationListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg border">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageThreadSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn('flex gap-2.5', i % 2 === 1 && 'flex-row-reverse')}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="space-y-2 max-w-[70%]">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-20 w-64 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty States ───────────────────────────────────────────

function EmptyConversationState({ hasSearch, hasFilter }: { hasSearch: boolean; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <Inbox className="h-7 w-7 text-emerald-500/60" />
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold">
          {hasSearch ? 'No conversations found' : hasFilter ? 'No matching conversations' : 'No messages yet'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
          {hasSearch
            ? 'Try adjusting your search query.'
            : hasFilter
            ? 'Try changing the filter to see more conversations.'
            : 'Connect your Gmail, Telegram, or WhatsApp to start messaging leads.'}
        </p>
      </div>
    </div>
  );
}

function EmptyDetailState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
      <div className="relative">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <MessageSquare className="h-10 w-10 text-emerald-500/40" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-teal-500/10 flex items-center justify-center">
          <ArrowDown className="h-4 w-4 text-teal-500/60" />
        </div>
      </div>
      <div className="text-center max-w-xs">
        <h3 className="text-base font-semibold">Select a conversation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a conversation from the list to view messages and reply.
        </p>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/25 text-emerald-600">
          <Mail className="h-2.5 w-2.5" /> Gmail
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1 border-teal-500/25 text-teal-600">
          <Send className="h-2.5 w-2.5" /> Telegram
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1 border-green-500/25 text-green-600">
          <Phone className="h-2.5 w-2.5" /> WhatsApp
        </Badge>
      </div>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────

function MessageBubble({ message }: { message: MessageItem }) {
  const isUser = message.senderType === 'user';
  const isAI = message.senderType === 'ai';
  const isInbound = message.direction === 'inbound';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-2.5 max-w-[85%]', isInbound ? 'self-start' : 'self-end flex-row-reverse')}
    >
      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0 mt-1">
        <AvatarFallback className={cn(
          'text-[8px] font-medium',
          isAI ? 'bg-teal-500/10 text-teal-600' :
          isUser ? 'bg-emerald-500/10 text-emerald-600' :
          'bg-amber-500/10 text-amber-600'
        )}>
          {isAI ? <Bot className="h-3 w-3" /> : getInitials(message.senderName)}
        </AvatarFallback>
      </Avatar>

      {/* Bubble */}
      <div className={cn(
        'rounded-2xl px-3.5 py-2.5 max-w-full',
        isInbound
          ? 'bg-muted rounded-tl-sm'
          : isAI
          ? 'bg-teal-500/10 border border-teal-500/20 rounded-tr-sm'
          : 'bg-emerald-600 text-white rounded-tr-sm'
      )}>
        {/* Sender label */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn(
            'text-[10px] font-medium',
            isInbound ? 'text-amber-600' : isAI ? 'text-teal-600' : 'text-emerald-200'
          )}>
            {message.senderName}
            {isAI && ' (AI Draft)'}
          </span>
          <span className={cn(
            'text-[9px]',
            isInbound ? 'text-muted-foreground' : 'text-emerald-300'
          )}>
            {formatFullTime(message.createdAt)}
          </span>
        </div>

        {/* Content */}
        <p className={cn(
          'text-sm whitespace-pre-wrap leading-relaxed',
          !isInbound && !isAI && 'text-white',
          isAI && 'text-foreground'
        )}>
          {message.content}
        </p>

        {/* Status */}
        {!isInbound && (
          <div className="flex items-center justify-end gap-1 mt-1">
            {getStatusIcon(message.status)}
            <span className={cn('text-[9px]', !isInbound && !isAI ? 'text-emerald-200' : 'text-muted-foreground')}>
              {message.status === 'sent' ? 'Sent' :
               message.status === 'delivered' ? 'Delivered' :
               message.status === 'read' ? 'Read' : 'Failed'}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Template Picker Popover ────────────────────────────────

function TemplatePicker({
  channel,
  onSelect,
  children,
}: {
  channel: string;
  onSelect: (template: TemplateItem) => void;
  children: React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState<TemplateItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const loading = templates === null && open;

  useEffect(() => {
    if (!open || templates !== null) return;
    let cancelled = false;
    fetchTemplates(channel).then((t) => {
      if (!cancelled) setTemplates(t);
    }).catch(() => {
      if (!cancelled) setTemplates([]);
    });
    return () => { cancelled = true; };
  }, [open, channel, templates]);

  const allTemplates = templates ?? [];
  const filtered = search
    ? allTemplates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase()))
    : allTemplates;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTemplates(null); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Message Templates</h4>
            <Badge variant="secondary" className="text-[9px] h-4">{filtered.length}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs border-emerald-500/20 focus-visible:ring-emerald-500/30"
            />
          </div>
        </div>
        <ScrollArea className="max-h-64">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">No templates found</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    onSelect(template);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-emerald-500/5 transition-colors border border-transparent hover:border-emerald-500/20"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{template.name}</span>
                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 capitalize">
                      {template.channel}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {template.content.replace(/\{\{.*?\}\}/g, '...')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Account Switcher ───────────────────────────────────────

function AccountSwitcher({
  accounts,
  activeAccountId,
  onAccountChange,
}: {
  accounts: AccountItem[];
  activeAccountId: string | null;
  onAccountChange: (id: string) => void;
}) {
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-emerald-500/20 hover:border-emerald-500/40 max-w-[200px]">
          <div className={cn('h-3 w-3 rounded-full', activeAccount?.connected ? 'bg-emerald-500' : 'bg-muted-foreground')} />
          <span className="truncate">{activeAccount?.label || 'All Accounts'}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => onAccountChange('all')}
          className={cn(activeAccountId === 'all' || !activeAccountId ? 'bg-emerald-500/5' : '')}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-2 text-emerald-500" />
          All Accounts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {accounts.map((account) => {
          const ChannelIcon = CHANNEL_CONFIG[account.channel]?.icon || MessageSquare;
          return (
            <DropdownMenuItem
              key={account.id}
              onClick={() => onAccountChange(account.id)}
              className={cn(activeAccountId === account.id ? 'bg-emerald-500/5' : '')}
            >
              <ChannelIcon className="h-3.5 w-3.5 mr-2" />
              <span className="truncate flex-1">{account.label}</span>
              <div className={cn('h-2 w-2 rounded-full', account.connected ? 'bg-emerald-500' : 'bg-muted-foreground')} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Compose Dialog ─────────────────────────────────────────

function ComposeMessageDialog({
  open,
  onOpenChange,
  channel,
  leadName,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: MessageChannel;
  leadName?: string;
  onSend: (content: string, subject?: string) => void;
}) {
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await onSend(content.trim(), subject.trim() || undefined);
      setContent('');
      setSubject('');
      onOpenChange(false);
      toast.success('Message sent');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }, [content, subject, onSend, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setContent('');
      setSubject('');
    }
  }, [open]);

  const ChannelIcon = channel === 'all' ? MessageSquare : CHANNEL_CONFIG[channel]?.icon || MessageSquare;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: open ? 1 : 0, y: open ? 0 : 20 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 bg-background border-t border-emerald-500/20 shadow-lg rounded-t-xl',
        !open && 'pointer-events-none'
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChannelIcon className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium">New Message</span>
            {leadName && (
              <Badge variant="outline" className="text-[9px] border-emerald-500/25 text-emerald-600">
                to: {leadName}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {(channel === 'gmail' || channel === 'all') && (
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 text-xs border-emerald-500/20 focus-visible:ring-emerald-500/30"
          />
        )}

        <Textarea
          placeholder="Write your message..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[80px] text-sm border-emerald-500/20 focus-visible:ring-emerald-500/30 resize-none"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TemplatePicker
              channel={channel === 'all' ? 'gmail' : channel}
              onSelect={(tpl) => {
                setContent(tpl.content);
                if (tpl.subject) setSubject(tpl.subject);
              }}
            >
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                <FileText className="h-3 w-3" /> Templates
              </Button>
            </TemplatePicker>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[10px] border-emerald-500/20"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSend}
              disabled={!content.trim() || sending}
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main MessagingHubTab Component ─────────────────────────

export default function MessagingHubTab() {
  const queryClient = useQueryClient();

  // ── State ──
  const [activeChannel, setActiveChannel] = useState<MessageChannel>('all');
  const [activeFilter, setActiveFilter] = useState<MessageFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Queries ──
  const { data: conversationsData, isLoading: conversationsLoading, error: conversationsError } = useQuery({
    queryKey: ['messaging-conversations', { activeChannel, search, activeFilter }],
    queryFn: () => fetchConversations({ channel: activeChannel, search: search || undefined, filter: activeFilter }),
    refetchInterval: 30000,
  });

  const conversations = conversationsData?.conversations ?? [];
  const channelCounts = conversationsData?.counts ?? { all: 0, gmail: 0, telegram: 0, whatsapp: 0 };

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) || null;

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['messaging-messages', selectedConversationId],
    queryFn: () => fetchConversationMessages(selectedConversationId!),
    enabled: !!selectedConversationId,
  });

  // ── Mutations ──
  const sendMessageMutation = useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      sendMessage(conversationId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging-messages', selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] });
      toast.success('Message sent');
      setMessageInput('');
      setDraftSaved(false);
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  // ── Auto-scroll to bottom when messages change ──
  useEffect(() => {
    if (messages.length > 0 && messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // ── Draft auto-save ──
  useEffect(() => {
    if (!messageInput.trim()) {
      setDraftSaved(false);
      return;
    }

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    draftTimerRef.current = setTimeout(() => {
      // Simulate draft save
      setDraftSaved(true);
    }, 1500);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [messageInput]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // "/" to focus search
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Esc to close detail
      if (e.key === 'Escape') {
        if (showMobileDetail) {
          setShowMobileDetail(false);
        } else if (selectedConversationId) {
          setSelectedConversationId(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedConversationId, showMobileDetail]);

  // ── Handlers ──
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setShowMobileDetail(true);
    setMessageInput('');
    setDraftSaved(false);
  }, []);

  const handleBackToList = useCallback(() => {
    setShowMobileDetail(false);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate({ conversationId: selectedConversationId, content: messageInput.trim() });
  }, [messageInput, selectedConversationId, sendMessageMutation]);

  const handleAIGenerate = useCallback(async () => {
    if (!selectedConversationId) return;
    setIsGeneratingAI(true);
    try {
      const draft = await generateAIDraft(selectedConversationId);
      setMessageInput(draft);
      setDraftSaved(false);
      toast.success('AI draft generated', { description: 'Review and edit before sending' });
      messageInputRef.current?.focus();
    } catch {
      toast.error('Failed to generate AI draft');
    } finally {
      setIsGeneratingAI(false);
    }
  }, [selectedConversationId]);

  const handleInsertTemplate = useCallback((template: TemplateItem) => {
    setMessageInput(template.content.replace(/\{\{.*?\}\}/g, '...'));
    setDraftSaved(false);
    messageInputRef.current?.focus();
  }, []);

  const handleStarConversation = useCallback((id: string) => {
    // Simulated — replace with real API call
    toast.success('Conversation starred');
    queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] });
  }, [queryClient]);

  const handleArchiveConversation = useCallback((id: string) => {
    // Simulated — replace with real API call
    toast.success('Conversation archived');
    if (selectedConversationId === id) {
      setSelectedConversationId(null);
      setShowMobileDetail(false);
    }
    queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] });
  }, [queryClient, selectedConversationId]);

  const handleComposeSend = useCallback((content: string, subject?: string) => {
    // Simulated — replace with real API call
    return Promise.resolve();
  }, []);

  const handleAccountChange = useCallback((id: string) => {
    setActiveAccountId(id === 'all' ? null : id);
  }, []);

  // ── Group messages by date ──
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: MessageItem[] }[] = [];
    let currentDate = '';

    for (const msg of messages) {
      const msgDate = formatFullDate(msg.createdAt);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  }, [messages]);

  // ── Current conversation channel for template picker ──
  const currentChannel = selectedConversation?.channel || 'gmail';

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur-md">
        {/* Channel Tabs + Actions */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-3">
          {/* Channel Tabs */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 overflow-x-auto no-scrollbar">
            {CHANNEL_TABS.map((tab) => {
              const Icon = tab.icon;
              const count = channelCounts[tab.value] || 0;
              const isActive = activeChannel === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveChannel(tab.value)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {count > 0 && (
                    <Badge className={cn(
                      'ml-0.5 text-[8px] h-4 min-w-[16px] px-1',
                      isActive ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                    )}>
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <AccountSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              onAccountChange={handleAccountChange}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700"
                    onClick={() => setComposeOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Compose</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New message</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative px-3 sm:px-4 py-2">
          <Search className="absolute left-6 sm:left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search conversations... (press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 sm:pl-10 pr-8 h-9 text-sm border-emerald-500/15 focus-visible:ring-emerald-500/30"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-5 sm:right-6 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Content: Split Panel ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* ── Left Panel: Conversation List ── */}
        <div className={cn(
          'shrink-0 border-r border-border flex flex-col overflow-hidden',
          // Mobile: full width when no conversation selected, hidden when detail shown
          'w-full lg:w-[340px] xl:w-[380px]',
          showMobileDetail && 'hidden lg:flex'
        )}>
          {/* Filter Bar */}
          <div className="shrink-0 px-3 py-2 border-b bg-muted/20">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {FILTER_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = activeFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setActiveFilter(opt.value)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversation List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {/* Error State */}
              {conversationsError && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">Failed to load conversations</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] })}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </Button>
                </div>
              )}

              {/* Loading */}
              {conversationsLoading && !conversationsError && <ConversationListSkeleton />}

              {/* Empty */}
              {!conversationsLoading && !conversationsError && conversations.length === 0 && (
                <EmptyConversationState hasSearch={!!search} hasFilter={activeFilter !== 'all'} />
              )}

              {/* List */}
              {!conversationsLoading && !conversationsError && conversations.length > 0 && (
                conversations.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedConversationId === conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right Panel: Conversation Detail ── */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0 overflow-hidden',
          // Mobile: full width only when showing detail
          !showMobileDetail && 'hidden lg:flex',
          showMobileDetail && 'flex'
        )}>
          {!selectedConversation ? (
            <EmptyDetailState />
          ) : (
            <>
              {/* Conversation Header */}
              <div className="shrink-0 border-b bg-background/95 backdrop-blur-md px-3 sm:px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  {/* Back button (mobile) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 lg:hidden"
                    onClick={handleBackToList}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Lead info */}
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className={cn(
                      'text-[10px] font-medium',
                      CHANNEL_CONFIG[selectedConversation.channel]?.bgColor,
                      CHANNEL_CONFIG[selectedConversation.channel]?.color
                    )}>
                      {getInitials(selectedConversation.leadName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{selectedConversation.leadName}</h3>
                      {getChannelIcon(selectedConversation.channel)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {selectedConversation.leadStage && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 capitalize border-emerald-500/25 text-emerald-600">
                          {selectedConversation.leadStage}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 capitalize">
                        {selectedConversation.status}
                      </Badge>
                      {selectedConversation.channel === 'gmail' && selectedConversation.subject && (
                        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                          {selectedConversation.subject}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleStarConversation(selectedConversation.id)}
                          >
                            <Star className={cn('h-4 w-4', selectedConversation.isStarred ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground')} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{selectedConversation.isStarred ? 'Unstar' : 'Star'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleArchiveConversation(selectedConversation.id)}>
                          <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Message Thread */}
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-3 p-3 sm:p-4">
                  {messagesLoading ? (
                    <MessageThreadSkeleton />
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-3">
                      <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <MessageCircle className="h-6 w-6 text-emerald-500/60" />
                      </div>
                      <p className="text-sm text-muted-foreground">No messages yet</p>
                      <p className="text-xs text-muted-foreground">Start the conversation by sending a message below.</p>
                    </div>
                  ) : (
                    groupedMessages.map((group, gi) => (
                      <React.Fragment key={gi}>
                        {/* Date separator */}
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted-foreground font-medium px-2">{group.date}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {/* Messages */}
                        {group.messages.map((msg) => (
                          <MessageBubble key={msg.id} message={msg} />
                        ))}
                      </React.Fragment>
                    ))
                  )}
                  <div ref={messageEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input Area */}
              <div className="shrink-0 border-t bg-background/95 backdrop-blur-md">
                {/* Draft indicator */}
                {messageInput.trim() && (
                  <div className="px-3 pt-1.5">
                    <div className="flex items-center gap-1.5">
                      {draftSaved ? (
                        <>
                          <Save className="h-3 w-3 text-emerald-500" />
                          <span className="text-[9px] text-emerald-500">Draft saved</span>
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3 w-3 text-muted-foreground animate-pulse" />
                          <span className="text-[9px] text-muted-foreground">Draft saving...</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3">
                  {/* Template + AI bar */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <TemplatePicker channel={currentChannel} onSelect={handleInsertTemplate}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                        <FileText className="h-3 w-3" /> Templates
                      </Button>
                    </TemplatePicker>

                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-7 gap-1 text-[10px]',
                        isGeneratingAI
                          ? 'text-teal-500'
                          : 'text-muted-foreground hover:text-teal-500'
                      )}
                      onClick={handleAIGenerate}
                      disabled={isGeneratingAI}
                    >
                      {isGeneratingAI ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {isGeneratingAI ? 'Generating...' : 'AI Draft'}
                    </Button>

                    {selectedConversation.channel === 'gmail' && (
                      <Badge variant="outline" className="text-[8px] h-5 gap-0.5 border-emerald-500/20 text-emerald-600">
                        <Mail className="h-2.5 w-2.5" /> Email
                      </Badge>
                    )}
                    {selectedConversation.channel === 'telegram' && (
                      <Badge variant="outline" className="text-[8px] h-5 gap-0.5 border-teal-500/20 text-teal-600">
                        <Send className="h-2.5 w-2.5" /> Telegram
                      </Badge>
                    )}
                    {selectedConversation.channel === 'whatsapp' && (
                      <Badge variant="outline" className="text-[8px] h-5 gap-0.5 border-green-500/20 text-green-600">
                        <Phone className="h-2.5 w-2.5" /> WhatsApp
                      </Badge>
                    )}
                  </div>

                  {/* Textarea + Send */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                      <Textarea
                        ref={messageInputRef}
                        placeholder={`Message ${selectedConversation.leadName}...`}
                        value={messageInput}
                        onChange={(e) => {
                          setMessageInput(e.target.value);
                          setDraftSaved(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="min-h-[44px] max-h-32 text-sm border-emerald-500/15 focus-visible:ring-emerald-500/30 resize-none pr-10"
                        rows={1}
                      />
                      {messageInput && (
                        <button
                          onClick={() => { setMessageInput(''); setDraftSaved(false); }}
                          className="absolute right-2 bottom-2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                          aria-label="Clear message"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Button
                      size="icon"
                      className={cn(
                        'h-10 w-10 shrink-0 rounded-xl',
                        messageInput.trim()
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-muted text-muted-foreground'
                      )}
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
                    Press <kbd className="px-1 py-0.5 rounded bg-muted text-[8px] font-mono">Ctrl+Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-muted text-[8px] font-mono">Esc</kbd> to close
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Compose Dialog ── */}
      <ComposeMessageDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        channel={activeChannel}
        onSend={handleComposeSend}
      />

      {/* ── Keyboard shortcut hint overlay ── */}
      <div className="sr-only" aria-live="polite">
        Keyboard shortcuts: Press / to focus search, Esc to close conversation detail
      </div>
    </div>
  );
}
