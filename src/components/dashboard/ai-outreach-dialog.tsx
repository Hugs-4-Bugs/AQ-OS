'use client';

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Mail,
  MessageSquare,
  Send,
  Phone,
  Instagram,
  Coins,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────

type OutreachChannel = 'email' | 'whatsapp' | 'linkedin' | 'telegram' | 'instagram';
type OutreachTone = 'professional' | 'casual' | 'urgent' | 'friendly' | 'formal';

interface OutreachMessageOutput {
  subject?: string;
  body: string;
  callToAction: string;
  followUpSuggestion: string;
  personalizationPoints: string[];
  toneAnalysis: string;
  estimatedReplyRate: number;
  alternativeVersions: {
    formal: string;
    casual: string;
    urgent: string;
  };
  channel: OutreachChannel;
  tone: OutreachTone;
  leadId: string;
  aiProvider: string;
}

interface AIOutreachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string;
  leadEmail?: string;
}

// ─── Channel Config ───────────────────────────────────────

const CHANNEL_OPTIONS: { value: OutreachChannel; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'email', label: 'Email', icon: Mail, desc: 'Professional cold email' },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone, desc: 'Direct message (max 100 words)' },
  { value: 'linkedin', label: 'LinkedIn', icon: MessageSquare, desc: 'LinkedIn connection message' },
  { value: 'telegram', label: 'Telegram', icon: Send, desc: 'Telegram direct message' },
  { value: 'instagram', label: 'Instagram', icon: Instagram, desc: 'Instagram DM (max 80 words)' },
];

const TONE_OPTIONS: { value: OutreachTone; label: string; color: string }[] = [
  { value: 'professional', label: 'Professional', color: 'text-slate-500' },
  { value: 'casual', label: 'Casual', color: 'text-emerald-500' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-500' },
  { value: 'friendly', label: 'Friendly', color: 'text-amber-500' },
  { value: 'formal', label: 'Formal', color: 'text-violet-500' },
];

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'French', label: 'French' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Portuguese', label: 'Portuguese' },
];

// ─── Main Component ───────────────────────────────────────

export default function AIOutreachDialog({ open, onOpenChange, leadId, leadName, leadEmail }: AIOutreachDialogProps) {
  const [channel, setChannel] = useState<OutreachChannel>('email');
  const [tone, setTone] = useState<OutreachTone>('professional');
  const [language, setLanguage] = useState('English');
  const [customInstructions, setCustomInstructions] = useState('');
  const [generated, setGenerated] = useState<OutreachMessageOutput | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Gmail draft state
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string }[]>([]);
  const [gmailAccountsLoaded, setGmailAccountsLoaded] = useState(false);
  const [gmailDraftLoading, setGmailDraftLoading] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          channel,
          tone,
          language,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json() as {
        success: boolean;
        message: OutreachMessageOutput;
        creditsDeducted: number;
        newBalance: number;
      };

      setGenerated(data.message);
      toast.success('Outreach generated', {
        description: `${data.creditsDeducted} credits used · Balance: ${data.newBalance}`,
      });
    } catch (error) {
      toast.error('Generation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [leadId, channel, tone, language, customInstructions]);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const handleReset = useCallback(() => {
    setGenerated(null);
    setCustomInstructions('');
    setAlternativesOpen(false);
  }, []);

  // Load Gmail accounts
  const loadGmailAccounts = useCallback(async () => {
    if (gmailAccountsLoaded) return;
    try {
      const res = await fetch('/api/gmail/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json() as { accounts: { id: string; email: string; status: string }[] };
      const activeAccounts = data.accounts
        .filter((a) => a.status === 'active')
        .map((a) => ({ id: a.id, email: a.email }));
      setGmailAccounts(activeAccounts);
    } catch {
      setGmailAccounts([]);
    } finally {
      setGmailAccountsLoaded(true);
    }
  }, [gmailAccountsLoaded]);

  // Create Gmail draft
  const handleCreateGmailDraft = useCallback(async (emailAccountId: string, accountEmail: string) => {
    if (!generated || !leadEmail) return;
    setGmailDraftLoading(true);
    setShowAccountPicker(false);
    try {
      const res = await fetch('/api/gmail/outreach-to-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailAccountId,
          leadId,
          channel: 'email',
          subject: generated.subject || 'Outreach',
          body: generated.body,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'UNSUBSCRIBED') {
          toast.error('Lead has unsubscribed', { description: 'This lead has opted out of emails.' });
        } else if (data.code === 'ACCOUNT_NOT_ACTIVE') {
          toast.error('Gmail account expired', { description: 'Please reconnect your Gmail account.' });
        } else {
          throw new Error(data.error || 'Failed to create draft');
        }
        return;
      }

      toast.success(`Draft created in ${accountEmail}`, {
        description: `Gmail draft created for ${leadEmail}`,
      });
    } catch (error) {
      toast.error('Failed to create Gmail draft', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setGmailDraftLoading(false);
    }
  }, [generated, leadId, leadEmail]);

  // Handle Gmail draft button click
  const handleGmailDraftClick = useCallback(() => {
    if (!gmailAccountsLoaded) {
      loadGmailAccounts();
      return;
    }
    if (gmailAccounts.length === 0) {
      toast.info('Connect Gmail first', {
        description: 'Connect a Gmail account in the Inbox tab to create drafts.',
      });
      return;
    }
    if (gmailAccounts.length === 1) {
      handleCreateGmailDraft(gmailAccounts[0].id, gmailAccounts[0].email);
    } else {
      setShowAccountPicker(true);
    }
  }, [gmailAccounts, gmailAccountsLoaded, handleCreateGmailDraft, loadGmailAccounts]);

  // Get full message text for copy
  const getFullMessage = useCallback(() => {
    if (!generated) return '';
    const parts: string[] = [];
    if (generated.subject) parts.push(`Subject: ${generated.subject}\n`);
    parts.push(generated.body);
    if (generated.callToAction) parts.push(`\n${generated.callToAction}`);
    return parts.join('\n');
  }, [generated]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Outreach
          </DialogTitle>
          <DialogDescription>
            AI-powered personalized message for {leadName || 'this lead'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!generated ? (
            <>
              {/* Channel Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Channel</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.value}
                        onClick={() => setChannel(ch.value)}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-center',
                          channel === ch.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.02]'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[9px] font-medium">{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tone Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tone</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                        tone === t.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted bg-transparent text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Instructions */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Custom Instructions (optional)</Label>
                <Textarea
                  placeholder="E.g., Mention we have a special discount this month, reference their recent expansion..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="min-h-[60px] text-xs border-primary/20 focus-visible:ring-primary/30"
                  maxLength={500}
                />
                <p className="text-[9px] text-muted-foreground text-right">{customInstructions.length}/500</p>
              </div>

              {/* Credit Warning */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <Coins className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  This will cost <strong>2 credits</strong> to generate a personalized message
                </span>
              </div>

              {/* Generate Button */}
              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Message
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Generated Message Display */}
              <Tabs defaultValue="main" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="main" className="text-[10px]">Message</TabsTrigger>
                  <TabsTrigger value="details" className="text-[10px]">Details</TabsTrigger>
                  <TabsTrigger value="alternatives" className="text-[10px]">Alternatives</TabsTrigger>
                </TabsList>

                {/* Main Message Tab */}
                <TabsContent value="main" className="space-y-3">
                  {/* Subject (email only) */}
                  {generated.subject && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Subject Line</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm font-medium flex-1">{generated.subject}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[9px] gap-1 shrink-0"
                          onClick={() => handleCopy(generated.subject!, 'subject')}
                        >
                          {copied === 'subject' ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                          {copied === 'subject' ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Message Body */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] text-muted-foreground">Message</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[9px] gap-1"
                        onClick={() => handleCopy(getFullMessage(), 'full')}
                      >
                        {copied === 'full' ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                        {copied === 'full' ? 'Copied!' : 'Copy All'}
                      </Button>
                    </div>
                    <div className="p-3 rounded-lg border border-primary/10 bg-primary/[0.02] whitespace-pre-wrap text-sm leading-relaxed">
                      {generated.body}
                    </div>
                  </div>

                  {/* Call to Action */}
                  {generated.callToAction && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <Label className="text-[10px] text-emerald-600 dark:text-emerald-400">Call to Action</Label>
                      <p className="text-xs mt-0.5">{generated.callToAction}</p>
                    </div>
                  )}

                  {/* Follow Up Suggestion */}
                  {generated.followUpSuggestion && (
                    <div className="p-2.5 rounded-lg bg-muted/50">
                      <Label className="text-[10px] text-muted-foreground">Follow-up Suggestion</Label>
                      <p className="text-xs mt-0.5">{generated.followUpSuggestion}</p>
                    </div>
                  )}

                  {/* Estimated Reply Rate */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-[10px] text-muted-foreground">Estimated Reply Rate</span>
                    <span className={cn(
                      'text-sm font-bold',
                      generated.estimatedReplyRate >= 50 ? 'text-emerald-500' :
                      generated.estimatedReplyRate >= 30 ? 'text-amber-500' : 'text-red-500'
                    )}>
                      {generated.estimatedReplyRate}%
                    </span>
                  </div>
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-3">
                  {/* Personalization Points */}
                  {generated.personalizationPoints.length > 0 && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1.5 block">Personalization Points</Label>
                      <div className="space-y-1">
                        {generated.personalizationPoints.map((point, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs p-1.5 rounded-md bg-primary/[0.03]">
                            <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tone Analysis */}
                  {generated.toneAnalysis && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">Tone Analysis</Label>
                      <p className="text-xs">{generated.toneAnalysis}</p>
                    </div>
                  )}

                  {/* Channel & Tone Badges */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] capitalize gap-1">
                      {channel === 'email' ? <Mail className="h-2.5 w-2.5" /> :
                       channel === 'whatsapp' ? <Phone className="h-2.5 w-2.5" /> :
                       channel === 'linkedin' ? <MessageSquare className="h-2.5 w-2.5" /> :
                       channel === 'instagram' ? <Instagram className="h-2.5 w-2.5" /> :
                       <Send className="h-2.5 w-2.5" />}
                      {channel}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] capitalize">{generated.tone}</Badge>
                    <Badge variant="outline" className="text-[9px]">{generated.aiProvider}</Badge>
                  </div>
                </TabsContent>

                {/* Alternatives Tab */}
                <TabsContent value="alternatives" className="space-y-3">
                  {Object.entries(generated.alternativeVersions).map(([key, content]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className={cn(
                          'text-[10px] font-medium capitalize',
                          key === 'formal' ? 'text-violet-500' :
                          key === 'casual' ? 'text-emerald-500' : 'text-red-500'
                        )}>
                          {key} Version
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[8px] gap-0.5"
                          onClick={() => handleCopy(content, `alt-${key}`)}
                        >
                          {copied === `alt-${key}` ? <Check className="h-2 w-2" /> : <Copy className="h-2 w-2" />}
                          {copied === `alt-${key}` ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      <div className="p-2.5 rounded-lg border border-muted bg-muted/20 whitespace-pre-wrap text-xs leading-relaxed">
                        {content}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <Separator />

              {/* Action Buttons */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={handleReset}
                  >
                    Start Over
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                </div>

                {/* Gmail Draft Button — only for email channel */}
                {channel === 'email' && leadEmail && (
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 border-emerald-500/30 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                    onClick={handleGmailDraftClick}
                    disabled={gmailDraftLoading}
                  >
                    {gmailDraftLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Draft...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Create Gmail Draft
                      </>
                    )}
                  </Button>
                )}
                {channel === 'email' && !leadEmail && generated && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      Add an email address to this lead to create a Gmail draft
                    </span>
                  </div>
                )}
                {channel === 'email' && leadEmail && gmailAccountsLoaded && gmailAccounts.length === 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      Connect Gmail first — go to the Inbox tab to link your account
                    </span>
                  </div>
                )}
              </div>

              {/* Gmail Account Picker */}
              <Dialog open={showAccountPicker} onOpenChange={setShowAccountPicker}>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-emerald-500" />
                      Select Gmail Account
                    </DialogTitle>
                    <DialogDescription>
                      Choose which Gmail account to create the draft in.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    {gmailAccounts.map((account) => (
                      <button
                        key={account.id}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-left"
                        onClick={() => handleCreateGmailDraft(account.id, account.email)}
                        disabled={gmailDraftLoading}
                      >
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Mail className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{account.email}</p>
                          <p className="text-[10px] text-muted-foreground">Active</p>
                        </div>
                        <Send className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Credit cost for regeneration */}
              <div className="flex items-center justify-center gap-1">
                <Coins className="h-2.5 w-2.5 text-amber-500" />
                <span className="text-[9px] text-muted-foreground">Regeneration costs 2 credits</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
