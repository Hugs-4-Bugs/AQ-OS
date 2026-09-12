'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  CalendarDays,
} from 'lucide-react';

interface FollowUpAction {
  title: string;
  assignee: string;
  dueDate: string;
}

interface CompleteMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string | null;
  meetingTitle: string;
  onSuccess?: (meeting: Record<string, unknown>) => void;
}

export default function CompleteMeetingModal({
  open,
  onOpenChange,
  meetingId,
  meetingTitle,
  onSuccess,
}: CompleteMeetingModalProps) {
  const [notes, setNotes] = useState('');
  const [followUpActions, setFollowUpActions] = useState<FollowUpAction[]>([
    { title: '', assignee: '', dueDate: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setNotes('');
    setFollowUpActions([{ title: '', assignee: '', dueDate: '' }]);
    setError(null);
  };

  const addAction = () => {
    setFollowUpActions([...followUpActions, { title: '', assignee: '', dueDate: '' }]);
  };

  const removeAction = (index: number) => {
    if (followUpActions.length <= 1) return;
    setFollowUpActions(followUpActions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, field: keyof FollowUpAction, value: string) => {
    const updated = [...followUpActions];
    updated[index] = { ...updated[index], [field]: value };
    setFollowUpActions(updated);
  };

  const handleSubmit = async () => {
    if (!meetingId) return;

    setSubmitting(true);
    setError(null);

    try {
      const validActions = followUpActions
        .filter((a) => a.title.trim())
        .map((a) => JSON.stringify({ title: a.title.trim(), assignee: a.assignee.trim() || undefined, dueDate: a.dueDate || undefined }));

      const res = await fetch(`/api/meetings/${meetingId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.trim() || undefined,
          followUpActions: validActions.length > 0 ? validActions : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to complete meeting');
        return;
      }

      resetForm();
      onSuccess?.(data.meeting);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete meeting');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Complete Meeting
          </DialogTitle>
          <DialogDescription>
            {meetingTitle ? `Mark "${meetingTitle}" as completed and add notes` : 'Mark meeting as completed'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Post-Meeting Notes */}
          <div className="space-y-2">
            <Label htmlFor="meeting-notes" className="flex items-center gap-1.5">
              Post-Meeting Notes
            </Label>
            <Textarea
              id="meeting-notes"
              placeholder="What was discussed? Key decisions? Next steps..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>

          {/* Follow-up Actions */}
          <div className="space-y-3">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">Follow-up Actions</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
                onClick={addAction}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Action
              </Button>
            </Label>
            <div className="space-y-3">
              {followUpActions.map((action, index) => (
                <div key={index} className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-muted-foreground mt-2">{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Action item title..."
                        value={action.title}
                        onChange={(e) => updateAction(index, 'title', e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Assignee (optional)"
                          value={action.assignee}
                          onChange={(e) => updateAction(index, 'assignee', e.target.value)}
                        />
                        <div className="relative">
                          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            type="date"
                            placeholder="Due date"
                            value={action.dueDate}
                            onChange={(e) => updateAction(index, 'dueDate', e.target.value)}
                            className="pl-8"
                          />
                        </div>
                      </div>
                    </div>
                    {followUpActions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-1"
                        onClick={() => removeAction(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Completing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Meeting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
