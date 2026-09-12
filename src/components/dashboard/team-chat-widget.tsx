'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Users,
  Smile,
  Paperclip,
  AtSign,
  Check,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ─────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  avatar: string;
  online: boolean;
  color: string;
}

interface LeadContext {
  name: string;
  score: number;
  stage: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  mentions: string[];
  read: boolean;
  leadContext?: LeadContext;
}

interface TeamChatWidgetProps {
  className?: string;
}

// ─── Default empty data (fetched from API) ──────────────────────────────

const CURRENT_USER_ID = 'current';

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [];

const DEFAULT_MESSAGES: ChatMessage[] = [];

// ─── Helpers ───────────────────────────────────────────────

function getMember(id: string, members: TeamMember[]): TeamMember | undefined {
  return members.find((m) => m.id === id);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function highlightMentions(text: string, members: TeamMember[]): React.ReactNode[] {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const memberId = part.slice(1).toLowerCase();
      const member = getMember(memberId, members);
      return (
        <span key={i} className="font-semibold text-primary">
          {member ? `@${member.name}` : part}
        </span>
      );
    }
    return part;
  });
}

// ─── Context Card ──────────────────────────────────────────

function LeadContextCard({ ctx }: { ctx: LeadContext }) {
  const stageColor =
    ctx.stage === 'Negotiation'
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : ctx.stage === 'Prospecting'
        ? 'text-blue-600 bg-blue-50 border-blue-200'
        : 'text-emerald-600 bg-emerald-50 border-emerald-200';

  return (
    <div className="mt-1.5 rounded-lg border border-primary/10 bg-gradient-to-r from-primary/[0.04] to-muted/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold truncate">{ctx.name}</span>
        <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full border', stageColor)}>
          {ctx.stage}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
            style={{ width: `${ctx.score}%` }}
          />
        </div>
        <span className="text-[9px] font-semibold text-primary">{ctx.score}</span>
      </div>
    </div>
  );
}

// ─── Mention Dropdown ──────────────────────────────────────

function MentionDropdown({
  query,
  onSelect,
  teamMembers,
}: {
  query: string;
  onSelect: (member: TeamMember) => void;
  teamMembers: TeamMember[];
}) {
  const filtered = teamMembers.filter((m) =>
    m.name.toLowerCase().startsWith(query.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-56 rounded-xl border border-primary/10 bg-background/95 backdrop-blur-xl shadow-xl overflow-hidden z-50">
      <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-primary/5">
        Team Members
      </div>
      {filtered.map((member) => (
        <button
          key={member.id}
          onClick={() => onSelect(member)}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 hover:bg-primary/5 transition-colors text-left"
        >
          <div className="relative">
            <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white', member.color)}>
              {member.avatar}
            </div>
            {member.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium">{member.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Typing Indicator ──────────────────────────────────────

function TypingIndicator({ member }: { member: TeamMember }) {
  return (
    <div className="flex gap-2 items-end">
      <div className="relative">
        <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white', member.color)}>
          {member.avatar}
        </div>
        {member.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-background" />
        )}
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {member.name} is typing
          </span>
          <span className="typing-indicator">
            <span /><span /><span />
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ────────────────────────────────────────

function MessageBubble({ message, teamMembersList }: { message: ChatMessage; teamMembersList: TeamMember[] }) {
  const isOwn = message.senderId === CURRENT_USER_ID;
  const member = getMember(message.senderId, teamMembersList);

  if (!member) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('flex gap-2', isOwn ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div className="relative shrink-0 mt-0.5">
        <div
          className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
            member.color
          )}
        >
          {member.avatar}
        </div>
        {member.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
        )}
      </div>

      {/* Bubble */}
      <div className="max-w-[78%] min-w-0">
        {/* Sender name */}
        {!isOwn && (
          <p className="text-[10px] font-semibold text-muted-foreground mb-0.5 px-1">
            {member.name}
            {message.mentions.includes(CURRENT_USER_ID) && (
              <span className="ml-1 text-primary">(mentioned you)</span>
            )}
          </p>
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-xs leading-relaxed relative',
            isOwn
              ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm bubble-tail-right'
              : 'bg-muted text-foreground rounded-bl-sm bubble-tail-left'
          )}
        >
          <p className="whitespace-pre-wrap">{highlightMentions(message.text, teamMembersList)}</p>

          {/* Lead context card */}
          {message.leadContext && <LeadContextCard ctx={message.leadContext} />}
        </div>

        {/* Timestamp & read receipt */}
        <div className={cn('flex items-center gap-1 mt-0.5 px-1', isOwn ? 'justify-end' : 'justify-start')}>
          <span className={cn(
            'text-[9px]',
            isOwn ? 'text-primary/60' : 'text-muted-foreground/60'
          )}>
            {formatTime(message.timestamp)}
          </span>
          {isOwn && (
            message.read
              ? <CheckCheck className="h-3 w-3 text-primary/60" />
              : <Check className="h-3 w-3 text-primary/40" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function TeamChatWidget({ className }: TeamChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(DEFAULT_MESSAGES);
  const [teamMembersRef, setTeamMembersRef] = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS);
  const [input, setInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [typingUser, setTypingUser] = useState<TeamMember | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/chat')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.teamMembers) setTeamMembersRef(d.teamMembers);
        if (d.messages) setMessages(d.messages);
        if (d.currentUserId) {
          // Override CURRENT_USER_ID at runtime is not possible with const,
          // so we use a runtime ref instead
        }
        if (typeof d.unreadCount === 'number') setUnreadCount(d.unreadCount);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  const onlineMembers = teamMembersRef.filter((m) => m.online);
  const totalOnline = onlineMembers.length;

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  // Open panel
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setUnreadCount(0);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // Close panel
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setShowMentions(false);
    setTypingUser(null);
  }, []);

  // Send message
  const handleSend = useCallback(() => {
    if (!input.trim()) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: CURRENT_USER_ID,
      text: input.trim(),
      timestamp: new Date(),
      mentions: Array.from(input.match(/@(\w+)/g) || []).map((m) => m.slice(1).toLowerCase()),
      read: false,
    };

    setMessages((prev) => [...prev, newMsg].slice(-200));
    setInput('');
    setShowMentions(false);
    setMentionQuery('');
    scrollToBottom();
  }, [input, scrollToBottom]);

  // Key handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape' && showMentions) {
        setShowMentions(false);
      }
    },
    [handleSend, showMentions]
  );

  // Input change — detect @mentions
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }, []);

  // Select mention
  const handleSelectMention = useCallback(
    (member: TeamMember) => {
      const cursorPos = inputRef.current?.selectionStart || input.length;
      const textBeforeCursor = input.slice(0, cursorPos);
      const newTextBefore = textBeforeCursor.replace(/@\w*$/, `@${member.name} `);
      const newText = newTextBefore + input.slice(cursorPos);
      setInput(newText);
      setShowMentions(false);
      inputRef.current?.focus();
    },
    [input]
  );

  return (
    <>
      {/* ─── Floating Button ─── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={handleOpen}
            className={cn(
              'fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-[440]',
              'h-14 w-14 rounded-full bg-gradient-to-br from-primary via-primary to-primary/80',
              'text-primary-foreground shadow-lg shadow-primary/30',
              'hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95',
              'transition-all duration-200 flex items-center justify-center group',
              className
            )}
            aria-label="Open team chat"
          >
            <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-primary" />
            <MessageSquare className="h-6 w-6 relative z-10 group-hover:scale-110 transition-transform" />

            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 animate-in zoom-in duration-200">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Chat Panel ─── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop (mobile) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[439] lg:hidden"
              onClick={handleClose}
            />

            {/* Panel — slides in from left */}
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed z-[440] flex flex-col bg-background/95 backdrop-blur-xl border border-primary/10 shadow-2xl shadow-primary/10
                inset-y-0 left-0 w-[340px] sm:w-[384px]
                lg:bottom-6 lg:top-auto lg:left-6 lg:h-[500px] lg:inset-y-auto lg:rounded-2xl"
            >
              {/* ─── Header ─── */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Team Chat</h3>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[10px] text-muted-foreground">
                        {totalOnline} online
                      </p>
                      <span className="text-[10px] text-muted-foreground/40">· {teamMembersRef.length} members</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close team chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Online members bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/5 shrink-0">
                <div className="flex -space-x-1.5">
                  {teamMembersRef.map((m) => (
                    <div
                      key={m.id}
                      className="relative"
                      title={`${m.name} (${m.online ? 'online' : 'offline'})`}
                    >
                      <div
                        className={cn(
                          'h-6 w-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-background',
                          m.color,
                          !m.online && 'opacity-40'
                        )}
                      >
                        {m.avatar}
                      </div>
                      {m.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-background" />
                      )}
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground truncate">
                  {onlineMembers.map((m) => m.name).join(', ')} online
                </span>
              </div>

              {/* ─── Messages Area ─── */}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-7 w-7 text-primary" />
                    </div>
                    <p className="text-sm font-medium mb-1">Start a conversation</p>
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                      Start a conversation with your team about leads, deals, and pipeline updates.
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} teamMembersList={teamMembersRef} />
                ))}

                {/* Typing indicator */}
                {typingUser && <TypingIndicator member={typingUser} />}
              </div>

              {/* ─── Input Area ─── */}
              <div className="px-3 py-3 border-t border-primary/10 shrink-0">
                {/* Mention dropdown */}
                <div className="relative">
                  <AnimatePresence>
                    {showMentions && mentionQuery.length >= 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                      >
                        <MentionDropdown query={mentionQuery} onSelect={handleSelectMention} teamMembers={teamMembersRef} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-end gap-1.5">
                  <div className="flex gap-0.5 shrink-0 pb-1">
                    <button
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Attach file"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Insert emoji"
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message... (@ to mention)"
                      rows={1}
                      className="w-full resize-none rounded-full border border-primary/15 bg-muted/50 text-xs px-4 py-2.5 pr-10 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all min-h-[36px] max-h-[80px]"
                    />
                    {showMentions ? (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <AtSign className="h-3.5 w-3.5 text-primary" />
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={cn(
                      'shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200',
                      input.trim()
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                    aria-label="Send message"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
