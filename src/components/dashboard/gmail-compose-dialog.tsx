'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { sendGmailEmail, createGmailDraft, type GmailAccountSummary } from '@/lib/api';

type GmailAccount = GmailAccountSummary;
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface GmailComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: GmailAccount[];
  activeAccountId: string | null;
  leadContext?: {
    name: string;
    email: string;
  } | null;
}

export default function GmailComposeDialog({
  open,
  onOpenChange,
  accounts,
  activeAccountId,
  leadContext,
}: GmailComposeDialogProps) {
  const queryClient = useQueryClient();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Compute initial values from props
  const initialAccountId = useMemo(() => {
    if (!open) return '';
    const active = accounts.find((a) => a.id === activeAccountId && a.status === 'active');
    return active?.id ?? accounts.find((a) => a.status === 'active')?.id ?? '';
  }, [open, accounts, activeAccountId]);

  const initialTo = useMemo(() => {
    if (!open || !leadContext) return '';
    return leadContext.email;
  }, [open, leadContext]);

  const initialSubject = useMemo(() => {
    if (!open || !leadContext) return '';
    return `Re: ${leadContext.name}`;
  }, [open, leadContext]);

  // Form state with lazy initializers
  const [to, setTo] = useState(() => initialTo);
  const [subject, setSubject] = useState(() => initialSubject);
  const [body, setBody] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(() => initialAccountId);
  const [showCcBcc, setShowCcBcc] = useState(false);

  // Reset form on close
  const resetForm = useCallback(() => {
    setTo('');
    setSubject('');
    setBody('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
  }, []);

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const account = accounts.find((a) => a.id === selectedAccountId);
      if (!account) throw new Error('No account selected');

      return sendGmailEmail({
        emailAccountId: selectedAccountId,
        to: to.split(',').map((e) => e.trim()).filter(Boolean),
        subject,
        body,
        cc: cc ? cc.split(',').map((e) => e.trim()).filter(Boolean) : undefined,
        bcc: bcc ? bcc.split(',').map((e) => e.trim()).filter(Boolean) : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Email sent successfully');
      queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
      resetForm();
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Failed to send email');
    },
  });

  // Save draft mutation
  const draftMutation = useMutation({
    mutationFn: async () => {
      const account = accounts.find((a) => a.id === selectedAccountId);
      if (!account) throw new Error('No account selected');

      return createGmailDraft({
        emailAccountId: selectedAccountId,
        to: to.split(',').map((e) => e.trim()).filter(Boolean),
        subject,
        body,
        cc: cc ? cc.split(',').map((e) => e.trim()).filter(Boolean) : undefined,
        action: 'create',
      });
    },
    onSuccess: () => {
      toast.success('Draft saved');
      resetForm();
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Failed to save draft');
    },
  });

  // Validation
  const isValid = to.trim() && subject.trim() && body.trim() && selectedAccountId;
  const charCount = body.length;

  // Keyboard shortcut: Ctrl+Enter to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isValid) {
      e.preventDefault();
      sendMutation.mutate();
    }
  };

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const isSending = sendMutation.isPending;
  const isSaving = draftMutation.isPending;
  const isProcessing = isSending || isSaving;

  const formContent = (
    <div className="space-y-4">
      {/* Account selector */}
      {activeAccounts.length > 1 && (
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* To field */}
      <div className="space-y-1.5">
        <Label htmlFor="compose-to" className="text-xs">To</Label>
        <Input
          id="compose-to"
          placeholder="recipient@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 text-sm"
          disabled={isProcessing}
        />
      </div>

      {/* CC/BCC toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowCcBcc(!showCcBcc)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {showCcBcc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showCcBcc ? 'Hide' : 'Show'} CC & BCC
        </button>
        {showCcBcc && (
          <div className="mt-2 space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="compose-cc" className="text-xs">CC</Label>
              <Input
                id="compose-cc"
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="h-9 text-sm"
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-bcc" className="text-xs">BCC</Label>
              <Input
                id="compose-bcc"
                placeholder="bcc@example.com"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="h-9 text-sm"
                disabled={isProcessing}
              />
            </div>
          </div>
        )}
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="compose-subject" className="text-xs">Subject</Label>
        <Input
          id="compose-subject"
          placeholder="Email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 text-sm"
          disabled={isProcessing}
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="compose-body" className="text-xs">Message</Label>
          <span className={cn('text-[10px]', charCount > 5000 ? 'text-destructive' : 'text-muted-foreground')}>
            {charCount.toLocaleString()} chars
          </span>
        </div>
        <Textarea
          id="compose-body"
          placeholder="Write your message here..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[160px] text-sm resize-y"
          disabled={isProcessing}
        />
        <p className="text-[10px] text-muted-foreground">
          Tip: Press Ctrl+Enter to send
        </p>
      </div>

      {/* Lead context */}
      {leadContext && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
          <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Composing for lead: <strong className="text-foreground">{leadContext.name}</strong>
          </span>
        </div>
      )}

      <Separator />

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9 text-xs"
          onClick={() => draftMutation.mutate()}
          disabled={!isValid || isProcessing}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Draft
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={isProcessing}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Discard
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => sendMutation.mutate()}
            disabled={!isValid || isProcessing}
          >
            {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );

  // Use Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-auto">
          <SheetHeader>
            <SheetTitle>Compose Email</SheetTitle>
            <SheetDescription>Write and send an email from your connected Gmail account</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{formContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Compose Email
          </DialogTitle>
          <DialogDescription>
            Write and send an email from your connected Gmail account
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
