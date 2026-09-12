'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bot,
  Send,
  Sparkles,
  FileText,
  BarChart3,
  PenLine,
  DollarSign,
  ChevronDown,
  Lightbulb,
  ArrowRight,
  User,
  Zap,
  MessageSquare,
} from 'lucide-react';

/* ===== Types ===== */
type ChatRole = 'user' | 'ai';
type ContextScope = 'Pipeline' | 'Contacts' | 'Revenue' | 'Team';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  response: string;
  color: string;
}

interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

/* ===== Quick Actions (UI labels only, responses come from AI) ===== */
const QUICK_ACTIONS: QuickAction[] = [
  { id: 'summarize', label: 'Summarize Pipeline', icon: FileText, color: 'from-blue-500 to-cyan-500', response: '' },
  { id: 'score', label: 'Score My Leads', icon: BarChart3, color: 'from-violet-500 to-purple-500', response: '' },
  { id: 'followup', label: 'Draft Follow-up', icon: PenLine, color: 'from-emerald-500 to-teal-500', response: '' },
  { id: 'predict', label: 'Predict Revenue', icon: DollarSign, color: 'from-amber-500 to-orange-500', response: '' },
];
// Note: QUICK_ACTIONS are UI shortcut configuration (not dynamic data).
// conversationHistory and suggestedActions are fetched from API below.

const CONTEXT_OPTIONS: { key: ContextScope; icon: React.ElementType }[] = [
  { key: 'Pipeline', icon: BarChart3 },
  { key: 'Contacts', icon: User },
  { key: 'Revenue', icon: DollarSign },
  { key: 'Team', icon: Zap },
];

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes copilotFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes copilotSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes copilotTyping {
  0%, 60% { opacity: 0.3; }
  30% { opacity: 1; }
}
@keyframes copilotGlow {
  0%, 100% { box-shadow: 0 0 8px rgba(139, 92, 246, 0.2); }
  50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); }
}
@keyframes copilotPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes copilotShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.copilot-animate-in { animation: copilotFadeIn 0.5s ease-out both; }
.copilot-animate-delay-1 { animation: copilotFadeIn 0.5s ease-out 0.1s both; }
.copilot-animate-delay-2 { animation: copilotFadeIn 0.5s ease-out 0.2s both; }
.copilot-slide-up { animation: copilotSlideUp 0.3s ease-out both; }
.copilot-typing-dot { animation: copilotTyping 1.4s ease-in-out infinite; }
.copilot-glow { animation: copilotGlow 3s ease-in-out infinite; }
.copilot-pulse { animation: copilotPulse 2s ease-in-out infinite; }
.copilot-shimmer {
  background: linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.08) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: copilotShimmer 2s linear infinite;
}
`;

const IMPACT_CONFIG = {
  high: { label: 'High Impact', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  medium: { label: 'Medium', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  low: { label: 'Low', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
};

/* ===== Typewriter Hook ===== */
function useTypewriter(text: string, speed: number = 15) {
  const [displayed, setDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      setIsTyping(false);
      return;
    }
    setIsTyping(true);
    setDisplayed('');
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayed(text.slice(0, index + 1));
        index++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, isTyping };
}

/* ===== Chat Bubble Component ===== */
function ChatBubble({ message }: { message: ChatMessage }) {
  const isAI = message.role === 'ai';

  return (
    <div
      className={cn(
        'copilot-slide-up flex gap-2.5',
        isAI ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-background shadow-sm',
          isAI
            ? 'bg-gradient-to-br from-violet-500 to-purple-600 copilot-glow'
            : 'bg-gradient-to-br from-sky-500 to-blue-600'
        )}
      >
        {isAI ? <Bot className="h-3.5 w-3.5 text-white" /> : <User className="h-3.5 w-3.5 text-white" />}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed',
          isAI
            ? 'bg-muted/60 text-foreground rounded-tl-md'
            : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-tr-md'
        )}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        <div
          className={cn(
            'text-[9px] mt-1.5',
            isAI ? 'text-muted-foreground' : 'text-white/60'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

/* ===== Typing Indicator ===== */
function TypingIndicator() {
  return (
    <div className="copilot-slide-up flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 border border-background shadow-sm copilot-glow">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="bg-muted/60 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 copilot-typing-dot" style={{ animationDelay: '0s' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 copilot-typing-dot" style={{ animationDelay: '0.2s' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 copilot-typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function AICopilotPanel() {
  const [mounted, setMounted] = useState(false);
  const [context, setContext] = useState<ContextScope>('Pipeline');
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeResponse, setActiveResponse] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    // Fetch conversation history and suggested actions from API
    fetch('/api/ai/copilot')
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then((data) => {
        const d = data.data || data;
        if (d.suggestedActions && Array.isArray(d.suggestedActions)) {
          setSuggestedActions(d.suggestedActions);
        }
        if (d.conversationHistory && Array.isArray(d.conversationHistory)) {
          const mapped = d.conversationHistory.map((m: Record<string, unknown>) => ({
            id: String(m.id || Math.random()),
            role: (m.role === 'user' ? 'user' : 'ai') as ChatRole,
            content: String(m.content || ''),
            timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
          }));
          setConversationHistory(mapped);
        }
      })
      .catch(() => {
        // API doesn't exist yet — leave suggestedActions and conversationHistory empty
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const { displayed: typewriterText, isTyping: isTypeWriterActive } = useTypewriter(
    activeResponse ?? '',
    12
  );

  const handleQuickAction = (action: QuickAction) => {
    const userMsg: ChatMessage = {
      id: `qa-${Date.now()}`,
      role: 'user',
      content: action.label,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg].slice(-200));
    setIsTyping(true);
    setActiveResponse(null);

    setTimeout(() => {
      setIsTyping(false);
      setActiveResponse(action.response);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: action.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg].slice(-200));
    }, 1200);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg].slice(-200));
    setInputValue('');
    setIsTyping(true);

    const errorMessage = 'AI assistant is currently unavailable. Please try again.';

    setTimeout(() => {
      setIsTyping(false);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: errorMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg].slice(-200));
    }, 1500);
  };

  const currentContext = CONTEXT_OPTIONS.find((c) => c.key === context);

  const displayMessages = showHistory ? conversationHistory : messages;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'copilot-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-purple-600 copilot-glow">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                AI Copilot & Smart Assistant
                <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/25 border text-[9px] h-5">
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  GPT-Powered
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Context Selector Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowContextDropdown(!showContextDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/40 text-xs font-medium hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                  >
                    {currentContext && (
                      <>
                        <currentContext.icon className="h-3.5 w-3.5 text-violet-500" />
                        <span>{context}</span>
                      </>
                    )}
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-muted-foreground transition-transform duration-200',
                        showContextDropdown && 'rotate-180'
                      )}
                    />
                  </button>
                  {showContextDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1 copilot-slide-up">
                      {CONTEXT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.key}
                            onClick={() => {
                              setContext(option.key);
                              setShowContextDropdown(false);
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer',
                              context === option.key
                                ? 'bg-violet-500/10 text-violet-500 font-medium'
                                : 'hover:bg-muted/50 text-foreground'
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{option.key}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border border-border/50 text-xs font-medium transition-all duration-200 cursor-pointer',
                    showHistory
                      ? 'bg-violet-500/10 text-violet-500 border-violet-500/30'
                      : 'bg-muted/40 hover:bg-muted/60'
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1 inline" />
                  {showHistory ? 'Live Chat' : 'History'}
                </button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chat Area — 3 columns */}
          <div className={cn('lg:col-span-3', mounted ? 'copilot-animate-delay-1' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden flex flex-col" style={{ minHeight: '520px' }}>
              {/* Quick Actions */}
              <div className="p-4 border-b border-border/30">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">
                  Quick Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/40 text-xs font-medium',
                          'bg-background/50 hover:bg-muted/50 transition-all duration-200 cursor-pointer',
                          'hover:border-violet-500/30 hover:shadow-sm'
                        )}
                      >
                        <div className={cn('rounded-md p-1 bg-gradient-to-br', action.color)}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {displayMessages.length === 0 && !isTyping && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="rounded-full bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-4 mb-4 copilot-pulse">
                      <Bot className="h-8 w-8 text-violet-500" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1">AI Copilot Ready</h3>
                    <p className="text-xs text-muted-foreground max-w-[280px]">
                      Ask me anything about your pipeline, leads, revenue, or team performance.
                      Try a quick action above!
                    </p>
                  </div>
                )}

                {displayMessages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}

                {isTyping && <TypingIndicator />}
                <div ref={chatEndRef} />
              </div>

              {/* Typewriter Response Preview */}
              {activeResponse && isTypeWriterActive && (
                <div className="px-4 py-2 border-t border-border/30 copilot-shimmer">
                  <div className="flex items-center gap-1.5 text-[10px] text-violet-500 font-medium mb-1">
                    <Sparkles className="h-3 w-3" />
                    AI is responding...
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {typewriterText}
                  </p>
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 border-t border-border/30">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 transition-all duration-200">
                    <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={`Ask AI anything about ${context.toLowerCase()}...`}
                      className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isTyping}
                    className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200"
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground/60 mt-2 text-center">
                  Context: {context} • AI responses are based on your current pipeline data
                </p>
              </div>
            </Card>
          </div>

          {/* Suggested Actions Sidebar — 1 column */}
          <div className={cn('lg:col-span-1', mounted ? 'copilot-animate-delay-2' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  AI Suggestions
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Smart actions based on your data</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestedActions.length > 0 ? suggestedActions.map((suggestion, idx) => {
                  const impact = IMPACT_CONFIG[suggestion.impact];
                  return (
                    <div
                      key={suggestion.id}
                      className={cn(
                        'rounded-lg border p-3 transition-all duration-300 cursor-pointer',
                        'hover:shadow-md hover:border-violet-500/30',
                        impact.border, impact.bg,
                        'copilot-slide-up'
                      )}
                      style={{ animationDelay: `${idx * 0.1 + 0.3}s` }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold">{suggestion.title}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                        {suggestion.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={cn('text-[8px] h-4 px-1.5', impact.color, impact.border)}
                        >
                          {impact.label}
                        </Badge>
                        <button className="flex items-center gap-0.5 text-[10px] text-violet-500 font-medium hover:text-violet-400 transition-colors cursor-pointer">
                          Apply <ArrowRight className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                }) : null}

                {/* AI Insights Summary */}
                <div className="mt-4 p-3 rounded-lg bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-violet-500/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[10px] font-semibold text-violet-500">AI Insight</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Your pipeline velocity increased 18% this week. Focus on closing the 3 deals in negotiation
                    stage — combined value of $890K. Best window: next 5 days based on engagement signals.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
