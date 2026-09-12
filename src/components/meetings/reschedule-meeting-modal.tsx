'use client';

import React, { useState, useEffect } from 'react';
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
  Calendar,
  Clock,
  Loader2,
} from 'lucide-react';

interface MeetingData {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  timezone: string;
  status: string;
}

interface RescheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingData | null;
  onSuccess?: (meeting: Record<string, unknown>) => void;
}

export default function RescheduleMeetingModal({
  open,
  onOpenChange,
  meeting,
  onSuccess,
}: RescheduleMeetingModalProps) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meeting && open) {
      const start = new Date(meeting.startDateTime);
      setNewDate(start.toISOString().split('T')[0]);
      setNewTime(
        start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      );
      setReason('');
      setError(null);
    }
  }, [meeting, open]);

  const handleSubmit = async () => {
    if (!meeting) return;
    if (!newDate || !newTime) {
      setError('Date and time are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const startDateTime = new Date(`${newDate}T${newTime}:00`);
      const endDateTime = new Date(
        startDateTime.getTime() + meeting.durationMinutes * 60000
      );

      const res = await fetch(`/api/meetings/${meeting.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reschedule meeting');
        return;
      }

      onSuccess?.(data.meeting);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule meeting');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrentDateTime = () => {
    if (!meeting) return '';
    const start = new Date(meeting.startDateTime);
    return start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Reschedule Meeting
          </DialogTitle>
          <DialogDescription>
            Pick a new date and time for this meeting
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Current meeting info */}
          {meeting && (
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
              <p className="text-sm font-medium">{meeting.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Currently: {formatCurrentDateTime()}
              </p>
              <p className="text-xs text-muted-foreground">
                Duration: {meeting.durationMinutes} min
              </p>
            </div>
          )}

          {/* New Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">New Date *</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reschedule-time">New Time *</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reschedule-reason">Reason (optional)</Label>
            <Textarea
              id="reschedule-reason"
              placeholder="Why is this meeting being rescheduled?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !newDate || !newTime}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rescheduling...
              </>
            ) : (
              'Confirm Reschedule'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
