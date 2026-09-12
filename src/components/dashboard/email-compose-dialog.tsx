'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  X,
  Mail,
  User,
  FileText,
  Sparkles,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Types ───────────────────────────────────────────────────────────────────

interface EmailComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toEmail?: string;
  toName?: string;
  toCompany?: string;
  leadId?: string;
  subject?: string;
}

interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

// ── Templates ───────────────────────────────────────────────────────────────

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'introduction',
    label: 'Introduction',
    subject: 'Quick introduction — synergy between our teams',
    body: `Hi [name],\n\nI came across your company and was genuinely impressed by what you're building. After looking at your presence online, I noticed a few areas where we might be able to add significant value.\n\nI'd love to share some insights and explore whether a collaboration makes sense.\n\nWould you be open to a quick 10-minute chat this week?\n\nBest regards`,
  },
  {
    id: 'follow-up',
    label: 'Follow-up',
    subject: 'Following up — any thoughts?',
    body: `Hi [name],\n\nJust following up on my previous email. I know how busy things can get, so I wanted to keep this brief.\n\nI'd still love to connect and share some ideas that I think could be really valuable for [company].\n\nNo pressure at all — just let me know if you'd like to find some time to talk.\n\nBest regards`,
  },
  {
    id: 'proposal',
    label: 'Proposal',
    subject: 'Proposal for [company] — next steps',
    body: `Hi [name],\n\nI'd like to propose a collaboration that I believe could drive meaningful results for [company].\n\nBased on my research, here's what I think would work best:\n\n1. An initial audit of your current digital presence\n2. A tailored strategy focused on your key growth areas\n3. Ongoing support and optimization\n\nI've attached a brief overview with more details. Would you like to schedule a call to discuss?\n\nBest regards`,
  },
  {
    id: 'meeting',
    label: 'Meeting Request',
    subject: 'Quick call request — 10 mins max',
    body: `Hi [name],\n\nI'd love to schedule a quick call to introduce myself and share a few ideas that could benefit [company].\n\nIt would be great to connect for just 10 minutes — I promise to keep it focused and valuable for you.\n\nHere are a few slots that work for me:\n- [Day] at [Time]\n- [Day] at [Time]\n- [Day] at [Time]\n\nLet me know what works, or feel free to suggest another time.\n\nBest regards`,
  },
  {
    id: 'custom',
    label: 'Custom',
    subject: '',
    body: '',
  },
];

// ── AI Rewrite Presets ──────────────────────────────────────────────────────

const AI_TONES = ['Professional', 'Friendly', 'Formal', 'Casual'] as const;
const AI_LENGTHS = ['Short', 'Medium', 'Long'] as const;

const TONE_TRANSFORMS: Record<string, string> = {
  Professional: 'professional and results-driven',
  Friendly: 'warm and approachable',
  Formal: 'formal and respectful',
  Casual: 'casual and conversational',
};

const LENGTH_HINTS: Record<string, string> = {
  Short: 'Keep it concise, under 100 words.',
  Medium: 'A balanced length, around 150-200 words.',
  Long: 'Comprehensive and detailed, around 300 words.',
};

// ── Component ───────────────────────────────────────────────────────────────

export function EmailComposeDialog({
  open,
  onOpenChange,
  toEmail,
  toName,
  toCompany,
  leadId,
  subject: initialSubject,
}: EmailComposeDialogProps) {
  const [activeTab, setActiveTab] = useState('compose');
  const [templateId, setTemplateId] = useState<string>('');
  const [to, setTo] = useState('');
  const [subjectValue, setSubjectValue] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<string>('Professional');
  const [aiLength, setAiLength] = useState<string>('Medium');
  const [aiPreview, setAiPreview] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [scheduledTime, setScheduledTime] = useState<string>('now');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate fields from props when dialog opens
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const recipient = toName ? `${toName} <${toEmail || ''}>` : (toEmail || '');
        setTo(recipient);
        setSubjectValue(initialSubject || '');
        setBody('');
        setTemplateId('');
        setAttachments([]);
        setActiveTab('compose');
        setSent(false);
        setAiPreview('');
      }
      onOpenChange(nextOpen);
    },
    [toEmail, toName, initialSubject, onOpenChange],
  );

  // Handle template selection
  const handleTemplateChange = useCallback(
    (id: string) => {
      setTemplateId(id);
      const tmpl = EMAIL_TEMPLATES.find((t) => t.id === id);
      if (tmpl && tmpl.id !== 'custom') {
        const name = toName || '[name]';
        const company = toCompany || toName || '[company]';
        setSubjectValue(
          tmpl.subject
            .replace('[company]', company)
            .replace('[name]', name),
        );
        setBody(
          tmpl.body
            .replace(/\[name\]/g, name)
            .replace(/\[company\]/g, company),
        );
      } else if (tmpl?.id === 'custom') {
        setSubjectValue('');
        setBody('');
      }
    },
    [toName, toCompany],
  );

  // Simulate AI rewrite
  const handleAiGenerate = useCallback(() => {
    setAiGenerating(true);
    setTimeout(() => {
      const toneLabel = TONE_TRANSFORMS[aiTone] || aiTone;
      const lengthHint = LENGTH_HINTS[aiLength] || '';
      const simulated = `[${aiTone} tone, ${aiLength} length]\n\n${body}\n\n---\nRewritten in a ${toneLabel} style. ${lengthHint}\n\nThis is a simulated AI rewrite preview. In production, this would call the AI service to generate a tailored version of your message.`;
      setAiPreview(simulated);
      setAiGenerating(false);
    }, 1200);
  }, [aiTone, aiLength, body]);

  // Apply AI preview to body
  const handleApplyAiPreview = useCallback(() => {
    if (aiPreview) {
      setBody(aiPreview);
      setAiPreview('');
      setActiveTab('compose');
      toast.success('AI-generated content applied');
    }
  }, [aiPreview]);

  // Handle attachment (simulated)
  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        const newAttachments = Array.from(files).map((f) => f.name);
        setAttachments((prev) => [...prev, ...newAttachments]);
        toast.success(`${newAttachments.length} file(s) attached`);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send email (simulated)
  const handleSend = useCallback(async () => {
    if (!to.trim()) {
      toast.error('Please enter a recipient');
      return;
    }
    if (!subjectValue.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!body.trim()) {
      toast.error('Please write a message');
      return;
    }

    setSending(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSending(false);
    setSent(true);

    toast.success(
      scheduledTime === 'now'
        ? 'Email sent successfully!'
        : 'Email scheduled successfully!',
    );

    // Close dialog after animation
    setTimeout(() => {
      setSent(false);
      handleOpenChange(false);
    }, 1200);
  }, [to, subjectValue, body, scheduledTime, handleOpenChange]);

  // Discard
  const handleDiscard = useCallback(() => {
    handleOpenChange(false);
    toast.info('Email discarded');
  }, [handleOpenChange]);

  const charCount = body.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl"
        showCloseButton={false}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-6 pt-5 pb-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Compose Email
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {leadId ? `Lead: ${leadId.slice(0, 12)}…` : 'New outreach'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.div
              animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 px-3 py-1 text-[11px] font-medium text-primary"
              style={{ backgroundSize: '200% 100%' }}
            >
              <Sparkles className="h-3 w-3" />
              AI Assist
            </motion.div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        <Separator className="opacity-50" />

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col"
        >
          {/* ── Compose Tab ────────────────────────────────────────── */}
          <TabsContent value="compose" className="mt-0 flex flex-col gap-0">
            {/* To field */}
            <div className="flex items-center gap-2 border-b border-border/40 px-6 py-3">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 text-sm"
              />
            </div>

            {/* Subject field */}
            <div className="flex items-center gap-2 border-b border-border/40 px-6 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={subjectValue}
                onChange={(e) => setSubjectValue(e.target.value)}
                placeholder="Enter subject..."
                className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 text-sm"
              />
            </div>

            {/* Template selector */}
            <div className="flex items-center gap-2 border-b border-border/40 px-6 py-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="h-8 flex-1 border-0 bg-transparent shadow-none focus:ring-0 px-1 text-sm">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Body textarea */}
            <div className="relative px-6 pt-3 pb-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                rows={8}
                className="min-h-[180px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 custom-scrollbar"
              />
              <div className="mt-1 flex items-center justify-between">
                <span
                  className={`text-xs tabular-nums ${
                    charCount > 5000
                      ? 'text-destructive'
                      : 'text-muted-foreground/60'
                  }`}
                >
                  {charCount.toLocaleString()} characters
                </span>
                {templateId && templateId !== 'custom' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {EMAIL_TEMPLATES.find((t) => t.id === templateId)?.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Attachments preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 px-6 py-2">
                    {attachments.map((name, idx) => (
                      <motion.div
                        key={`${name}-${idx}`}
                        layout
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/50 px-2.5 py-1 text-xs"
                      >
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[120px] truncate">{name}</span>
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/10"
                        >
                          <X className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ── AI Rewrite Tab ─────────────────────────────────────── */}
          <TabsContent value="ai" className="mt-0 flex flex-col gap-0">
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">AI Rewrite</h3>
                <span className="text-xs text-muted-foreground">
                  — Transform your email with AI
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {/* Tone selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Tone
                  </label>
                  <Select value={aiTone} onValueChange={setAiTone}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_TONES.map((tone) => (
                        <SelectItem key={tone} value={tone}>
                          {tone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Length selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Length
                  </label>
                  <Select value={aiLength} onValueChange={setAiLength}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_LENGTHS.map((len) => (
                        <SelectItem key={len} value={len}>
                          {len}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleAiGenerate}
                disabled={aiGenerating || !body.trim()}
                className="w-full bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 transition-opacity"
              >
                {aiGenerating ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generating...
                  </motion.div>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Generate Rewrite
                  </span>
                )}
              </Button>

              {/* AI Preview */}
              <AnimatePresence>
                {aiPreview && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        AI Generated Preview
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">
                      {aiPreview}
                    </pre>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleApplyAiPreview}
                        className="bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90"
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAiGenerate}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Regenerate
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="opacity-50" />

        {/* ── Bottom Toolbar ──────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
          {/* Left actions */}
          <div className="flex items-center gap-1.5">
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.div
                  key="sent"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-600 dark:text-green-400"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </motion.div>
                  Sent!
                </motion.div>
              ) : (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5"
                >
                  {/* Send / Schedule */}
                  <div className="flex items-center">
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={sending}
                      className="rounded-r-none bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 shadow-sm"
                    >
                      {sending ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Send className="h-4 w-4" />
                        </motion.div>
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="ml-1.5 hidden sm:inline">Send</span>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-l-none border-l-0 px-2"
                          onClick={() =>
                            setScheduledTime((prev) =>
                              prev === 'now' ? 'later' : 'now',
                            )
                          }
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {scheduledTime === 'now'
                          ? 'Switch to schedule'
                          : 'Switch to send now'}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {scheduledTime === 'later' && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <Input
                        type="datetime-local"
                        className="h-9 w-[200px] text-xs"
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {/* AI Rewrite button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab('ai')}
                  disabled={!body.trim()}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">AI Rewrite</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">AI-powered email rewrite</TooltipContent>
            </Tooltip>

            {/* Attach button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAttach}
                  className="gap-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Attach</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Attach files</TooltipContent>
            </Tooltip>

            {/* Discard button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscard}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Discard email</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* ── Inline styles for custom scrollbar ──────────────────── */}
        <style jsx global>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: hsl(var(--muted-foreground) / 0.2);
            border-radius: 999px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: hsl(var(--muted-foreground) / 0.4);
          }
          .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: hsl(var(--muted-foreground) / 0.2) transparent;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

export default EmailComposeDialog;
