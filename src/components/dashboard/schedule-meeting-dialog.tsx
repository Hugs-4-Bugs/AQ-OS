'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Video,
  Phone,
  Users,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Sparkles,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

/* ===== Types ===== */
type MeetingType = 'video' | 'phone' | 'in-person';
type MeetingPlatform = 'google-meet' | 'zoom' | 'teams' | 'custom';

interface AttendeeInput {
  email: string;
  name: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface SuggestedSlot {
  date: string;
  startTime: string;
  endTime: string;
  score: number;
  reason: string;
}

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMeetingCreated?: (meeting: Record<string, unknown>) => void;
  prefill?: {
    title?: string;
    description?: string;
    type?: MeetingType;
    attendees?: AttendeeInput[];
    leadId?: string;
    leadName?: string;
    dealId?: string;
  };
}

const STEPS = [
  { id: 1, label: 'Details', icon: Video },
  { id: 2, label: 'Schedule', icon: Calendar },
  { id: 3, label: 'Attendees', icon: Users },
  { id: 4, label: 'Agenda', icon: Clock },
  { id: 5, label: 'Review', icon: Check },
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

/* ===== Component ===== */
export default function ScheduleMeetingDialog({
  open,
  onOpenChange,
  onMeetingCreated,
  prefill,
}: ScheduleMeetingDialogProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<Record<string, unknown> | null>(null);

  // Step 1: Meeting Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('video');
  const [platform, setPlatform] = useState<MeetingPlatform>('google-meet');
  const [customLink, setCustomLink] = useState('');
  const [duration, setDuration] = useState(30);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  );

  // Step 2: Schedule
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [suggestingSlots, setSuggestingSlots] = useState(false);

  // Step 3: Attendees
  const [attendees, setAttendees] = useState<AttendeeInput[]>([]);
  const [newAttendeeEmail, setNewAttendeeEmail] = useState('');
  const [newAttendeeName, setNewAttendeeName] = useState('');
  const [linkedLeadId, setLinkedLeadId] = useState('');
  const [linkedLeadName, setLinkedLeadName] = useState('');
  const [linkedDealId, setLinkedDealId] = useState('');
  const [leadSearchResults, setLeadSearchResults] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);

  // Step 4: Agenda
  const [agendaItems, setAgendaItems] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');

  // Step 5: Review
  const [sendConfirmation, setSendConfirmation] = useState(true);

  // Prefill from props
  useEffect(() => {
    if (prefill) {
      if (prefill.title) setTitle(prefill.title);
      if (prefill.description) setDescription(prefill.description);
      if (prefill.type) setMeetingType(prefill.type);
      if (prefill.attendees) setAttendees(prefill.attendees);
      if (prefill.leadId) setLinkedLeadId(prefill.leadId);
      if (prefill.leadName) setLinkedLeadName(prefill.leadName);
      if (prefill.dealId) setLinkedDealId(prefill.dealId);
    }
  }, [prefill]);

  // Reset on close
  const resetForm = useCallback(() => {
    setStep(1);
    setTitle('');
    setDescription('');
    setMeetingType('video');
    setPlatform('google-meet');
    setCustomLink('');
    setDuration(30);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
    setSelectedDate('');
    setSelectedTime('');
    setTimeSlots([]);
    setSuggestedSlots([]);
    setAttendees([]);
    setNewAttendeeEmail('');
    setNewAttendeeName('');
    setLinkedLeadId('');
    setLinkedLeadName('');
    setLinkedDealId('');
    setAgendaItems(['']);
    setNotes('');
    setSendConfirmation(true);
    setIsSubmitting(false);
    setCreatedMeeting(null);
  }, []);

  // Generate time slots for selected date
  useEffect(() => {
    let cancelled = false;
    if (!selectedDate) {
      setTimeSlots([]);
      return;
    }
    const fetchSlots = async () => {
      setSlotsLoading(true);
      try {
        const res = await fetch('/api/meetings/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ date: selectedDate, timezone, duration }),
        });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data.slots) {
            setTimeSlots(data.slots);
          } else {
            // Fallback: generate default 30-min slots
            generateDefaultSlots();
          }
        } else {
          generateDefaultSlots();
        }
      } catch {
        generateDefaultSlots();
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };
    fetchSlots();
    return () => { cancelled = true; };
  }, [selectedDate, timezone, duration]);

  const generateDefaultSlots = () => {
    const slots: TimeSlot[] = [];
    for (let h = 8; h <= 18; h++) {
      for (const m of ['00', '30']) {
        const hour12 = h > 12 ? h - 12 : h;
        const ampm = h >= 12 ? 'PM' : 'AM';
        slots.push({
          time: `${hour12}:${m} ${ampm}`,
          available: true,
        });
      }
    }
    setTimeSlots(slots);
  };

  // Suggest AI times
  const handleSuggestTimes = async () => {
    setSuggestingSlots(true);
    try {
      const res = await fetch('/api/meetings/suggest-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ duration, timezone, attendees: attendees.map(a => a.email) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          setSuggestedSlots(data.suggestions);
          toast.success('AI suggested optimal meeting times');
        } else {
          toast.info('No suggestions available. Please select manually.');
        }
      } else {
        toast.error('Failed to get suggestions');
      }
    } catch {
      toast.error('Failed to get suggestions');
    } finally {
      setSuggestingSlots(false);
    }
  };

  // Search leads
  const handleLeadSearch = async (query: string) => {
    if (query.length < 2) {
      setLeadSearchResults([]);
      return;
    }
    setLeadSearchLoading(true);
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(query)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLeadSearchResults((data.leads || data || []).slice(0, 5));
      }
    } catch {
      setLeadSearchResults([]);
    } finally {
      setLeadSearchLoading(false);
    }
  };

  // Add attendee
  const addAttendee = () => {
    if (!newAttendeeEmail.trim()) return;
    if (!newAttendeeEmail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    setAttendees(prev => [...prev, { email: newAttendeeEmail.trim(), name: newAttendeeName.trim() }]);
    setNewAttendeeEmail('');
    setNewAttendeeName('');
  };

  // Remove attendee
  const removeAttendee = (index: number) => {
    setAttendees(prev => prev.filter((_, i) => i !== index));
  };

  // Update agenda item
  const updateAgendaItem = (index: number, value: string) => {
    setAgendaItems(prev => prev.map((item, i) => (i === index ? value : item)));
  };

  // Add agenda item
  const addAgendaItem = () => {
    setAgendaItems(prev => [...prev, '']);
  };

  // Remove agenda item
  const removeAgendaItem = (index: number) => {
    if (agendaItems.length <= 1) return;
    setAgendaItems(prev => prev.filter((_, i) => i !== index));
  };

  // Submit meeting
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const meetingData = {
        title,
        description,
        type: meetingType,
        platform: meetingType === 'video' ? platform : undefined,
        customLink: meetingType === 'video' && platform === 'custom' ? customLink : undefined,
        duration,
        timezone,
        date: selectedDate,
        startTime: selectedTime,
        attendees: attendees.map(a => ({ email: a.email, name: a.name })),
        leadId: linkedLeadId || undefined,
        dealId: linkedDealId || undefined,
        agenda: agendaItems.filter(a => a.trim()),
        notes,
        sendConfirmation,
      };

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(meetingData),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedMeeting(data.meeting || data);
        toast.success('Meeting scheduled successfully!');
        if (onMeetingCreated) onMeetingCreated(data.meeting || data);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to schedule meeting');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy Google Meet link
  const copyMeetLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success('Meeting link copied to clipboard');
  };

  // Validation
  const canProceed = () => {
    switch (step) {
      case 1:
        return title.trim().length > 0;
      case 2:
        return selectedDate.length > 0 && selectedTime.length > 0;
      case 3:
        return true; // Attendees are optional
      case 4:
        return true; // Agenda is optional
      case 5:
        return true;
      default:
        return false;
    }
  };

  // Get platform display name
  const getPlatformName = (p: MeetingPlatform) => {
    switch (p) {
      case 'google-meet': return 'Google Meet';
      case 'zoom': return 'Zoom';
      case 'teams': return 'Microsoft Teams';
      case 'custom': return 'Custom Link';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
              <Calendar className="h-4 w-4" />
            </div>
            {createdMeeting ? 'Meeting Scheduled!' : 'Schedule Meeting'}
          </DialogTitle>
          <DialogDescription>
            {createdMeeting ? 'Your meeting has been created successfully' : 'Set up a new meeting with your leads and team'}
          </DialogDescription>
        </DialogHeader>

        {/* Success State */}
        {createdMeeting ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-6 space-y-4"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold">Meeting Created!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {title} has been scheduled for {selectedDate} at {selectedTime}
              </p>
            </div>

            {createdMeeting.meetLink && (
              <Card className="p-4 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-teal-600" />
                    <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
                      Google Meet Link
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-teal-600"
                      onClick={() => copyMeetLink(createdMeeting.meetLink as string)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-teal-600"
                      onClick={() => window.open(createdMeeting.meetLink as string, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-1 font-mono break-all">
                  {createdMeeting.meetLink as string}
                </p>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { resetForm(); onOpenChange(false); }}>
                Close
              </Button>
              {createdMeeting.meetLink && (
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={() => window.open(createdMeeting.meetLink as string, '_blank')}
                >
                  <Video className="h-3.5 w-3.5 mr-1.5" />
                  Join Meeting
                </Button>
              )}
            </div>
          </motion.div>
        ) : (
          <>
            {/* Progress Indicator */}
            <div className="flex items-center gap-1 mb-4">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = step === s.id;
                const isCompleted = step > s.id;
                return (
                  <React.Fragment key={s.id}>
                    <button
                      onClick={() => { if (isCompleted) setStep(s.id); }}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                        isActive
                          ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20'
                          : isCompleted
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 cursor-pointer'
                            : 'text-muted-foreground border border-transparent'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className={cn('h-px flex-1', step > s.id ? 'bg-emerald-400' : 'bg-border')} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {/* Step 1: Meeting Details */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Meeting Title *</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Discovery Call with Client"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the meeting purpose..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Meeting Type</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { type: 'video' as const, label: 'Video', icon: Video, desc: 'Online call' },
                        { type: 'phone' as const, label: 'Phone', icon: Phone, desc: 'Audio only' },
                        { type: 'in-person' as const, label: 'In-Person', icon: MapPin, desc: 'Face-to-face' },
                      ]).map((opt) => {
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.type}
                            onClick={() => setMeetingType(opt.type)}
                            className={cn(
                              'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center',
                              meetingType === opt.type
                                ? 'bg-teal-500/10 border-teal-500/30 text-teal-600'
                                : 'border-border/40 hover:border-border/60 text-muted-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-xs font-medium">{opt.label}</span>
                            <span className="text-[9px] opacity-70">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {meetingType === 'video' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Platform</Label>
                      <Select value={platform} onValueChange={(v) => setPlatform(v as MeetingPlatform)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google-meet">Google Meet</SelectItem>
                          <SelectItem value="zoom">Zoom</SelectItem>
                          <SelectItem value="teams">Microsoft Teams</SelectItem>
                          <SelectItem value="custom">Custom Link</SelectItem>
                        </SelectContent>
                      </Select>
                      {platform === 'custom' && (
                        <Input
                          value={customLink}
                          onChange={(e) => setCustomLink(e.target.value)}
                          placeholder="https://meet.example.com/..."
                          className="h-9 mt-2"
                        />
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Duration</Label>
                      <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="45">45 minutes</SelectItem>
                          <SelectItem value="60">60 minutes</SelectItem>
                          <SelectItem value="90">90 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Schedule */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Date</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                      className="h-9"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>

                  {/* AI Suggest Button */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Time Slot</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={handleSuggestTimes}
                      disabled={suggestingSlots}
                    >
                      {suggestingSlots ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Suggest Times
                    </Button>
                  </div>

                  {/* Suggested Slots */}
                  {suggestedSlots.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">AI Suggested</p>
                      <div className="grid grid-cols-1 gap-2">
                        {suggestedSlots.map((slot, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedDate(slot.date);
                              setSelectedTime(slot.startTime);
                            }}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border transition-all text-left',
                              selectedDate === slot.date && selectedTime === slot.startTime
                                ? 'bg-teal-500/10 border-teal-500/30'
                                : 'border-border/40 hover:border-border/60'
                            )}
                          >
                            <div>
                              <p className="text-xs font-medium">{slot.date} · {slot.startTime} - {slot.endTime}</p>
                              <p className="text-[10px] text-muted-foreground">{slot.reason}</p>
                            </div>
                            <Badge className="text-[8px] bg-teal-500/10 text-teal-600 border-teal-500/20">
                              {Math.round(slot.score * 100)}% match
                            </Badge>
                          </button>
                        ))}
                      </div>
                      <Separator />
                    </div>
                  )}

                  {/* Time Slots Grid */}
                  {selectedDate && (
                    <>
                      {slotsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                          {timeSlots.map((slot) => (
                            <button
                              key={slot.time}
                              onClick={() => slot.available && setSelectedTime(slot.time)}
                              disabled={!slot.available}
                              className={cn(
                                'px-2 py-2 rounded-lg text-[11px] font-medium transition-all border',
                                selectedTime === slot.time
                                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-600'
                                  : slot.available
                                    ? 'border-border/30 hover:border-border/50 text-foreground'
                                    : 'bg-muted/30 text-muted-foreground/40 border-transparent cursor-not-allowed'
                              )}
                            >
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {!selectedDate && (
                    <div className="flex flex-col items-center py-6 text-muted-foreground">
                      <Calendar className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-xs">Select a date to see available time slots</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step 3: Attendees */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Add Attendee */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Add Attendees</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newAttendeeName}
                        onChange={(e) => setNewAttendeeName(e.target.value)}
                        placeholder="Name"
                        className="h-9 flex-1"
                      />
                      <Input
                        value={newAttendeeEmail}
                        onChange={(e) => setNewAttendeeEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="h-9 flex-1"
                        onKeyDown={(e) => { if (e.key === 'Enter') addAttendee(); }}
                      />
                      <Button size="sm" className="h-9 px-3 bg-teal-600 hover:bg-teal-700" onClick={addAttendee}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Attendee List */}
                  {attendees.length > 0 && (
                    <div className="space-y-2">
                      {attendees.map((att, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/20">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-teal-500/10 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-teal-600">
                                {(att.name || att.email).slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-medium">{att.name || att.email.split('@')[0]}</p>
                              <p className="text-[10px] text-muted-foreground">{att.email}</p>
                            </div>
                          </div>
                          <button onClick={() => removeAttendee(i)} className="p-1 rounded hover:bg-muted/50">
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Link Lead */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Link to Lead</Label>
                    {linkedLeadName ? (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <div className="flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{linkedLeadName}</span>
                        </div>
                        <button onClick={() => { setLinkedLeadId(''); setLinkedLeadName(''); }} className="p-1 rounded hover:bg-muted/50">
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Input
                          placeholder="Search leads..."
                          className="h-9"
                          onChange={(e) => handleLeadSearch(e.target.value)}
                        />
                        {leadSearchLoading && (
                          <div className="flex items-center gap-2 py-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-xs text-muted-foreground">Searching...</span>
                          </div>
                        )}
                        {leadSearchResults.length > 0 && (
                          <div className="space-y-1 border rounded-lg overflow-hidden">
                            {leadSearchResults.map((lead) => (
                              <button
                                key={lead.id}
                                onClick={() => {
                                  setLinkedLeadId(lead.id);
                                  setLinkedLeadName(lead.name);
                                  setLeadSearchResults([]);
                                }}
                                className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/30 transition-colors"
                              >
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                  <span className="text-[9px] font-bold">{lead.name.slice(0, 2).toUpperCase()}</span>
                                </div>
                                <div>
                                  <p className="text-xs font-medium">{lead.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{lead.email}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Link Deal */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Link to Deal (Optional)</Label>
                    <Input
                      value={linkedDealId}
                      onChange={(e) => setLinkedDealId(e.target.value)}
                      placeholder="Deal ID or name"
                      className="h-9"
                    />
                  </div>
                </motion.div>
              )}

              {/* Step 4: Agenda */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Agenda Items</Label>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addAgendaItem}>
                        <Plus className="h-3 w-3" /> Add Item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {agendaItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{i + 1}.</span>
                          <Input
                            value={item}
                            onChange={(e) => updateAgendaItem(i, e.target.value)}
                            placeholder={`Agenda item ${i + 1}`}
                            className="h-9 flex-1"
                          />
                          {agendaItems.length > 1 && (
                            <button onClick={() => removeAgendaItem(i)} className="p-1 rounded hover:bg-muted/50 shrink-0">
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes or preparation reminders..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>
                </motion.div>
              )}

              {/* Step 5: Review & Confirm */}
              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{title}</h4>
                      <Badge className={cn(
                        'text-[8px] border',
                        meetingType === 'video' ? 'bg-teal-500/10 text-teal-600 border-teal-500/20' :
                        meetingType === 'phone' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                        'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      )}>
                        {meetingType === 'video' ? <Video className="h-2.5 w-2.5 mr-0.5" /> :
                         meetingType === 'phone' ? <Phone className="h-2.5 w-2.5 mr-0.5" /> :
                         <MapPin className="h-2.5 w-2.5 mr-0.5" />}
                        {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}
                      </Badge>
                    </div>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}

                    <Separator />

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Date</p>
                        <p className="text-xs font-medium">{selectedDate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</p>
                        <p className="text-xs font-medium">{selectedTime} ({duration} min)</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Platform</p>
                        <p className="text-xs font-medium">
                          {meetingType === 'video' ? getPlatformName(platform) : meetingType === 'phone' ? 'Phone Call' : 'In-Person'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Timezone</p>
                        <p className="text-xs font-medium">{timezone.replace('_', ' ')}</p>
                      </div>
                    </div>

                    {attendees.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Attendees ({attendees.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {attendees.map((att, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {att.name || att.email.split('@')[0]}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {linkedLeadName && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Linked Lead</p>
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/5 border-emerald-500/20 text-emerald-600">
                          {linkedLeadName}
                        </Badge>
                      </div>
                    )}

                    {agendaItems.filter(a => a.trim()).length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Agenda</p>
                          <ol className="space-y-1">
                            {agendaItems.filter(a => a.trim()).map((item, i) => (
                              <li key={i} className="text-xs flex items-start gap-1.5">
                                <span className="text-muted-foreground font-mono shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Google Meet Link Preview */}
                  {meetingType === 'video' && platform === 'google-meet' && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                      <Video className="h-4 w-4 text-teal-600 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-teal-800 dark:text-teal-200">Google Meet link will be generated</p>
                        <p className="text-[10px] text-teal-600 dark:text-teal-400">Link will appear after scheduling</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} />
                      <Label className="text-xs">Send confirmation to attendees</Label>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { resetForm(); onOpenChange(false); }}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(step - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Back
                  </Button>
                )}
                {step < 5 ? (
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceed()}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !canProceed()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Scheduling...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Schedule Meeting
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
