'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  MessageSquare,
  Clock,
  ChevronRight,
  Send,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────

interface FeedbackListItem {
  id: string;
  ticketNumber: string;
  type: string;
  title: string;
  severity: string;
  status: string;
  aiSeverity: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  commentCount: number;
}

interface FeedbackComment {
  id: string;
  authorId: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface FeedbackStatusLog {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  note: string | null;
  createdAt: string;
}

interface FeedbackDetail extends FeedbackListItem {
  description: string;
  reproSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  pageUrl: string | null;
  browserName: string | null;
  osName: string | null;
  attachments: unknown;
  comments: FeedbackComment[];
  statusHistory: FeedbackStatusLog[];
}

// ─── Helpers ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  crash: 'Crash Report',
  feature: 'Feature Request',
  ui_ux: 'UI/UX Feedback',
  performance: 'Performance Issue',
  wrong_data: 'Wrong Data',
  sync: 'Sync Issue',
  account: 'Account Issue',
  payment: 'Payment Issue',
  other: 'Other',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  acknowledged: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  investigating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  in_progress: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  need_more_info: 'bg-red-500/15 text-red-400 border-red-500/30',
  fixed: 'bg-green-500/15 text-green-400 border-green-500/30',
  released: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  closed: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  rejected: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  duplicate: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ─── Page ──────────────────────────────────────────────────────────

export default function MyFeedbackPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackListItem[]>([]);
  const [selected, setSelected] = useState<FeedbackDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback');
      if (!res.ok) throw new Error('Failed to load feedback');
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await fetch(`/api/feedback/${id}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSelected(data.feedback);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitComment = async () => {
    if (!selected || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${selected.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add comment');
      }
      const data = await res.json();
      setSelected((prev) => (prev ? { ...prev, comments: data.comments } : prev));
      setCommentText('');
      toast.success('Comment added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const attachments = Array.isArray(selected?.attachments) ? (selected.attachments as Array<{ url?: string; name?: string; type?: string }>) : [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-teal-500" />
              My Feedback
            </h1>
            <p className="text-sm text-muted-foreground">
              Track the status of your bug reports and feature requests
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        ) : error ? (
          <Card className="border-red-500/30">
            <CardContent className="pt-6 flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5" />
              {error}
              <Button variant="outline" size="sm" onClick={loadList} className="ml-auto">
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : feedback.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Inbox className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">No feedback yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                When you submit feedback using the floating button, it will appear here so you can track its status.
              </p>
              <p className="text-xs text-muted-foreground">
                Look for the feedback button at the bottom-right of any page, or press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Shift+F</kbd>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {feedback.map((f) => (
              <button
                key={f.id}
                onClick={() => openDetail(f.id)}
                className="w-full text-left p-4 rounded-xl border border-border bg-card/50 hover:border-teal-500/50 hover:bg-teal-500/5 transition-all group"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm text-teal-400 font-medium">{f.ticketNumber}</span>
                  <Badge variant="outline" className={SEVERITY_STYLES[f.severity] || 'border-border'}>
                    {f.severity}
                  </Badge>
                  <Badge variant="outline" className={STATUS_STYLES[f.status] || 'border-border'}>
                    {f.status.replace(/_/g, ' ')}
                  </Badge>
                  {f.aiSeverity && (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                      AI: {f.aiSeverity}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(f.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {TYPE_LABELS[f.type] || f.type}
                  </Badge>
                  <span className="font-medium truncate group-hover:text-teal-400 transition-colors">
                    {f.title}
                  </span>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-teal-400" />
                </div>
                {f.commentCount > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    {f.commentCount} comment{f.commentCount !== 1 ? 's' : ''}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-muted-foreground">
          © 2026 AcquisitionOS — Feedback Intelligence System
        </div>
      </footer>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
          ) : selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap text-lg">
                  <span className="font-mono text-teal-400">{selected.ticketNumber}</span>
                  <Badge variant="outline" className={STATUS_STYLES[selected.status] || 'border-border'}>
                    {selected.status.replace(/_/g, ' ')}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{TYPE_LABELS[selected.type] || selected.type}</Badge>
                  <Badge variant="outline" className={SEVERITY_STYLES[selected.severity] || 'border-border'}>
                    Severity: {selected.severity}
                  </Badge>
                  {selected.aiSeverity && (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                      AI Severity: {selected.aiSeverity}
                    </Badge>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-lg">{selected.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{selected.description}</p>
                </div>

                {(selected.reproSteps || selected.expectedBehavior || selected.actualBehavior) && (
                  <div className="grid grid-cols-1 gap-3">
                    {selected.reproSteps && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Steps to reproduce</p>
                        <p className="text-sm whitespace-pre-wrap">{selected.reproSteps}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {selected.expectedBehavior && (
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Expected</p>
                          <p className="text-sm">{selected.expectedBehavior}</p>
                        </div>
                      )}
                      {selected.actualBehavior && (
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Actual</p>
                          <p className="text-sm">{selected.actualBehavior}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {attachments.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({attachments.length})</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-border overflow-hidden hover:border-teal-500/50">
                          {a.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt={a.name || 'attachment'} className="w-full h-20 object-cover" />
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center bg-muted text-xs">Video</div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {(selected.pageUrl || selected.browserName || selected.osName) && (
                  <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-1 font-mono">
                    {selected.pageUrl && <div><span className="text-muted-foreground">Page:</span> {selected.pageUrl}</div>}
                    {selected.browserName && <div><span className="text-muted-foreground">Browser:</span> {selected.browserName}</div>}
                    {selected.osName && <div><span className="text-muted-foreground">OS:</span> {selected.osName}</div>}
                  </div>
                )}

                {selected.statusHistory.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Status timeline</p>
                    <div className="space-y-2">
                      {selected.statusHistory.map((h) => (
                        <div key={h.id} className="flex items-start gap-2 text-xs">
                          <div className="h-2 w-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                          <div>
                            <span className="text-muted-foreground">{h.fromStatus}</span>
                            <span className="mx-1">{'->'}</span>
                            <Badge variant="outline" className={STATUS_STYLES[h.toStatus] || 'border-border'}>
                              {h.toStatus.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-muted-foreground ml-2">{timeAgo(h.createdAt)}</span>
                            {h.note && <p className="mt-0.5 text-foreground/80">{h.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Comments ({selected.comments.length})
                  </p>
                  {selected.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {selected.comments.map((c) => (
                        <div key={c.id} className={`rounded-lg p-3 ${c.authorRole === 'admin' ? 'bg-teal-500/5 border border-teal-500/20' : 'bg-muted/50'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {c.authorRole === 'admin' ? 'Admin' : 'You'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment or provide more details..."
                      className="min-h-[60px] resize-none"
                    />
                    <Button
                      onClick={submitComment}
                      disabled={!commentText.trim() || commentSubmitting}
                      className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                    >
                      {commentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
