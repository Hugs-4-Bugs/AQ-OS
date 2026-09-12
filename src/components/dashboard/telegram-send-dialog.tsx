'use client';

import React, { useState, useMemo } from 'react';
import {
  Send,
  X,
  Loader2,
  Eye,
  Code,
  Type,
  FileText,
  MessageSquare,
  Reply,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { sendTelegramMessage } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TelegramSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadContext?: {
    name: string;
    telegram?: string;
    whatsapp?: string;
  } | null;
  defaultChatId?: string;
}

type ParseMode = 'plain' | 'Markdown' | 'HTML';

const PARSE_MODE_OPTIONS: { value: ParseMode; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'plain', label: 'Plain Text', icon: Type, desc: 'No formatting' },
  { value: 'Markdown', label: 'Markdown', icon: FileText, desc: '*bold*, _italic_, `code`' },
  { value: 'HTML', label: 'HTML', icon: Code, desc: '<b>bold</b>, <i>italic</i>' },
];

function renderPreview(message: string, parseMode: ParseMode): React.ReactNode {
  if (parseMode === 'plain') {
    return <span className="whitespace-pre-wrap">{message}</span>;
  }

  if (parseMode === 'Markdown') {
    // Simple Markdown rendering for preview
    const parts = message.split(/(\*\*.*?\*\*|__.*?__|_.*?_|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('__') && part.endsWith('__')) {
        return <u key={i}>{part.slice(2, -2)}</u>;
      }
      if (part.startsWith('_') && part.endsWith('_') && !part.startsWith('__')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  }

  if (parseMode === 'HTML') {
    // Simple HTML rendering for preview
    const parts = message.split(/(<b>.*?<\/b>|<i>.*?<\/i>|<code>.*?<\/code>|<u>.*?<\/u>)/g);
    return parts.map((part, i) => {
      if (part.startsWith('<b>') && part.endsWith('</b>')) {
        return <strong key={i}>{part.slice(3, -4)}</strong>;
      }
      if (part.startsWith('<i>') && part.endsWith('</i>')) {
        return <em key={i}>{part.slice(3, -4)}</em>;
      }
      if (part.startsWith('<code>') && part.endsWith('</code>')) {
        return (
          <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
            {part.slice(6, -7)}
          </code>
        );
      }
      if (part.startsWith('<u>') && part.endsWith('</u>')) {
        return <u key={i}>{part.slice(3, -4)}</u>;
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  }

  return <span className="whitespace-pre-wrap">{message}</span>;
}

export default function TelegramSendDialog({
  open,
  onOpenChange,
  leadContext,
  defaultChatId,
}: TelegramSendDialogProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const initialChatId = useMemo(() => {
    if (!open) return '';
    if (defaultChatId) return defaultChatId;
    if (leadContext?.telegram) return leadContext.telegram;
    return '';
  }, [open, defaultChatId, leadContext?.telegram]);

  const [chatId, setChatId] = useState(() => initialChatId);
  const [message, setMessage] = useState('');
  const [parseMode, setParseMode] = useState<ParseMode>('plain');
  const [replyToMessageId, setReplyToMessageId] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');

  const resetForm = () => {
    setChatId('');
    setMessage('');
    setParseMode('plain');
    setReplyToMessageId('');
    setActiveTab('compose');
  };

  const handleSend = async () => {
    if (!chatId.trim() || !message.trim()) return;

    setSending(true);
    try {
      await sendTelegramMessage({
        chatId: chatId.trim(),
        message: message.trim(),
        parseMode: parseMode === 'plain' ? undefined : parseMode,
        replyToMessageId: replyToMessageId.trim() || undefined,
      });
      toast.success('Telegram message sent!');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send Telegram message');
    } finally {
      setSending(false);
    }
  };

  const isValid = chatId.trim() && message.trim();
  const charCount = message.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isValid && !sending) {
      e.preventDefault();
      handleSend();
    }
  };

  const formContent = (
    <div className="space-y-4">
      {/* Chat ID input */}
      <div className="space-y-1.5">
        <Label htmlFor="tg-chat-id" className="text-xs">Chat ID</Label>
        <Input
          id="tg-chat-id"
          placeholder="e.g. 123456789 or @channelname"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="h-9 text-sm"
          disabled={sending}
        />
        <p className="text-[10px] text-muted-foreground">
          Enter a numeric chat ID or @username for channels
        </p>
      </div>

      {/* Parse mode selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">Parse Mode</Label>
        <div className="grid grid-cols-3 gap-2">
          {PARSE_MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setParseMode(opt.value)}
                disabled={sending}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-all',
                  parseMode === opt.value
                    ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                    : 'border-border hover:border-emerald-500/30 hover:bg-muted/30'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-medium">{opt.label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Message content */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="tg-message" className="text-xs">Message</Label>
          <span className={cn('text-[10px]', charCount > 4096 ? 'text-destructive' : 'text-muted-foreground')}>
            {charCount.toLocaleString()} / 4,096
          </span>
        </div>
        <Textarea
          id="tg-message"
          placeholder={
            parseMode === 'Markdown'
              ? 'Write your message... *bold*, _italic_, `code`'
              : parseMode === 'HTML'
                ? 'Write your message... <b>bold</b>, <i>italic</i>'
                : 'Write your message here...'
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[140px] text-sm resize-y font-mono"
          disabled={sending}
        />
        <p className="text-[10px] text-muted-foreground">
          Tip: Press Ctrl+Enter to send
        </p>
      </div>

      {/* Reply-to (optional) */}
      <div className="space-y-1.5">
        <Label htmlFor="tg-reply-to" className="text-xs flex items-center gap-1">
          <Reply className="h-3 w-3" />
          Reply To Message ID
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="tg-reply-to"
          placeholder="e.g. 42"
          value={replyToMessageId}
          onChange={(e) => setReplyToMessageId(e.target.value)}
          className="h-9 text-sm"
          disabled={sending}
        />
      </div>

      {/* Lead context */}
      {leadContext && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
          <MessageSquare className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Messaging for lead: <strong className="text-foreground">{leadContext.name}</strong>
          </span>
        </div>
      )}

      <Separator />

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            resetForm();
            onOpenChange(false);
          }}
          disabled={sending}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button
          size="sm"
          className="gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSend}
          disabled={!isValid || sending || charCount > 4096}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send Message
        </Button>
      </div>
    </div>
  );

  // Preview panel content
  const previewContent = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Preview</Label>
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 min-h-[120px]">
          {message ? (
            <div className="text-sm leading-relaxed">
              {renderPreview(message, parseMode)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Your message preview will appear here...</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-md bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase">Chat ID</p>
          <p className="text-sm font-mono truncate">{chatId || '—'}</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase">Parse Mode</p>
          <p className="text-sm">{parseMode === 'plain' ? 'Plain Text' : parseMode}</p>
        </div>
        {replyToMessageId && (
          <div className="p-2 rounded-md bg-muted/30 border border-border/50 col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase">Replying To</p>
            <p className="text-sm font-mono">Message #{replyToMessageId}</p>
          </div>
        )}
      </div>

      {/* Character count indicator */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Character usage</span>
          <span className={cn(charCount > 4096 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {charCount.toLocaleString()} / 4,096
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              charCount > 4096
                ? 'bg-destructive'
                : charCount > 3000
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            )}
            style={{ width: `${Math.min(100, (charCount / 4096) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );

  const fullContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="compose" className="text-xs gap-1">
          <Send className="h-3 w-3" />
          Compose
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs gap-1">
          <Eye className="h-3 w-3" />
          Preview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="mt-4">
        {formContent}
      </TabsContent>
      <TabsContent value="preview" className="mt-4">
        {previewContent}
      </TabsContent>
    </Tabs>
  );

  // Use Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Send Telegram Message
            </SheetTitle>
            <SheetDescription>Send a message via your connected Telegram bot</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{fullContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            Send Telegram Message
          </DialogTitle>
          <DialogDescription>
            Send a message via your connected Telegram bot
          </DialogDescription>
        </DialogHeader>
        {fullContent}
      </DialogContent>
    </Dialog>
  );
}
