'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Bug,
  Zap,
  Sparkles,
  Palette,
  Activity,
  BarChart3,
  RefreshCw,
  User,
  CreditCard,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileImage,
  FileVideo,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Monitor,
  ChevronDown,
  Send,
} from 'lucide-react';
import { getCapturedContext } from '@/lib/feedback/auto-capture';

// ─── Types ─────────────────────────────────────────────────────────

type FeedbackType =
  | 'bug'
  | 'crash'
  | 'feature'
  | 'ui_ux'
  | 'performance'
  | 'wrong_data'
  | 'sync'
  | 'account'
  | 'payment'
  | 'other';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface Category {
  id: FeedbackType;
  label: string;
  icon: React.ReactNode;
  emoji: string;
  showSeverity: boolean;
}

interface UploadedFile {
  url: string;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ─────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  { id: 'bug', label: 'Bug Report', icon: <Bug className="h-5 w-5" />, emoji: '🐛', showSeverity: true },
  { id: 'crash', label: 'Crash Report', icon: <Zap className="h-5 w-5" />, emoji: '💥', showSeverity: true },
  { id: 'feature', label: 'Feature Request', icon: <Sparkles className="h-5 w-5" />, emoji: '✨', showSeverity: false },
  { id: 'ui_ux', label: 'UI/UX Feedback', icon: <Palette className="h-5 w-5" />, emoji: '🎨', showSeverity: false },
  { id: 'performance', label: 'Performance Issue', icon: <Activity className="h-5 w-5" />, emoji: '⚡', showSeverity: true },
  { id: 'wrong_data', label: 'Wrong Data', icon: <BarChart3 className="h-5 w-5" />, emoji: '📊', showSeverity: true },
  { id: 'sync', label: 'Sync Issue', icon: <RefreshCw className="h-5 w-5" />, emoji: '🔄', showSeverity: true },
  { id: 'account', label: 'Account Issue', icon: <User className="h-5 w-5" />, emoji: '👤', showSeverity: false },
  { id: 'payment', label: 'Payment Issue', icon: <CreditCard className="h-5 w-5" />, emoji: '💳', showSeverity: true },
  { id: 'other', label: 'Other', icon: <MessageSquare className="h-5 w-5" />, emoji: '💬', showSeverity: false },
];

const SEVERITIES: { id: Severity; label: string; color: string; ring: string }[] = [
  { id: 'low', label: 'Low', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', ring: 'ring-slate-500/40' },
  { id: 'medium', label: 'Medium', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', ring: 'ring-yellow-500/40' },
  { id: 'high', label: 'High', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', ring: 'ring-orange-500/40' },
  { id: 'critical', label: 'Critical', color: 'bg-red-500/15 text-red-400 border-red-500/30', ring: 'ring-red-500/40' },
];

const MAX_TITLE = 100;
const MAX_FILES = 5;
// FIX (2026-09-09): Aligned with the server-side limit in
// /api/feedback/upload (was 5MB, now 8MB so short screen recordings fit).
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

const PLACEHOLDER_BY_TYPE: Record<FeedbackType, string> = {
  bug: 'What happened? Steps to reproduce? What did you expect?',
  crash: 'What were you doing when the crash occurred? Any error message?',
  feature: 'Describe the feature and why it would help you',
  ui_ux: 'What could be improved about the interface? How would you change it?',
  performance: 'What was slow? When did it happen? How long did it take?',
  wrong_data: 'What data looked wrong? Where did you see it? What should it be?',
  sync: 'What failed to sync? Between which devices or services?',
  account: 'What account issue are you experiencing?',
  payment: 'What payment problem occurred? (Never include card numbers)',
  other: 'Please describe in detail',
};

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

// ─── Component ─────────────────────────────────────────────────────

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [description, setDescription] = useState('');
  const [reproSteps, setReproSteps] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [screenshots, setScreenshots] = useState<UploadedFile[]>([]);
  const [video, setVideo] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [techInfoOpen, setTechInfoOpen] = useState(false);
  const [capturedContext, setCapturedContext] = useState<ReturnType<typeof getCapturedContext> | null>(null);

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Capture context when modal opens
  useEffect(() => {
    if (open) {
      try {
        setCapturedContext(getCapturedContext());
      } catch {
        setCapturedContext(null);
      }
    }
  }, [open]);

  // Reset on close
  const resetForm = useCallback(() => {
    setStep(1);
    setType(null);
    setTitle('');
    setSeverity('medium');
    setDescription('');
    setReproSteps('');
    setExpectedBehavior('');
    setActualBehavior('');
    setScreenshots([]);
    setVideo(null);
    setUploading(false);
    setSubmitting(false);
    setError(null);
    setTechInfoOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      // small delay so the close animation doesn't show the reset
      const t = setTimeout(resetForm, 300);
      return () => clearTimeout(t);
    }
  }, [open, resetForm]);

  // Keyboard: Esc handled by Dialog. Enter on step 1 category click handled by onClick.
  const canProceedStep2 = type !== null;
  const canSubmit = title.trim().length > 0 && description.trim().length >= 10;

  const handleSelectCategory = (cat: FeedbackType) => {
    setType(cat);
    setStep(2);
  };

  const handleScreenshotSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_FILES - screenshots.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      toast.warning(`Maximum ${MAX_FILES} screenshots allowed`);
      return;
    }
    await uploadFiles(toUpload, 'image');
  };

  const handleVideoSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (video) {
      toast.warning('Only one video allowed. Remove the existing one first.');
      return;
    }
    const file = files[0];
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Video exceeds 8MB limit');
      return;
    }
    await uploadFiles([file], 'video');
  };

  const uploadFiles = async (files: File[], kind: 'image' | 'video') => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);

      const res = await fetch('/api/feedback/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const data = (await res.json()) as { urls: string[] };
      const uploaded: UploadedFile[] = files.map((f, i) => ({
        url: data.urls[i],
        name: f.name,
        size: f.size,
        type: f.type,
        preview: f.type.startsWith('image/') ? data.urls[i] : undefined,
      }));

      if (kind === 'image') {
        setScreenshots((prev) => [...prev, ...uploaded].slice(0, MAX_FILES));
      } else {
        setVideo(uploaded[0] || null);
      }
      toast.success(`${uploaded.length} file(s) uploaded`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };
  const removeVideo = () => setVideo(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    handleScreenshotSelect(files);
  };

  const handleSubmit = async () => {
    if (!type || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const attachments = [
        ...screenshots.map((s) => ({ url: s.url, name: s.name, type: 'image', size: s.size })),
        ...(video ? [{ url: video.url, name: video.name, type: 'video', size: video.size }] : []),
      ];

      const payload: Record<string, unknown> = {
        type,
        title: title.trim(),
        description: description.trim(),
        severity,
        reproSteps: reproSteps.trim() || undefined,
        expectedBehavior: expectedBehavior.trim() || undefined,
        actualBehavior: actualBehavior.trim() || undefined,
        attachments,
      };

      // Attach auto-captured context
      if (capturedContext) {
        payload.pageUrl = capturedContext.pageUrl;
        payload.previousPageUrl = capturedContext.previousPageUrl;
        payload.navigationHistory = capturedContext.navigationHistory;
        payload.userAgent = capturedContext.userAgent;
        payload.browserName = capturedContext.browserName;
        payload.browserVersion = capturedContext.browserVersion;
        payload.osName = capturedContext.osName;
        payload.osVersion = capturedContext.osVersion;
        payload.screenResolution = capturedContext.screenResolution;
        payload.timezone = capturedContext.timezone;
        payload.locale = capturedContext.locale;
        payload.networkType = capturedContext.networkType;
        payload.appVersion = capturedContext.appVersion;
        payload.sessionId = capturedContext.sessionId;
        payload.lastApiRequests = capturedContext.lastApiRequests;
        payload.errorLogs = capturedContext.errorLogs;
        payload.performanceData = capturedContext.performanceData;
      }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }

      const data = (await res.json()) as { ticketNumber: string };
      toast.success(`Feedback submitted! Ticket: ${data.ticketNumber}`, {
        duration: 6000,
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stepProgress = (step / 3) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="h-5 w-5 text-teal-500" />
            {step === 1 && 'Share Feedback'}
            {step === 2 && 'Tell Us More'}
            {step === 3 && 'Add Attachments'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 1 && 'Choose a category to help us route your feedback correctly'}
            {step === 2 && 'Provide details so we can reproduce or understand the issue'}
            {step === 3 && 'Attach screenshots or a screen recording (optional)'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                  s < step
                    ? 'bg-teal-500 text-white'
                    : s === step
                      ? 'bg-teal-500/20 text-teal-400 ring-2 ring-teal-500/40'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`h-0.5 flex-1 rounded ${s < step ? 'bg-teal-500' : 'bg-muted'}`} />}
            </React.Fragment>
          ))}
          <div className="ml-auto text-xs text-muted-foreground">
            Step {step} of 3
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto shrink-0 hover:text-red-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ─── Step 1: Category ─── */}
        {step === 1 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat.id)}
                className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-background/50 hover:border-teal-500/50 hover:bg-teal-500/5 transition-all hover:scale-[1.02]"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <span className="text-xs font-medium text-center text-foreground/80 group-hover:text-teal-400">
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ─── Step 2: Details ─── */}
        {step === 2 && type && (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="fb-title">
                Title <span className="text-red-400">*</span>
              </Label>
              <Input
                id="fb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="Brief summary of the issue"
                maxLength={MAX_TITLE}
                autoFocus
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                {title.length}/{MAX_TITLE}
              </div>
            </div>

            {CATEGORIES.find((c) => c.id === type)?.showSeverity && (
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <div className="flex flex-wrap gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSeverity(s.id)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        severity === s.id
                          ? `${s.color} ${s.ring} ring-2`
                          : 'bg-background/50 text-muted-foreground border-border hover:border-border/80'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fb-desc">
                Description <span className="text-red-400">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">(min 10 chars)</span>
              </Label>
              <Textarea
                id="fb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={PLACEHOLDER_BY_TYPE[type]}
                className="min-h-[120px] resize-y"
              />
            </div>

            {(type === 'bug' || type === 'crash') && (
              <div className="space-y-1.5">
                <Label htmlFor="fb-repro">Steps to reproduce (optional)</Label>
                <Textarea
                  id="fb-repro"
                  value={reproSteps}
                  onChange={(e) => setReproSteps(e.target.value)}
                  placeholder={'1. Go to...\n2. Click...\n3. See error'}
                  className="min-h-[80px] resize-y"
                />
              </div>
            )}

            {(type === 'bug' || type === 'crash' || type === 'wrong_data' || type === 'performance') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-expected">Expected behavior (optional)</Label>
                  <Input
                    id="fb-expected"
                    value={expectedBehavior}
                    onChange={(e) => setExpectedBehavior(e.target.value)}
                    placeholder="What should happen"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-actual">Actual behavior (optional)</Label>
                  <Input
                    id="fb-actual"
                    value={actualBehavior}
                    onChange={(e) => setActualBehavior(e.target.value)}
                    placeholder="What actually happens"
                  />
                </div>
              </div>
            )}

            {/* Auto-captured tech info (collapsed) */}
            <Collapsible open={techInfoOpen} onOpenChange={setTechInfoOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Technical info (auto-captured)
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${techInfoOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-1.5 font-mono">
                  {capturedContext ? (
                    <>
                      <Row label="Browser" value={`${capturedContext.browserName} ${capturedContext.browserVersion}`} />
                      <Row label="OS" value={`${capturedContext.osName} ${capturedContext.osVersion}`} />
                      <Row label="Screen" value={capturedContext.screenResolution} />
                      <Row label="Timezone" value={capturedContext.timezone} />
                      <Row label="Locale" value={capturedContext.locale} />
                      <Row label="Network" value={capturedContext.networkType} />
                      <Row label="Page URL" value={capturedContext.pageUrl} truncate />
                      <Row label="Previous" value={capturedContext.previousPageUrl || '—'} truncate />
                      <Row label="Nav history" value={`${capturedContext.navigationHistory.length} pages`} />
                      <Row label="API requests" value={`${capturedContext.lastApiRequests.length} tracked`} />
                      <Row label="Errors" value={`${capturedContext.errorLogs.length} captured`} />
                      {capturedContext.performanceData.pageLoadTime && (
                        <Row label="Page load" value={`${capturedContext.performanceData.pageLoadTime}ms`} />
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not available</span>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* ─── Step 3: Attachments ─── */}
        {step === 3 && (
          <div className="space-y-5 py-1">
            {/* Screenshots */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Screenshots ({screenshots.length}/{MAX_FILES})</Label>
                <span className="text-xs text-muted-foreground">PNG, JPEG, WebP, GIF — max 8MB each</span>
              </div>
              <div
                ref={dragRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => screenshotInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-teal-500 bg-teal-500/5'
                    : 'border-border hover:border-teal-500/50 hover:bg-teal-500/5'
                }`}
              >
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => handleScreenshotSelect(e.target.files)}
                />
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag &amp; drop or <span className="text-teal-400">click to upload</span>
                </p>
              </div>
              {uploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {screenshots.map((s, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden border border-border bg-background">
                      {s.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.preview} alt={s.name} className="w-full h-20 object-cover" />
                      ) : (
                        <div className="w-full h-20 flex items-center justify-center">
                          <FileImage className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-1.5">
                        <p className="text-xs truncate">{s.name}</p>
                        <p className={`text-[10px] ${s.size > MAX_FILE_SIZE ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {(s.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => removeScreenshot(i)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Screen recording */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Screen recording {video && '(1/1)'}</Label>
                <span className="text-xs text-muted-foreground">MP4, WebM — max 8MB, 1 file</span>
              </div>
              {video ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50">
                  <FileVideo className="h-8 w-8 text-teal-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{video.name}</p>
                    <p className="text-xs text-muted-foreground">{(video.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={removeVideo}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    onChange={(e) => handleVideoSelect(e.target.files)}
                  />
                  <FileVideo className="h-4 w-4 mr-2" />
                  Add screen recording
                </Button>
              )}
            </div>

            <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />
                All set! Click submit to send your feedback with the auto-captured technical details.
              </p>
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : onOpenChange(false))}
            disabled={submitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button
                onClick={() => setStep(3)}
                disabled={!canSubmit}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 3 && (
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting || uploading}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small helper components ───────────────────────────────────────

function Row({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground shrink-0 w-20">{label}:</span>
      <span className={`text-foreground/90 ${truncate ? 'truncate' : ''}`} title={value}>
        {value || '—'}
      </span>
    </div>
  );
}

export { TYPE_LABELS };
