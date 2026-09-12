'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Send,
  User,
  Lightbulb,
  AlertCircle,
  Target,
  Zap,
  ChevronDown,
  Copy,
  Check,
  Link2,
  Sparkles,
  X,
  TrendingUp,
  Mail,
  AlertTriangle,
  Megaphone,
  ChevronRight,
  RefreshCw,
  Trash2,
  History,
  MessageSquare,
  Pin,
  PinOff,
  Download,
  Bookmark,
  Search,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { fetchLeads, fetchCommunications } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { STAGE_LABELS } from '@/lib/types';
import type { AssistantMessage } from '@/lib/types';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// ─── LocalStorage Keys ────────────────────────────────────
const SAVED_RESPONSES_KEY = 'acq-os-saved-responses';
const PINNED_MESSAGES_KEY = 'acq-os-pinned-messages';

interface SavedResponse {
  id: string;
  content: string;
  timestamp: string;
  leadName?: string;
}

interface PinnedMessage {
  id: string;
  content: string;
  timestamp: string;
  originalMsgId: string;
}

function getSavedResponses(): SavedResponse[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(SAVED_RESPONSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveResponseToStorage(response: SavedResponse) {
  const existing = getSavedResponses();
  const updated = [response, ...existing].slice(0, 50);
  localStorage.setItem(SAVED_RESPONSES_KEY, JSON.stringify(updated));
}

function removeSavedResponse(id: string) {
  const existing = getSavedResponses();
  const updated = existing.filter((r) => r.id !== id);
  localStorage.setItem(SAVED_RESPONSES_KEY, JSON.stringify(updated));
}

function getPinnedMessages(): PinnedMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(PINNED_MESSAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePinnedMessage(msg: PinnedMessage) {
  const existing = getPinnedMessages();
  const updated = [msg, ...existing].slice(0, 10);
  localStorage.setItem(PINNED_MESSAGES_KEY, JSON.stringify(updated));
}

function removePinnedMessage(id: string) {
  const existing = getPinnedMessages();
  const updated = existing.filter((m) => m.id !== id);
  localStorage.setItem(PINNED_MESSAGES_KEY, JSON.stringify(updated));
}

// ─── Quick Prompt Suggestions ──────────────────────────────

const QUICK_PROMPT_CHIPS = [
  {
    id: 'pipeline-performance',
    label: 'Analyze my pipeline performance',
    icon: TrendingUp,
    prompt: 'Analyze my pipeline performance. What stages need attention and where are the bottlenecks?',
  },
  {
    id: 'hot-leads-next',
    label: 'Suggest next steps for hot leads',
    icon: Target,
    prompt: 'Suggest next steps for my hot leads. What actions should I take to move them forward?',
  },
  {
    id: 'follow-up-email',
    label: 'Write a follow-up email',
    icon: Mail,
    prompt: 'Write a compelling follow-up email for a lead that has gone silent after initial interest.',
  },
  {
    id: 'at-risk-deals',
    label: 'Identify at-risk deals',
    icon: AlertTriangle,
    prompt: 'Identify at-risk deals in my pipeline. What warning signs should I watch for and how can I save them?',
  },
  {
    id: 'outreach-strategy',
    label: 'Generate outreach strategy',
    icon: Megaphone,
    prompt: 'Generate a comprehensive outreach strategy for acquiring new clients in my target market.',
  },
];

// ─── Context-aware Suggested Prompts ──────────────────────

const NO_LEAD_PROMPTS = [
  { id: 'nl-1', label: 'How do I find new leads?', icon: Search, prompt: 'How do I find new leads? What are the best strategies for discovering potential clients in my target market?' },
  { id: 'nl-2', label: 'Best outreach strategy?', icon: Megaphone, prompt: 'What is the best outreach strategy for acquiring new clients? Give me a step-by-step approach.' },
  { id: 'nl-3', label: 'Analyze my pipeline', icon: BarChart3Icon, prompt: 'Help me analyze my pipeline. Where should I focus my efforts for maximum impact?' },
];

const LEAD_SELECTED_PROMPTS = [
  { id: 'ls-1', label: 'Analyze this lead', icon: Target, prompt: 'Analyze this lead in detail. What are their key pain points and how should I approach them?' },
  { id: 'ls-2', label: 'Draft outreach message', icon: Mail, prompt: 'Draft a personalized outreach message for this lead. Make it compelling and tailored to their specific needs.' },
  { id: 'ls-3', label: 'Best approach?', icon: Lightbulb, prompt: 'What is the best approach for this business? How should I position my offer to maximize the chances of conversion?' },
];

function BarChart3Icon(props: React.ComponentProps<typeof TrendingUp>) {
  return <TrendingUp {...props} />;
}

// ─── Sales Coach Quick Prompts ─────────────────────────────

const SALES_COACH_CHIPS = [
  {
    id: 'coach-paste',
    label: 'Paste a conversation for analysis',
    icon: MessageSquare,
    prompt: 'Paste the conversation you want me to analyze. I\'ll break down intent, buying signals, hesitation factors, and give you reply options.',
  },
  {
    id: 'coach-objection',
    label: 'Help me handle a price objection',
    icon: AlertCircle,
    prompt: 'A prospect just said "Your price is too high compared to competitors." Help me handle this objection and turn it around.',
  },
  {
    id: 'coach-close',
    label: 'How to close this deal',
    icon: Target,
    prompt: 'I have a prospect who has been in discussion for 3 weeks. They seem interested but keep delaying the decision. How do I close this deal?',
  },
];

// ─── Relative Time Helper ──────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Chat Session Type ────────────────────────────────────

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  leadId?: string;
  leadName?: string;
  mode: 'default' | 'sales_coach';
}

// ─── Deal Probability Bar ─────────────────────────────────

function DealProbabilityBar({ probability }: { probability: number }) {
  const getColor = (p: number) => {
    if (p >= 70) return 'bg-emerald-500';
    if (p >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">Deal Probability</span>
        <span className={cn(
          'text-xs font-bold',
          probability >= 70 ? 'text-emerald-500' : probability >= 40 ? 'text-amber-500' : 'text-red-500'
        )}>
          {probability}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', getColor(probability))}
          style={{ width: `${probability}%` }}
        />
      </div>
    </div>
  );
}

// ─── Copyable Reply Block ─────────────────────────────────

function CopyableReply({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      toast.success('Reply copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-2.5 bg-primary/[0.04] rounded-lg border border-primary/10 relative group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-primary">{label}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
        >
          {copied ? (
            <><Check className="h-3 w-3" /> Copied!</>
          ) : (
            <><Copy className="h-3 w-3" /> Copy</>
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{content}</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function AssistantTab() {
  const selectedLeadId = useAppStore((s) => s.selectedLeadId);
  const setSelectedLeadId = useAppStore((s) => s.setSelectedLeadId);
  const activeTab = useAppStore((s) => s.activeTab);
  const queryClient = useQueryClient();

  // Local override for lead selection
  const [localOverride, setLocalOverride] = useState<string | null>(null);
  const effectiveLeadId = localOverride !== null ? (localOverride || null) : selectedLeadId;

  // Chat state
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllChips, setShowAllChips] = useState(false);

  // Sales Coach Mode
  const [salesCoachMode, setSalesCoachMode] = useState(false);
  const [dealProbability, setDealProbability] = useState<number | null>(null);

  // Session history
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Saved responses & pinned messages (lazy init from localStorage)
  const [savedResponses, setSavedResponses] = useState<SavedResponse[]>(() => {
    if (typeof window === 'undefined') return [];
    return getSavedResponses();
  });
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    return getPinnedMessages();
  });
  const [savedResponsesOpen, setSavedResponsesOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: leadsResult } = useQuery({
    queryKey: ['leads'],
    queryFn: () => fetchLeads({ limit: 100 }),
  });
  const leads = leadsResult?.leads;

  // Fetch lead communications for context panel
  const { data: leadComms } = useQuery({
    queryKey: ['communications', effectiveLeadId],
    queryFn: () => fetchCommunications(effectiveLeadId!),
    enabled: !!effectiveLeadId,
  });

  // Fetch chat sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/chat-sessions');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json() as Promise<{ sessions: ChatSession[]; total: number }>;
    },
  });

  const selectedLead = leads?.find((l) => l.id === effectiveLeadId);

  // Build conversation context from previous messages
  const conversationContext = useMemo(() => {
    if (messages.length === 0) return undefined;
    return messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 200)}`)
      .join('\n');
  }, [messages]);

  // Context panel stats
  const contextStats = useMemo(() => {
    if (!leadComms || leadComms.length === 0) {
      return { messagesSent: 0, replyRate: 0, lastActivity: null };
    }
    const outbound = leadComms.filter((c) => c.direction === 'outbound').length;
    const inbound = leadComms.filter((c) => c.direction === 'inbound').length;
    const replyRate = outbound > 0 ? Math.round((inbound / outbound) * 100) : 0;
    const lastActivity = leadComms.length > 0
      ? leadComms.reduce((latest, c) => {
          const d = new Date(c.createdAt);
          return d > latest ? d : latest;
        }, new Date(0))
      : null;
    return { messagesSent: outbound, replyRate, lastActivity };
  }, [leadComms]);

  // Context-aware suggested prompts
  const suggestedPrompts = useMemo(() => {
    if (salesCoachMode) return SALES_COACH_CHIPS;
    if (effectiveLeadId) {
      return LEAD_SELECTED_PROMPTS.map((p) => ({ ...p }));
    }
    return NO_LEAD_PROMPTS.map((p) => ({ ...p }));
  }, [effectiveLeadId, salesCoachMode]);

  const assistantMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sales-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: effectiveLeadId || null,
          message: input,
          context: conversationContext,
          salesCoachMode,
          currentPage: activeTab,
        }),
      });
      if (!res.ok) throw new Error('Failed to get response');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.mode === 'sales_coach') {
        const response: AssistantMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: data.content || '',
          buyingSignals: [],
          hesitationFactors: [],
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, response].slice(-200));
        if (data.dealProbability != null) {
          setDealProbability(data.dealProbability);
        }
      } else {
        const analysis = data.analysis || {};
        const psych = data.psychologicalApproach || {};
        const closing = data.closingStrategy || {};

        const buyingSignals = Array.isArray(analysis.buyingSignals)
          ? analysis.buyingSignals as string[]
          : [];
        const hesitationFactors = Array.isArray(analysis.hesitationPoints)
          ? analysis.hesitationPoints as string[]
          : [];

        const contentParts: string[] = [];

        if (analysis.intent) {
          contentParts.push(`**Intent Analysis:** ${analysis.intent}`);
        }
        if (buyingSignals.length > 0) {
          contentParts.push(`**Buying Signals:**\n${buyingSignals.map((s: string) => `- ${s}`).join('\n')}`);
        }
        if (hesitationFactors.length > 0) {
          contentParts.push(`**Hesitation Factors:**\n${hesitationFactors.map((s: string) => `- ${s}`).join('\n')}`);
        }
        if (data.suggestedResponse) {
          contentParts.push(`**Recommended Response:**\n${data.suggestedResponse}`);
        }
        if (psych.framework || psych.lever) {
          contentParts.push(`**Psychological Approach:** ${psych.framework || ''} — ${psych.lever || ''}. ${psych.rationale || ''}`);
        }
        if (closing.type || closing.nextMilestone) {
          contentParts.push(`**Closing Strategy:** ${closing.type || ''}. Next milestone: ${closing.nextMilestone || 'N/A'}. Timing: ${closing.timing || 'N/A'}`);
        }

        const response: AssistantMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: contentParts.join('\n\n'),
          intentAnalysis: analysis.intent as string | undefined,
          buyingSignals,
          hesitationFactors,
          recommendedResponse: data.suggestedResponse as string | undefined,
          closingStrategy: closing.type as string | undefined,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, response].slice(-200));
      }
      setInput('');
    },
    onError: () => {
      toast.error('Failed to get AI response');
    },
  });

  const handleLeadSelect = useCallback((value: string) => {
    if (value === 'none') {
      setLocalOverride('');
      setSelectedLeadId(null);
    } else {
      setLocalOverride(value);
      setSelectedLeadId(value);
    }
  }, [setSelectedLeadId]);

  const handleSend = useCallback(() => {
    if (!input.trim() || assistantMutation.isPending) return;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg].slice(-200));
    assistantMutation.mutate();
  }, [input, effectiveLeadId, assistantMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleRegenerate = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    setMessages((prev) => {
      const lastAssistantIdx = prev.map((m) => m.role).lastIndexOf('assistant');
      if (lastAssistantIdx === -1) return prev;
      return prev.slice(0, lastAssistantIdx);
    });

    setInput(lastUserMsg.content);
    setTimeout(() => {
      const res = fetch('/api/sales-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: effectiveLeadId || null,
          message: lastUserMsg.content,
          context: conversationContext,
          salesCoachMode,
          currentPage: activeTab,
        }),
      });
      res.then(async (r) => {
        if (!r.ok) throw new Error('Failed');
        const data = await r.json();
        if (data.mode === 'sales_coach') {
          const response: AssistantMessage = {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: data.content || '',
            buyingSignals: [],
            hesitationFactors: [],
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, response].slice(-200));
          if (data.dealProbability != null) {
            setDealProbability(data.dealProbability);
          }
        } else {
          const analysis = data.analysis || {};
          const psych = data.psychologicalApproach || {};
          const closing = data.closingStrategy || {};
          const buyingSignals = Array.isArray(analysis.buyingSignals) ? analysis.buyingSignals as string[] : [];
          const hesitationFactors = Array.isArray(analysis.hesitationPoints) ? analysis.hesitationPoints as string[] : [];

          const contentParts: string[] = [];
          if (analysis.intent) contentParts.push(`**Intent Analysis:** ${analysis.intent}`);
          if (buyingSignals.length > 0) contentParts.push(`**Buying Signals:**\n${buyingSignals.map((s: string) => `- ${s}`).join('\n')}`);
          if (hesitationFactors.length > 0) contentParts.push(`**Hesitation Factors:**\n${hesitationFactors.map((s: string) => `- ${s}`).join('\n')}`);
          if (data.suggestedResponse) contentParts.push(`**Recommended Response:**\n${data.suggestedResponse}`);
          if (psych.framework || psych.lever) contentParts.push(`**Psychological Approach:** ${psych.framework || ''} — ${psych.lever || ''}. ${psych.rationale || ''}`);
          if (closing.type || closing.nextMilestone) contentParts.push(`**Closing Strategy:** ${closing.type || ''}. Next milestone: ${closing.nextMilestone || 'N/A'}. Timing: ${closing.timing || 'N/A'}`);

          const response: AssistantMessage = {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: contentParts.join('\n\n'),
            intentAnalysis: analysis.intent as string | undefined,
            buyingSignals,
            hesitationFactors,
            recommendedResponse: data.suggestedResponse as string | undefined,
            closingStrategy: closing.type as string | undefined,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, response].slice(-200));
        }
      }).catch(() => {
        toast.error('Failed to regenerate response');
      });
    }, 100);
  };

  const handleClearChat = () => {
    setMessages([]);
    setDealProbability(null);
    toast.success('Chat cleared');
  };

  const handleRemoveContext = () => {
    setLocalOverride('');
    setSelectedLeadId(null);
  };

  // ─── Pin Message ──────────────────────────────────────
  const handlePinMessage = useCallback((msg: AssistantMessage) => {
    const isAlreadyPinned = pinnedMessages.some((p) => p.originalMsgId === msg.id);
    if (isAlreadyPinned) {
      const pinned = pinnedMessages.find((p) => p.originalMsgId === msg.id);
      if (pinned) {
        removePinnedMessage(pinned.id);
        setPinnedMessages(getPinnedMessages());
        toast.success('Message unpinned');
      }
    } else {
      const pinned: PinnedMessage = {
        id: `pin-${Date.now()}`,
        content: msg.content.slice(0, 200),
        timestamp: msg.createdAt,
        originalMsgId: msg.id,
      };
      savePinnedMessage(pinned);
      setPinnedMessages(getPinnedMessages());
      toast.success('Message pinned');
    }
  }, [pinnedMessages]);

  // ─── Save Response ────────────────────────────────────
  const handleSaveResponse = useCallback((msg: AssistantMessage) => {
    const saved: SavedResponse = {
      id: `saved-${Date.now()}`,
      content: msg.content,
      timestamp: msg.createdAt,
      leadName: selectedLead?.businessName,
    };
    saveResponseToStorage(saved);
    setSavedResponses(getSavedResponses());
    toast.success('Response saved');
  }, [selectedLead]);

  const handleDeleteSavedResponse = useCallback((id: string) => {
    removeSavedResponse(id);
    setSavedResponses(getSavedResponses());
    toast.success('Saved response removed');
  }, []);

  // ─── Export Chat as Markdown ──────────────────────────
  const handleExportChat = useCallback(() => {
    if (messages.length === 0) {
      toast.error('No messages to export');
      return;
    }

    const lines: string[] = [
      `# Sales Assistant Chat Export`,
      `**Date:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      selectedLead ? `**Lead:** ${selectedLead.businessName}` : '',
      salesCoachMode ? `**Mode:** Sales Coach` : `**Mode:** Standard`,
      '',
      '---',
      '',
    ];

    messages.forEach((msg) => {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      const time = new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      lines.push(`### ${role} — ${time}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported as Markdown');
  }, [messages, selectedLead, salesCoachMode]);

  // Parse Sales Coach markdown to extract structured sections
  const parseCoachSections = useMemo(() => {
    if (!salesCoachMode || messages.length === 0) return null;
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistantMsg) return null;

    const content = lastAssistantMsg.content;

    const replyOptions: { label: string; content: string }[] = [];
    const replyRegex = /###\s*(Professional|Casual|Urgent)\s*\n([\s\S]*?)(?=\n###|\n##|\n📊|$)/gi;
    let match;
    while ((match = replyRegex.exec(content)) !== null) {
      replyOptions.push({
        label: match[1],
        content: match[2].trim(),
      });
    }

    return { replyOptions, rawContent: content };
  }, [messages, salesCoachMode]);

  // Show 3 chips by default, or all if expanded
  const visibleChips = useMemo(
    () => {
      const chips = salesCoachMode ? SALES_COACH_CHIPS : QUICK_PROMPT_CHIPS;
      return showAllChips ? chips : chips.slice(0, 3);
    },
    [showAllChips, salesCoachMode]
  );
  const allChips = salesCoachMode ? SALES_COACH_CHIPS : QUICK_PROMPT_CHIPS;
  const hasMoreChips = allChips.length > 3;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, assistantMutation.isPending]);

  // Last AI message for regenerate
  const lastAssistantMsg = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages]
  );

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col pb-20 lg:pb-6">
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center relative",
                salesCoachMode
                  ? "bg-amber-500/10 animate-pulse-ring"
                  : "bg-primary/10 animate-pulse-ring"
              )}>
                {salesCoachMode ? (
                  <Zap className="h-5 w-5 text-amber-500" />
                ) : (
                  <Bot className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <h2 className="text-sm md:text-base font-semibold gradient-text">
                  {salesCoachMode ? 'Sales Coach' : 'Sales Assistant'}
                </h2>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {salesCoachMode
                    ? 'Conversation analysis & deal coaching'
                    : 'AI-powered closing strategies & conversation analysis'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Export Chat */}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleExportChat}
                  aria-label="Export chat"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}

              {/* Sales Coach Mode Toggle */}
              <Button
                variant={salesCoachMode ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'text-xs gap-1.5 transition-all duration-300',
                  salesCoachMode
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                    : 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:border-amber-500/50'
                )}
                onClick={() => {
                  setSalesCoachMode(!salesCoachMode);
                  setDealProbability(null);
                  toast.success(salesCoachMode ? 'Standard mode activated' : 'Sales Coach mode activated');
                }}
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{salesCoachMode ? 'Coach On' : 'Sales Coach'}</span>
              </Button>

              {/* Session History */}
              <Popover open={sessionsOpen} onOpenChange={setSessionsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <History className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0">
                  <div className="p-3 border-b">
                    <h4 className="text-sm font-semibold">Chat History</h4>
                    <p className="text-[10px] text-muted-foreground">Previous conversations</p>
                  </div>
                  <ScrollArea className="max-h-64">
                    <div className="p-2">
                      {sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
                        sessionsData.sessions.map((session: ChatSession) => (
                          <button
                            key={session.id}
                            className="w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                            onClick={() => {
                              setSalesCoachMode(session.mode === 'sales_coach');
                              setSessionsOpen(false);
                              toast.info(`Loaded: ${session.title}`);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'h-5 w-5 rounded flex items-center justify-center shrink-0',
                                session.mode === 'sales_coach' ? 'bg-amber-500/10' : 'bg-primary/10'
                              )}>
                                {session.mode === 'sales_coach' ? (
                                  <Zap className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Bot className="h-3 w-3 text-primary" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{session.title}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {session.messageCount} messages · {formatRelativeTime(session.updatedAt)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No previous sessions</p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {/* Clear Chat */}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleClearChat}
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}

              {/* Conversation Context Indicator */}
              {selectedLead && (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={handleRemoveContext}
                >
                  <Link2 className="h-3 w-3 text-primary" />
                  <span className="hidden sm:inline">{selectedLead.businessName}</span>
                  <span className="sm:hidden">Linked</span>
                </Badge>
              )}
              <Select value={effectiveLeadId || 'none'} onValueChange={handleLeadSelect}>
                <SelectTrigger className="w-[140px] sm:w-[200px] h-8 border-primary/20 hover:border-primary/40 transition-colors text-xs">
                  <SelectValue placeholder="Link to lead..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead selected</SelectItem>
                  {leads?.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="mb-3" />

          {/* Sales Coach Mode Banner */}
          {salesCoachMode && (
            <div className="mb-3 slide-in-up">
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20">
                <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Sales Coach Active
                  </p>
                  <p className="text-[10px] text-amber-600/60 dark:text-amber-400/60">
                    Paste a conversation below for analysis — I&apos;ll decode intent, signals, and craft winning replies
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Deal Probability (Sales Coach Mode) */}
          {salesCoachMode && dealProbability !== null && (
            <div className="mb-3 slide-in-up">
              <div className="p-3 rounded-lg border border-primary/10 bg-primary/[0.02]">
                <DealProbabilityBar probability={dealProbability} />
              </div>
            </div>
          )}

          {/* Lead Context Card (shown when lead is selected) */}
          {selectedLead && (
            <div className="mb-3 slide-in-up">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/15 bg-primary/[0.04] dark:bg-primary/[0.06]">
                <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {selectedLead.businessName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{selectedLead.businessName}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20 bg-primary/5 shrink-0">
                      {STAGE_LABELS[selectedLead.stage as keyof typeof STAGE_LABELS] || selectedLead.stage}
                    </Badge>
                    {selectedLead.niche && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {selectedLead.niche}
                      </Badge>
                    )}
                    {selectedLead.country && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {selectedLead.country}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      Conversion: <span className="font-mono font-medium text-primary">{selectedLead.conversionScore}%</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Reply: <span className="font-mono font-medium text-primary">{selectedLead.replyScore}%</span>
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 min-w-[28px] min-h-[28px] shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleRemoveContext}
                  aria-label="Remove lead context"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Pinned Messages Section */}
          {pinnedMessages.length > 0 && (
            <div className="mb-3">
              <div className="p-3 rounded-lg border border-primary/15 bg-primary/[0.03]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Pin className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">Pinned</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{pinnedMessages.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {pinnedMessages.map((pinned) => (
                    <div key={pinned.id} className="flex items-start gap-2 group">
                      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{pinned.content}</p>
                      <button
                        onClick={() => {
                          removePinnedMessage(pinned.id);
                          setPinnedMessages(getPinnedMessages());
                          toast.success('Message unpinned');
                        }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0 custom-scrollbar" ref={scrollRef}>
            <div className="space-y-4 pb-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="relative inline-block mb-4">
                    {salesCoachMode ? (
                      <Zap className="h-16 w-16 text-amber-500/20" />
                    ) : (
                      <Bot className="h-16 w-16 text-primary/20" />
                    )}
                    <div className={cn(
                      "absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center",
                      salesCoachMode ? "bg-amber-500/20" : "bg-primary/20"
                    )}>
                      <Sparkles className={cn("h-3 w-3", salesCoachMode ? "text-amber-500" : "text-primary")} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 gradient-text-animated">
                    {salesCoachMode ? 'Your Sales Coach' : 'Your AI Sales Copilot'}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    {salesCoachMode
                      ? 'Paste a conversation, describe a sales situation, or ask for closing advice. I\'ll analyze every signal.'
                      : 'Paste a conversation, describe a sales situation, or ask for closing advice. Link a lead for personalized analysis.'}
                  </p>

                  {/* Context-aware Suggested Prompts */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg mx-auto">
                    {suggestedPrompts.map((prompt) => {
                      const Icon = prompt.icon;
                      return (
                        <button
                          key={prompt.id}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-200 group btn-ripple active:scale-95",
                            salesCoachMode
                              ? "border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/20"
                              : "border-primary/10 bg-primary/5 hover:bg-primary/10 hover:border-primary/20"
                          )}
                          onClick={() => setInput(prompt.prompt)}
                        >
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform",
                            salesCoachMode ? "bg-amber-500/10" : "bg-primary/10"
                          )}>
                            <Icon className={cn("h-4 w-4", salesCoachMode ? "text-amber-500" : "text-primary")} />
                          </div>
                          <span className="text-[11px] font-medium text-center leading-tight">{prompt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isPinned = pinnedMessages.some((p) => p.originalMsgId === msg.id);
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-3 group msg-timestamp-hover',
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                        salesCoachMode ? "bg-amber-500/10" : "bg-primary/10"
                      )}>
                        {salesCoachMode ? (
                          <Zap className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Bot className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    )}
                    <div className="max-w-[80%]">
                      <div
                        className={cn(
                          'rounded-2xl p-3',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : salesCoachMode
                              ? 'bg-gradient-to-br from-amber-500/[0.06] to-muted border border-amber-500/10 rounded-bl-md glass-card'
                              : 'bg-gradient-to-br from-primary/[0.06] to-muted border border-primary/10 rounded-bl-md glass-card',
                          isPinned && msg.role === 'assistant' && 'ring-1 ring-primary/20'
                        )}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="space-y-3">
                            {/* Sales Coach Mode: Render raw Markdown content */}
                            {salesCoachMode ? (
                              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                {msg.content.split('\n').map((line, lineIdx) => {
                                  if (line.startsWith('## 🎯')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-primary mt-3 first:mt-0">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('## 🟢')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-emerald-500 mt-3">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('## 🔴')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-red-500 mt-3">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('## 💬')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-primary mt-3">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('## 🏁')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-amber-500 mt-3">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('## 📊')) {
                                    return <h3 key={lineIdx} className="text-sm font-bold text-primary mt-3">{line.replace('## ', '')}</h3>;
                                  }
                                  if (line.startsWith('### ')) {
                                    return <h4 key={lineIdx} className="text-xs font-semibold text-primary/80 mt-2">{line.replace('### ', '')}</h4>;
                                  }
                                  if (line.startsWith('- ')) {
                                    return <p key={lineIdx} className="text-xs text-muted-foreground pl-3">• {line.substring(2)}</p>;
                                  }
                                  if (line.trim() === '') {
                                    return <div key={lineIdx} className="h-1" />;
                                  }
                                  return <p key={lineIdx} className="text-xs text-muted-foreground">{line}</p>;
                                })}

                                {parseCoachSections && parseCoachSections.replyOptions.length > 0 && idx === messages.length - 1 && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider">Quick Copy Replies</p>
                                    {parseCoachSections.replyOptions.map((opt) => (
                                      <CopyableReply key={opt.label} label={opt.label} content={opt.content} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                {/* Default Mode: Structured analysis */}
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                                {msg.buyingSignals && msg.buyingSignals.length > 0 && (
                                  <div className="space-y-2 mt-2 pl-3 border-l-2 border-emerald-500/40">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                                      <Lightbulb className="h-3.5 w-3.5" />
                                      Buying Signals
                                    </div>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                      {msg.buyingSignals.map((s, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-emerald-500 mt-0.5">•</span>
                                          {s}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {msg.hesitationFactors && msg.hesitationFactors.length > 0 && (
                                  <div className="space-y-2 mt-2 pl-3 border-l-2 border-orange-500/40">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-500">
                                      <AlertCircle className="h-3.5 w-3.5" />
                                      Hesitation Factors
                                    </div>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                      {msg.hesitationFactors.map((s, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-orange-500 mt-0.5">•</span>
                                          {s}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {msg.recommendedResponse && (
                                  <CopyableReply label="Recommended Response" content={msg.recommendedResponse} />
                                )}

                                {msg.closingStrategy && (
                                  <div className="mt-2 p-2.5 bg-emerald-500/[0.04] rounded-lg border border-emerald-500/10">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 mb-1">
                                      <Target className="h-3.5 w-3.5" />
                                      Closing Strategy
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{msg.closingStrategy}</p>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Action buttons: Copy, Pin, Save */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-primary/5">
                              <span className="msg-time text-[10px] text-muted-foreground">
                                {formatRelativeTime(msg.createdAt)}
                              </span>
                              <div className="flex items-center gap-0.5">
                                {/* Regenerate button on last AI message */}
                                {msg === lastAssistantMsg && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200 min-h-[24px]"
                                    onClick={handleRegenerate}
                                    disabled={assistantMutation.isPending}
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Regenerate
                                  </Button>
                                )}
                                {/* Pin button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-6 px-2 text-[10px] min-h-[24px] opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                                    isPinned ? "text-primary opacity-100" : "text-muted-foreground hover:text-primary"
                                  )}
                                  onClick={() => handlePinMessage(msg)}
                                  title={isPinned ? 'Unpin message' : 'Pin message'}
                                >
                                  {isPinned ? <PinOff className="h-3 w-3 mr-1" /> : <Pin className="h-3 w-3 mr-1" />}
                                  {isPinned ? 'Unpin' : 'Pin'}
                                </Button>
                                {/* Save button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200 min-h-[24px]"
                                  onClick={() => handleSaveResponse(msg)}
                                  title="Save response"
                                >
                                  <Bookmark className="h-3 w-3 mr-1" />
                                  Save
                                </Button>
                                {/* Copy button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200 min-h-[24px]"
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="h-3 w-3 mr-1" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3 mr-1" />
                                      Copy
                                    </>
                                    )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className="msg-time text-[10px] text-primary-foreground/50 mt-1.5 text-right">
                              {formatRelativeTime(msg.createdAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Thinking indicator */}
              {assistantMutation.isPending && (
                <motion.div
                  className="flex gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1 breathing-pulse",
                    salesCoachMode ? "bg-amber-500/10" : "bg-primary/10"
                  )}>
                    {salesCoachMode ? (
                      <Zap className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className={cn(
                    "rounded-2xl rounded-bl-md p-3 glass-card",
                    salesCoachMode
                      ? "bg-gradient-to-br from-amber-500/[0.06] to-muted border border-amber-500/10"
                      : "bg-gradient-to-br from-primary/[0.06] to-muted border border-primary/10"
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground mr-1">
                        {salesCoachMode ? 'Coaching' : 'Analyzing'}
                      </span>
                      <div className="typing-indicator">
                        <span /><span /><span />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[0, 1, 2, 3].map(i => (
                        <motion.div
                          key={i}
                          className={cn(
                            "h-1 rounded-full",
                            salesCoachMode ? "bg-amber-500/40" : "bg-primary/40"
                          )}
                          initial={{ width: '8px' }}
                          animate={{ width: ['8px', '24px', '8px'] }}
                          transition={{
                            duration: 1.2,
                            delay: i * 0.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className={cn(
            "pt-3 border-t rounded-lg",
            salesCoachMode ? "gradient-border-animated-amber" : "gradient-border-animated-2"
          )}>
            <div className={cn(
              "h-0.5 w-full mb-3 -mt-3",
              salesCoachMode
                ? "bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"
                : "bg-gradient-to-r from-transparent via-primary/30 to-transparent"
            )} />

            {/* Quick Prompt Chips */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll-snap-x custom-scrollbar">
                {visibleChips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={chip.id}
                      className={cn(
                        "ai-suggestion-chip shrink-0 btn-ripple",
                        salesCoachMode ? "prompt-chip-gradient-amber" : "prompt-chip-gradient"
                      )}
                      onClick={() => setInput(chip.prompt)}
                    >
                      <span className={cn(
                        "ai-sparkle",
                        salesCoachMode ? "bg-amber-500/15" : ""
                      )}>
                        <Sparkles className={cn("h-2.5 w-2.5", salesCoachMode ? "text-amber-500" : "text-primary")} />
                      </span>
                      <span className="hidden sm:inline">{chip.label}</span>
                      <span className="sm:hidden">{chip.label.split(' ').slice(0, 2).join(' ')}</span>
                    </button>
                  );
                })}
                {hasMoreChips && !showAllChips && (
                  <button
                    className="ai-suggestion-chip shrink-0 border-dashed"
                    onClick={() => setShowAllChips(true)}
                  >
                    <ChevronRight className="h-3 w-3" />
                    <span>More</span>
                  </button>
                )}
                {showAllChips && hasMoreChips && (
                  <button
                    className="ai-suggestion-chip shrink-0 border-dashed"
                    onClick={() => setShowAllChips(false)}
                  >
                    <span>Less</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  salesCoachMode
                    ? "Paste a conversation or describe the situation for coaching..."
                    : "Describe your sales situation or paste a conversation..."
                }
                rows={2}
                className={cn(
                  "resize-none gradient-border-focus",
                  salesCoachMode ? "border-amber-500/20" : "border-primary/20"
                )}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || assistantMutation.isPending}
                size="icon"
                className={cn(
                  "shrink-0 self-end h-11 w-11 transition-all duration-200 hover:shadow-lg btn-ripple active:scale-95",
                  salesCoachMode
                    ? "bg-amber-500 hover:bg-amber-600 hover:shadow-amber-500/20 text-white"
                    : "bg-primary hover:bg-primary/90 hover:shadow-primary/20"
                )}
              >
                {assistantMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ─── Context Panel (desktop only) ────────────────── */}
        {selectedLead && (
          <div className="hidden lg:block w-72 shrink-0">
            <Card className="sticky top-4 card-glow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm gradient-text">Lead Context</CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6 min-w-[24px] min-h-[24px]" onClick={() => setShowContext(!showContext)}>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showContext && 'rotate-180')} />
                  </Button>
                </div>
              </CardHeader>
              {showContext !== false && (
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{selectedLead.businessName}</p>
                    <p className="text-xs text-muted-foreground">{selectedLead.ownerName}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{selectedLead.niche}</Badge>
                    <Badge variant="outline" className="text-[10px] border-primary/20">{selectedLead.stage}</Badge>
                    <Badge variant="outline" className="text-[10px] border-primary/20">{selectedLead.country}</Badge>
                  </div>
                  <Separator />

                  {/* Quick Stats */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Stats</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Messages Sent</span>
                      <span className="font-mono font-medium text-primary">{contextStats.messagesSent}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Reply Rate</span>
                      <span className="font-mono font-medium text-primary">{contextStats.replyRate}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Reply Score</span>
                      <span className="font-mono font-medium text-primary">{selectedLead.replyScore}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Conversion</span>
                      <span className="font-mono font-medium text-primary">{selectedLead.conversionScore}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Urgency</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20">{selectedLead.urgency}</Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Revenue</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20">{selectedLead.revenuePotential}</Badge>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  {leadComms && leadComms.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</p>
                        {leadComms.slice(0, 3).map((comm) => (
                          <div key={comm.id} className="flex items-start gap-1.5 text-xs">
                            <span className={cn(
                              "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                              comm.direction === 'inbound' ? 'bg-sky-500' : 'bg-emerald-500'
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className="text-muted-foreground line-clamp-1">{comm.content.slice(0, 60)}</p>
                              <p className="text-[10px] text-muted-foreground/60">{formatRelativeTime(comm.createdAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedLead.digitalWeaknesses.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1 pl-3 border-l-2 border-orange-500/30">
                        <p className="text-xs font-semibold text-muted-foreground">Weaknesses</p>
                        {selectedLead.digitalWeaknesses.slice(0, 3).map((w, i) => (
                          <p key={i} className="text-xs text-muted-foreground">• {w.issue}</p>
                        ))}
                      </div>
                    </>
                  )}
                  {selectedLead.notes && (
                    <>
                      <Separator />
                      <div className="pl-3 border-l-2 border-primary/30">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                        <p className="text-xs text-muted-foreground line-clamp-3">{selectedLead.notes}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ─── Saved Responses Section (Collapsible) ────────── */}
      {savedResponses.length > 0 && (
        <Collapsible open={savedResponsesOpen} onOpenChange={setSavedResponsesOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
              <Bookmark className="h-4 w-4 text-primary" />
              Saved Responses
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{savedResponses.length}</Badge>
              <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform', savedResponsesOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {savedResponses.map((response) => (
                <div
                  key={response.id}
                  className="group flex items-start gap-3 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground line-clamp-2">{response.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(response.timestamp)}</span>
                      {response.leadName && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/20">
                          {response.leadName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 min-h-[24px]"
                      onClick={() => {
                        navigator.clipboard.writeText(response.content);
                        toast.success('Copied to clipboard');
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 min-h-[24px] text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteSavedResponse(response.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
