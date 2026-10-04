'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Copy,
  Check,
  Sparkles,
  Minimize2,
  Zap,
  ChevronUp,
  RefreshCw,
  Calendar,
  Video,
  ArrowRight,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { askSalesAssistant } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { AssistantMessage, MeetingIntent } from '@/lib/types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Dialog
const ScheduleMeetingModal = dynamic(
  () => import('@/components/meetings/schedule-meeting-modal'),
  { ssr: false }
);

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

// ─── Intent Label Helper ──────────────────────────────────

function getIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    schedule_call: 'Schedule Call',
    book_meeting: 'Book Meeting',
    discuss: 'Discussion',
    connect: 'Connect Call',
    available: 'Availability Check',
    interested: 'Discovery Meeting',
  };
  return labels[intent] || intent.replace(/_/g, ' ');
}

function getIntentColor(intent: string): string {
  const colors: Record<string, string> = {
    schedule_call: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    book_meeting: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
    discuss: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    connect: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    available: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    interested: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  };
  return colors[intent] || 'text-primary bg-primary/10 border-primary/20';
}

// ─── Meeting Intent Card ──────────────────────────────────

function MeetingIntentCard({
  meetingIntent,
  onSchedule,
}: {
  meetingIntent: MeetingIntent;
  onSchedule: () => void;
}) {
  const colorClass = getIntentColor(meetingIntent.intent);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.2 }}
      className="mt-2 rounded-lg border border-teal-500/30 bg-teal-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-teal-500/10 border-b border-teal-500/20">
        <Calendar className="h-3 w-3 text-teal-500 shrink-0" />
        <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
          Meeting Intent Detected
        </span>
        <Badge
          variant="outline"
          className={cn(
            'ml-auto text-[9px] px-1.5 py-0 h-4 font-semibold border',
            colorClass
          )}
        >
          {getIntentLabel(meetingIntent.intent)}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-2.5 py-2 space-y-1.5">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {meetingIntent.suggestedAction}
        </p>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Percent className="h-2.5 w-2.5" />
            <span>Confidence: {Math.round(meetingIntent.confidence * 100)}%</span>
          </div>
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.round(meetingIntent.confidence * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="px-2.5 pb-2">
        <Button
          size="sm"
          onClick={onSchedule}
          className={cn(
            'w-full h-7 text-[10px] font-semibold gap-1.5',
            'bg-teal-600 hover:bg-teal-700 text-white'
          )}
        >
          <Video className="h-3 w-3" />
          Schedule Meeting
          <ArrowRight className="h-2.5 w-2.5" />
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function AIChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleLeadId, setScheduleLeadId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = useAppStore((s) => s.activeTab);
  const selectedLeadId = useAppStore((s) => s.selectedLeadId);

  // Reset unread when panel opens
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      setUnreadCount(0);
      // Focus input after panel animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, []);

  useEffect(() => {
    // Focus input when panel is already open on mount
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const assistantMutation = useMutation({
    mutationFn: () => askSalesAssistant(selectedLeadId || null, input),
    onSuccess: (response) => {
      setMessages((prev) => [...prev, response].slice(-200));
      setInput('');
      if (!isOpen) {
        setUnreadCount((c) => c + 1);
      }
    },
  });

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
  }, [input, selectedLeadId, assistantMutation]);

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

  const handleClear = () => {
    setMessages([]);
    toast.success('Chat cleared');
  };

  const handleScheduleMeeting = useCallback((leadId?: string) => {
    setScheduleLeadId(leadId || selectedLeadId || undefined);
    setScheduleModalOpen(true);
  }, [selectedLeadId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, assistantMutation.isPending]);

  // FIX (2026-09-09): Hidden on the Assistant tab — that page is
  // already the AI chat surface and this bubble overlaps its
  // message input / Send button. (All hooks above have run,
  // so this early return is rules-of-hooks safe.)
  if (activeTab === 'assistant') return null;
  // AI_BUBBLE_ASSISTANT_GUARD
  return (
    <>
      {/* ─── Floating Bubble Button ─── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => handleOpenChange(true)}
            style={{ position: 'fixed', bottom: '136px', right: '20px', zIndex: 450 }}
            className="fix5-fab-ai-assistant h-14 w-14 rounded-full bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group"
            aria-label="Open AI Assistant"
          >
            {/* Pulse ring animation */}
            <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-primary" />

            <MessageSquare className="h-6 w-6 relative z-10 group-hover:scale-110 transition-transform" />

            {/* Unread indicator */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 animate-in zoom-in duration-200">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Slide-over Panel ─── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop (mobile only) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[449] lg:hidden"
              onClick={() => handleOpenChange(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={cn(
                'fixed z-[450] flex flex-col bg-background/95 backdrop-blur-xl border border-primary/10',
                // FIX (2026-09-09): Lift panel ABOVE the floating feedback
                // button (which sits at bottom-20 right-5). Previously the
                // open panel bottom aligned with the feedback FAB, causing
                // the green feedback icon to overlap / hide the chat Send
                // button. Moving the panel up to bottom-36 clears the FAB.
                // Mobile: bottom sheet above bottom nav + feedback FAB
                'inset-x-0 bottom-36 rounded-t-2xl max-h-[calc(90vh-9rem)]',
                // Desktop: 420px slide-over panel, lifted above feedback FAB
                'lg:inset-x-auto lg:right-6 lg:bottom-36 lg:top-auto lg:w-[420px] lg:h-[560px] lg:rounded-2xl lg:max-h-none',
                'shadow-2xl shadow-primary/10'
              )}
            >
              {/* ─── Panel Header ─── */}
              <div className="flex items-center justify-between p-3 border-b border-primary/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold gradient-text">Quick Assistant</h3>
                    <p className="text-[10px] text-muted-foreground">AI-powered sales help</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={handleClear}
                      aria-label="Clear chat"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenChange(false)}
                    aria-label="Minimize panel"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* ─── Messages Area ─── */}
              <ScrollArea className="flex-1 min-h-0 custom-scrollbar" ref={scrollRef}>
                <div className="p-3 space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium mb-1">Quick AI Assistant</p>
                      <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
                        Ask anything about your sales pipeline, leads, or get conversation coaching.
                      </p>
                      {/* Quick prompts */}
                      <div className="mt-4 space-y-1.5">
                        {[
                          'What should I focus on today?',
                          'Analyze my top lead',
                          'Write a follow-up email',
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-primary/10 bg-primary/5 hover:bg-primary/10 hover:border-primary/20 transition-all"
                            onClick={() => setInput(prompt)}
                          >
                            <Sparkles className="h-3 w-3 text-primary inline mr-1.5" />
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2 group',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3 w-3 text-primary" />
                        </div>
                      )}
                      <div className="max-w-[85%]">
                        <div
                          className={cn(
                            'rounded-xl p-2.5 text-xs',
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-gradient-to-br from-primary/[0.06] to-muted border border-primary/10 rounded-bl-sm'
                          )}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="space-y-1.5">
                              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                              {msg.buyingSignals && msg.buyingSignals.length > 0 && (
                                <div className="pl-2 border-l-2 border-emerald-500/40 space-y-0.5">
                                  <p className="text-[10px] font-semibold text-emerald-500">Buying Signals</p>
                                  {msg.buyingSignals.map((s, i) => (
                                    <p key={i} className="text-[10px] text-muted-foreground">• {s}</p>
                                  ))}
                                </div>
                              )}
                              {msg.hesitationFactors && msg.hesitationFactors.length > 0 && (
                                <div className="pl-2 border-l-2 border-orange-500/40 space-y-0.5">
                                  <p className="text-[10px] font-semibold text-orange-500">Hesitation</p>
                                  {msg.hesitationFactors.map((s, i) => (
                                    <p key={i} className="text-[10px] text-muted-foreground">• {s}</p>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-primary/5">
                                <span className="text-[9px] text-muted-foreground">
                                  {formatRelativeTime(msg.createdAt)}
                                </span>
                                <button
                                  className="text-[9px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                >
                                  {copiedId === msg.id ? (
                                    <><Check className="h-2.5 w-2.5" /> Copied</>
                                  ) : (
                                    <><Copy className="h-2.5 w-2.5" /> Copy</>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              <p className="text-[9px] text-primary-foreground/50 mt-1 text-right">
                                {formatRelativeTime(msg.createdAt)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Meeting Intent Card - shown below assistant message bubble */}
                        {msg.role === 'assistant' && msg.meetingIntent && (
                          <MeetingIntentCard
                            meetingIntent={msg.meetingIntent}
                            onSchedule={() => handleScheduleMeeting(msg.meetingIntent?.leadId)}
                          />
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Thinking indicator */}
                  {assistantMutation.isPending && (
                    <div className="flex gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                      <div className="bg-gradient-to-br from-primary/[0.06] to-muted border border-primary/10 rounded-xl rounded-bl-sm p-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Analyzing</span>
                          <div className="typing-indicator">
                            <span /><span /><span />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* ─── Input Area ─── */}
              <div className="p-3 border-t border-primary/10 shrink-0 lg:p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    rows={1}
                    className="resize-none min-h-[36px] max-h-[80px] text-xs border-primary/20 gradient-border-focus"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || assistantMutation.isPending}
                    size="icon"
                    className="shrink-0 h-9 w-9 bg-primary hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20"
                  >
                    {assistantMutation.isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Schedule Meeting Modal ─── */}
      <ScheduleMeetingModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        defaultLeadId={scheduleLeadId}
        onSuccess={(meeting) => {
          toast.success('Meeting scheduled successfully!');
          setScheduleModalOpen(false);
          // Add a system message about the scheduled meeting
          const meetingData = meeting as Record<string, unknown>;
          const meetingTitle = (meetingData.title as string) || 'Meeting';
          const meetingTime = meetingData.startDateTime
            ? new Date(meetingData.startDateTime as string).toLocaleString()
            : 'TBD';
          setMessages((prev) => [
            ...prev,
            {
              id: `system-meeting-${Date.now()}`,
              role: 'assistant',
              content: `✅ Meeting scheduled: **${meetingTitle}** on ${meetingTime}`,
              createdAt: new Date().toISOString(),
            },
          ]);
        }}
      />
    </>
  );
}
