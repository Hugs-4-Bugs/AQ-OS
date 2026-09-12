'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Calendar,
  Clock,
  X,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

/* ===== Types ===== */
export interface MeetingIntent {
  id: string;
  text: string;
  confidence: number;
  intentType: string;
  suggestedTitle?: string;
  suggestedType?: 'video' | 'phone' | 'in-person';
  leadId?: string;
  leadName?: string;
  sourceConversation?: string;
  detectedAt?: string;
}

interface MeetingIntentBannerProps {
  intents?: MeetingIntent[];
  onScheduleMeeting?: (intent: MeetingIntent) => void;
  onDismiss?: (intentId: string) => void;
  onRemindLater?: (intentId: string) => void;
  className?: string;
}

/* ===== Component ===== */
export default function MeetingIntentBanner({
  intents: propIntents,
  onScheduleMeeting,
  onDismiss,
  onRemindLater,
  className,
}: MeetingIntentBannerProps) {
  const [intents, setIntents] = useState<MeetingIntent[]>(propIntents || []);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch intents from API if not provided via props
  useEffect(() => {
    if (propIntents) {
      setIntents(propIntents);
      return;
    }
    let cancelled = false;
    const fetchIntents = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/meetings/detect-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ context: 'dashboard' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data.intents && data.intents.length > 0) {
            setIntents(data.intents);
          }
        }
      } catch {
        // Silently fail - intent detection is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchIntents();
    return () => { cancelled = true; };
  }, [propIntents]);

  // Update when props change
  useEffect(() => {
    if (propIntents) setIntents(propIntents);
  }, [propIntents]);

  const activeIntents = intents.filter(i => !dismissedIds.has(i.id));

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
    if (onDismiss) onDismiss(id);
  };

  const handleRemindLater = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
    if (onRemindLater) onRemindLater(id);
    toast.info('We\'ll remind you about this later');
  };

  const handleSchedule = (intent: MeetingIntent) => {
    if (onScheduleMeeting) onScheduleMeeting(intent);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
    if (confidence >= 0.5) return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
    return 'text-muted-foreground bg-muted/30 border-border/30';
  };

  const getIntentTypeLabel = (type: string) => {
    switch (type) {
      case 'schedule_call': return 'Schedule Call';
      case 'schedule_meeting': return 'Schedule Meeting';
      case 'schedule_demo': return 'Schedule Demo';
      case 'follow_up': return 'Follow-up Meeting';
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  if (activeIntents.length === 0 && !loading) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <AnimatePresence>
        {loading && activeIntents.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/30"
          >
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Checking for meeting intents...</span>
          </motion.div>
        )}

        {activeIntents.map((intent) => (
          <motion.div
            key={intent.id}
            initial={{ opacity: 0, y: -15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-xl border border-teal-500/20 bg-gradient-to-r from-teal-50/80 to-emerald-50/80 dark:from-teal-950/30 dark:to-emerald-950/30 shadow-sm"
          >
            {/* Animated accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />

            <div className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="shrink-0 w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center mt-0.5">
                  <Bell className="h-4 w-4 text-teal-600" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-teal-800 dark:text-teal-200">
                      Meeting Intent Detected
                    </span>
                    <Badge className={cn('text-[8px] border', getConfidenceColor(intent.confidence))}>
                      <Sparkles className="h-2 w-2 mr-0.5" />
                      {Math.round(intent.confidence * 100)}% confidence
                    </Badge>
                    <Badge className="text-[8px] bg-teal-500/10 text-teal-600 border-teal-500/20">
                      {getIntentTypeLabel(intent.intentType)}
                    </Badge>
                  </div>

                  {/* Original text */}
                  {intent.text && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2 italic">
                      &ldquo;{intent.text}&rdquo;
                    </p>
                  )}

                  {/* Lead and suggested info */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {intent.leadName && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Lead: </span>
                        <span className="text-[10px] font-medium">{intent.leadName}</span>
                      </div>
                    )}
                    {intent.suggestedTitle && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Suggested: </span>
                        <span className="text-[10px] font-medium">{intent.suggestedTitle}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      className="h-7 text-[10px] gap-1 bg-teal-600 hover:bg-teal-700"
                      onClick={() => handleSchedule(intent)}
                    >
                      <Calendar className="h-3 w-3" />
                      Schedule Meeting
                      <ArrowRight className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-muted-foreground"
                      onClick={() => handleRemindLater(intent.id)}
                    >
                      <Clock className="h-3 w-3 mr-0.5" />
                      Remind Later
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-muted-foreground"
                      onClick={() => handleDismiss(intent.id)}
                    >
                      <X className="h-3 w-3 mr-0.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={() => handleDismiss(intent.id)}
                  className="shrink-0 p-1 rounded-md hover:bg-teal-500/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
