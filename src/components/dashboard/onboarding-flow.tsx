'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  User,
  Target,
  MessageSquare,
  Plug,
  PartyPopper,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  Mail,
  MessageCircle,
  Linkedin,
  Instagram,
  Phone,
  Globe,
  Building2,
  Check,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { NICHE_OPTIONS, COUNTRY_OPTIONS } from '@/lib/types';
import { cn } from '@/lib/utils';

// ===== Types =====
interface OnboardingData {
  name: string;
  companyName: string;
  country: string;
  phone: string;
  targetNiches: string[];
  targetCountries: string[];
  preferredChannels: string[];
  connectGmail: boolean;
  connectTelegram: boolean;
}

const CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'phone', label: 'Phone', icon: Phone },
];

const TOTAL_STEPS = 6;

// ===== Confetti Component =====
function Confetti() {
  const colors = useMemo(
    () => [
      'oklch(0.527 0.22 280)',
      'oklch(0.72 0.19 155)',
      'oklch(0.75 0.18 55)',
      'oklch(0.6 0.2 300)',
      'oklch(0.85 0.18 90)',
      'oklch(0.75 0.15 210)',
    ],
    []
  );

  const particles = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.5 + Math.random() * 1.5,
        size: 4 + Math.random() * 6,
        color: colors[i % colors.length],
        rotation: Math.random() * 360,
      })),
    [colors]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: '-5%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{
            y: '110vh',
            opacity: [1, 1, 0],
            rotate: p.rotation + 720,
            x: [0, (Math.random() - 0.5) * 200],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

// ===== Chip/Pill Toggle Button =====
function ChipButton({
  label,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200',
        'border cursor-pointer select-none',
        selected
          ? 'bg-primary/15 border-primary/40 text-primary shadow-sm'
          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:border-primary/20'
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {selected && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

// ===== Step Components =====
function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center space-y-6">
      <motion.div
        className="relative"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        <div className="h-28 w-28 rounded-2xl bg-primary/10 flex items-center justify-center relative">
          <Rocket className="h-14 w-14 text-primary" />
          <motion.div
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="h-3 w-3 text-primary" />
          </motion.div>
        </div>
      </motion.div>
      <div className="space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold gradient-text">
          Welcome to AcquisitionOS!
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          Your AI-powered client acquisition system. Discover leads, automate outreach,
          close deals, and grow your business — all in one place.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm pt-2">
        {[
          { icon: Target, label: 'Find Leads' },
          { icon: MessageSquare, label: 'Auto Outreach' },
          { icon: PartyPopper, label: 'Close Deals' },
        ].map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 border border-border"
          >
            <item.icon className="h-5 w-5 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutYouStep({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">About You</h2>
          <p className="text-sm text-muted-foreground">Tell us about yourself to personalize your experience</p>
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Your Name <span className="text-primary">*</span>
          </Label>
          <Input
            id="name"
            placeholder="John Doe"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="border-primary/20 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName" className="text-sm font-medium flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Company Name
          </Label>
          <Input
            id="companyName"
            placeholder="Your Company"
            value={data.companyName}
            onChange={(e) => onUpdate({ companyName: e.target.value })}
            className="border-primary/20 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Country <span className="text-primary">*</span>
          </Label>
          <Select
            value={data.country || '__none__'}
            onValueChange={(v) => onUpdate({ country: v === '__none__' ? '' : v })}
          >
            <SelectTrigger className="border-primary/20 focus:ring-primary/30">
              <SelectValue placeholder="Select your country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select country...</SelectItem>
              {COUNTRY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone Number
          </Label>
          <Input
            id="phone"
            placeholder="+1 (555) 000-0000"
            value={data.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            className="border-primary/20 focus:ring-primary/30"
          />
        </div>
      </div>
    </div>
  );
}

function TargetMarketsStep({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}) {
  const toggleNiche = useCallback(
    (niche: string) => {
      const current = data.targetNiches;
      const updated = current.includes(niche)
        ? current.filter((n) => n !== niche)
        : [...current, niche];
      onUpdate({ targetNiches: updated });
    },
    [data.targetNiches, onUpdate]
  );

  const toggleCountry = useCallback(
    (country: string) => {
      const current = data.targetCountries;
      const updated = current.includes(country)
        ? current.filter((c) => c !== country)
        : [...current, country];
      onUpdate({ targetCountries: updated });
    },
    [data.targetCountries, onUpdate]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Target Markets</h2>
          <p className="text-sm text-muted-foreground">Select the niches and countries you want to target</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Target Niches</Label>
          <div className="flex flex-wrap gap-2">
            {NICHE_OPTIONS.map((niche) => (
              <ChipButton
                key={niche}
                label={niche}
                selected={data.targetNiches.includes(niche)}
                onClick={() => toggleNiche(niche)}
              />
            ))}
          </div>
          {data.targetNiches.length > 0 && (
            <p className="text-xs text-primary">
              {data.targetNiches.length} niche{data.targetNiches.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Target Countries</Label>
          <div className="flex flex-wrap gap-2">
            {COUNTRY_OPTIONS.map((country) => (
              <ChipButton
                key={country}
                label={country}
                selected={data.targetCountries.includes(country)}
                onClick={() => toggleCountry(country)}
              />
            ))}
          </div>
          {data.targetCountries.length > 0 && (
            <p className="text-xs text-primary">
              {data.targetCountries.length} countr{data.targetCountries.length !== 1 ? 'ies' : 'y'} selected
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PreferredChannelsStep({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}) {
  const toggleChannel = useCallback(
    (channel: string) => {
      const current = data.preferredChannels;
      const updated = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      onUpdate({ preferredChannels: updated });
    },
    [data.preferredChannels, onUpdate]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Preferred Channels</h2>
          <p className="text-sm text-muted-foreground">How do you want to reach your leads?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CHANNEL_OPTIONS.map((channel) => {
          const Icon = channel.icon;
          const selected = data.preferredChannels.includes(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => toggleChannel(channel.id)}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 cursor-pointer',
                selected
                  ? 'bg-primary/10 border-primary/40 shadow-sm'
                  : 'bg-muted/30 border-border hover:bg-muted/50 hover:border-primary/20'
              )}
            >
              <div
                className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center transition-colors',
                  selected ? 'bg-primary/20' : 'bg-muted'
                )}
              >
                <Icon className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="text-left">
                <p className={cn('text-sm font-medium', selected ? 'text-primary' : 'text-foreground')}>
                  {channel.label}
                </p>
                {selected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="mt-0.5"
                  >
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </motion.div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {data.preferredChannels.length > 0 && (
        <p className="text-xs text-primary">
          {data.preferredChannels.length} channel{data.preferredChannels.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}

function ConnectToolsStep({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Connect Your Tools</h2>
          <p className="text-sm text-muted-foreground">Integrate your existing tools for a seamless experience</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onUpdate({ connectGmail: !data.connectGmail })}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer',
            data.connectGmail
              ? 'bg-primary/10 border-primary/40 shadow-sm'
              : 'bg-muted/30 border-border hover:bg-muted/50'
          )}
        >
          <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-red-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Gmail</p>
            <p className="text-xs text-muted-foreground">Send and track outreach emails directly</p>
          </div>
          <Badge variant={data.connectGmail ? 'default' : 'outline'} className="text-xs">
            {data.connectGmail ? 'Connected' : 'Connect'}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ connectTelegram: !data.connectTelegram })}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer',
            data.connectTelegram
              ? 'bg-primary/10 border-primary/40 shadow-sm'
              : 'bg-muted/30 border-border hover:bg-muted/50'
          )}
        >
          <div className="h-12 w-12 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-sky-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Telegram</p>
            <p className="text-xs text-muted-foreground">Get real-time notifications and reminders</p>
          </div>
          <Badge variant={data.connectTelegram ? 'default' : 'outline'} className="text-xs">
            {data.connectTelegram ? 'Connected' : 'Setup'}
          </Badge>
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        You can always connect these later in Settings
      </p>
    </div>
  );
}

function CompleteStep({ data }: { data: OnboardingData }) {
  const [showConfetti, setShowConfetti] = useState(true);

  return (
    <div className="flex flex-col items-center text-center space-y-6 relative">
      {showConfetti && <Confetti />}

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
      >
        <div className="h-20 w-20 rounded-2xl bg-primary/15 flex items-center justify-center relative">
          <PartyPopper className="h-10 w-10 text-primary" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-2"
      >
        <h2 className="text-2xl sm:text-3xl font-bold gradient-text">You&apos;re All Set!</h2>
        <p className="text-muted-foreground text-sm">
          Your 14-day Pro trial has started. Let&apos;s get acquiring!
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="w-full max-w-sm space-y-3 bg-muted/30 border border-border rounded-xl p-4"
      >
        <h3 className="text-sm font-semibold text-left">Your Setup Summary</h3>
        <div className="space-y-2 text-left">
          {data.name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{data.name}</span>
            </div>
          )}
          {data.companyName && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Company:</span>
              <span className="font-medium">{data.companyName}</span>
            </div>
          )}
          {data.country && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Country:</span>
              <span className="font-medium">{data.country}</span>
            </div>
          )}
          {data.targetNiches.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Target className="h-3.5 w-3.5 text-primary mt-0.5" />
              <span className="text-muted-foreground shrink-0">Niches:</span>
              <div className="flex flex-wrap gap-1">
                {data.targetNiches.slice(0, 4).map((n) => (
                  <Badge key={n} variant="secondary" className="text-[10px] h-5">
                    {n}
                  </Badge>
                ))}
                {data.targetNiches.length > 4 && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    +{data.targetNiches.length - 4}
                  </Badge>
                )}
              </div>
            </div>
          )}
          {data.preferredChannels.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <MessageSquare className="h-3.5 w-3.5 text-primary mt-0.5" />
              <span className="text-muted-foreground shrink-0">Channels:</span>
              <div className="flex flex-wrap gap-1">
                {data.preferredChannels.map((c) => (
                  <Badge key={c} variant="secondary" className="text-[10px] h-5 capitalize">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ===== Main Onboarding Flow Component =====
interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

export default function OnboardingFlow({ open, onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    name: '',
    companyName: '',
    country: '',
    phone: '',
    targetNiches: [],
    targetCountries: [],
    preferredChannels: [],
    connectGmail: false,
    connectTelegram: false,
  });

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0:
        return true;
      case 1:
        return data.name.trim().length > 0;
      case 2:
        return data.targetNiches.length > 0;
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return true;
    }
  }, [currentStep, data]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Complete onboarding
      localStorage.setItem('acquisitionos_onboarding_completed', 'true');
      localStorage.setItem('acquisitionos_onboarding_data', JSON.stringify(data));
      onComplete();
    }
  }, [currentStep, data, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('acquisitionos_onboarding_completed', 'true');
    onComplete();
  }, [onComplete]);

  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Dark overlay */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Main card */}
      <motion.div
        className="relative w-full max-w-lg mx-4 z-10"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-muted/30">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>

          {/* Step indicator dots */}
          <div className="flex items-center justify-center gap-2 pt-4 px-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === currentStep
                    ? 'w-6 bg-primary'
                    : i < currentStep
                      ? 'w-1.5 bg-primary/50'
                      : 'w-1.5 bg-muted'
                )}
              />
            ))}
          </div>

          {/* Step label */}
          <div className="text-center pt-2 pb-1 px-6">
            <p className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {TOTAL_STEPS}
            </p>
          </div>

          {/* Content area */}
          <div className="px-6 py-4 min-h-[380px] flex items-start overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full"
              >
                {currentStep === 0 && <WelcomeStep />}
                {currentStep === 1 && <AboutYouStep data={data} onUpdate={updateData} />}
                {currentStep === 2 && <TargetMarketsStep data={data} onUpdate={updateData} />}
                {currentStep === 3 && <PreferredChannelsStep data={data} onUpdate={updateData} />}
                {currentStep === 4 && <ConnectToolsStep data={data} onUpdate={updateData} />}
                {currentStep === 5 && <CompleteStep data={data} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentStep > 0 && currentStep < 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {currentStep > 0 && currentStep < 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1" />
                  Skip
                </Button>
              )}
            </div>
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                'gap-1.5',
                currentStep === 0 && 'bg-primary hover:bg-primary/90',
                currentStep === 5 && 'bg-primary hover:bg-primary/90'
              )}
            >
              {currentStep === 0 && (
                <>
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
              {currentStep > 0 && currentStep < 4 && (
                <>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
              {currentStep === 4 && (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
              {currentStep === 5 && (
                <>
                  Go to Dashboard
                  <Rocket className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
