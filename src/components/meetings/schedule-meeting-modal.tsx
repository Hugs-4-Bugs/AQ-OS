'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Users,
  X,
  Loader2,
  Search,
} from 'lucide-react';

interface LeadOption {
  id: string;
  businessName: string;
  ownerName: string | null;
  email: string | null;
}

interface Attendee {
  email: string;
  name?: string;
}

interface ScheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (meeting: Record<string, unknown>) => void;
  defaultLeadId?: string;
}

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

const MEETING_TYPES = [
  { value: 'video', label: 'Video Call', icon: Video },
  { value: 'phone', label: 'Phone Call', icon: Phone },
  { value: 'in-person', label: 'In Person', icon: MapPin },
];

export default function ScheduleMeetingModal({
  open,
  onOpenChange,
  onSuccess,
  defaultLeadId,
}: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState<string>(defaultLeadId || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30');
  const [timezone, setTimezone] = useState('UTC');
  const [meetingType, setMeetingType] = useState('video');
  const [platform, setPlatform] = useState('google_meet');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [attendeeName, setAttendeeName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lead search
  const [leadSearch, setLeadSearch] = useState('');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-detect timezone
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TIMEZONE_OPTIONS.some((tz) => tz.value === detected)) {
        setTimezone(detected);
      }
    } catch {
      // Keep UTC default
    }
  }, []);

  // Fetch leads for dropdown
  const fetchLeads = useCallback(async (query: string) => {
    if (query.length < 2) {
      setLeadOptions([]);
      return;
    }
    setLeadSearchLoading(true);
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(query)}&limit=10`);
      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      setLeadOptions(data.leads || []);
    } catch {
      setLeadOptions([]);
    } finally {
      setLeadSearchLoading(false);
    }
  }, []);

  // Debounced lead search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (leadSearch.length >= 2) {
        fetchLeads(leadSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearch, fetchLeads]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setLeadDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set default date to tomorrow
  useEffect(() => {
    if (open && !date) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split('T')[0]);
    }
  }, [open, date]);

  const addAttendee = () => {
    if (!attendeeEmail.trim()) return;
    if (attendees.some((a) => a.email.toLowerCase() === attendeeEmail.trim().toLowerCase())) return;
    setAttendees([...attendees, { email: attendeeEmail.trim(), name: attendeeName.trim() || undefined }]);
    setAttendeeEmail('');
    setAttendeeName('');
  };

  const removeAttendee = (email: string) => {
    setAttendees(attendees.filter((a) => a.email !== email));
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLeadId(defaultLeadId || '');
    setSelectedLead(defaultLeadId ? selectedLead : null);
    setDate('');
    setTime('10:00');
    setDuration('30');
    setMeetingType('video');
    setPlatform('google_meet');
    setAttendees([]);
    setAttendeeEmail('');
    setAttendeeName('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Meeting title is required');
      return;
    }
    if (!date || !time) {
      setError('Date and time are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const startDateTime = new Date(`${date}T${time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        meetingType,
        platform,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        durationMinutes: parseInt(duration),
        timezone,
        attendees: attendees.length > 0 ? attendees : undefined,
        leadId: leadId || undefined,
      };

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create meeting');
        return;
      }

      onSuccess?.(data.meeting);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Schedule Meeting
          </DialogTitle>
          <DialogDescription>
            Create a new meeting with Google Meet integration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Title *</Label>
            <Input
              id="meeting-title"
              placeholder="e.g., Discovery call with Acme Corp"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="meeting-desc">Description</Label>
            <Textarea
              id="meeting-desc"
              placeholder="Meeting description or agenda..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Lead Selector */}
          <div className="space-y-2">
            <Label>Link to Lead</Label>
            <div className="relative" ref={dropdownRef}>
              {selectedLead ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedLead.businessName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedLead.ownerName || selectedLead.email || 'No contact'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setLeadId('');
                      setSelectedLead(null);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search leads by name, email, or business..."
                    value={leadSearch}
                    onChange={(e) => {
                      setLeadSearch(e.target.value);
                      setLeadDropdownOpen(true);
                    }}
                    onFocus={() => setLeadDropdownOpen(true)}
                    className="pl-8"
                  />
                  {leadSearchLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {leadDropdownOpen && leadOptions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {leadOptions.map((lead) => (
                        <button
                          key={lead.id}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 transition-colors"
                          onClick={() => {
                            setLeadId(lead.id);
                            setSelectedLead(lead);
                            setLeadDropdownOpen(false);
                            setLeadSearch('');
                          }}
                        >
                          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{lead.businessName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.ownerName || lead.email || 'No contact'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-date">Date *</Label>
              <Input
                id="meeting-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-time">Time *</Label>
              <Input
                id="meeting-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration & Timezone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Meeting Type */}
          <div className="space-y-2">
            <Label>Meeting Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {MEETING_TYPES.map((type) => {
                const Icon = type.icon;
                const isActive = meetingType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setMeetingType(type.value);
                      if (type.value === 'video') setPlatform('google_meet');
                    }}
                    className={`flex items-center gap-2 p-3 border rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-600'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform (only for video) */}
          {meetingType === 'video' && (
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full">
                  <Video className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Attendees */}
          <div className="space-y-2">
            <Label>Attendees</Label>
            <div className="space-y-2">
              {attendees.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attendees.map((a) => (
                    <Badge key={a.email} variant="secondary" className="py-1 px-2.5 gap-1.5">
                      <span className="text-xs">{a.name || a.email}</span>
                      {a.name && a.email && (
                        <span className="text-xs text-muted-foreground">{a.email}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttendee(a.email)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Email"
                  type="email"
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                  className="flex-1"
                />
                <Input
                  placeholder="Name (optional)"
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAttendee}
                  disabled={!attendeeEmail.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { resetForm(); onOpenChange(false); }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !date || !time}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Meeting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
