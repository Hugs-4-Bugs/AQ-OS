'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Notification Preferences Panel
// Phase 7: Granular notification control per category
//
// Features:
// - Toggle notifications by category (Leads, Deals, Payments, Team, System)
// - Delivery channel selection (In-App, Email, Push)
// - Quiet hours configuration
// - Frequency settings (Instant, Digest, Off)
// - Sound & badge preferences
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Users,
  HandshakeIcon,
  CreditCard,
  UserPlus,
  Shield,
  Megaphone,
  Mail,
  Smartphone,
  Monitor,
  Volume2,
  VolumeX,
  Clock,
  Moon,
  Sun,
  Sparkles,
  Save,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireAuth } from '@/lib/auth';

// ── Types ───────────────────────────────────────────────────────
interface NotificationCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  enabled: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };
  frequency: 'instant' | 'digest_daily' | 'digest_weekly' | 'off';
}

interface NotificationPreferences {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  soundEnabled: boolean;
  badgeCount: boolean;
  categories: NotificationCategory[];
}

// ── Default Preferences ─────────────────────────────────────────
const defaultCategories: NotificationCategory[] = [
  {
    id: 'leads', name: 'Lead Activity', description: 'New leads, score changes, stage updates',
    icon: Users, color: 'text-blue-500', enabled: true,
    channels: { inApp: true, email: true, push: true },
    frequency: 'instant',
  },
  {
    id: 'deals', name: 'Deal Updates', description: 'Deal stage changes, wins, losses',
    icon: HandshakeIcon, color: 'text-emerald-500', enabled: true,
    channels: { inApp: true, email: true, push: true },
    frequency: 'instant',
  },
  {
    id: 'payments', name: 'Billing & Payments', description: 'Invoices, payments, subscription changes',
    icon: CreditCard, color: 'text-amber-500', enabled: true,
    channels: { inApp: true, email: true, push: false },
    frequency: 'instant',
  },
  {
    id: 'team', name: 'Team Activity', description: 'New members, role changes, invitations',
    icon: UserPlus, color: 'text-purple-500', enabled: true,
    channels: { inApp: true, email: false, push: false },
    frequency: 'digest_daily',
  },
  {
    id: 'security', name: 'Security Alerts', description: 'Login attempts, password changes, MFA',
    icon: Shield, color: 'text-red-500', enabled: true,
    channels: { inApp: true, email: true, push: true },
    frequency: 'instant',
  },
  {
    id: 'marketing', name: 'Campaign & Outreach', description: 'Email campaign results, outreach replies',
    icon: Megaphone, color: 'text-cyan-500', enabled: false,
    channels: { inApp: true, email: true, push: false },
    frequency: 'digest_daily',
  },
  {
    id: 'ai', name: 'AI Insights', description: 'Scoring updates, recommendations, discoveries',
    icon: Sparkles, color: 'text-pink-500', enabled: true,
    channels: { inApp: true, email: false, push: false },
    frequency: 'digest_weekly',
  },
];

// ── Main Component ──────────────────────────────────────────────
export default function NotificationPreferencesPanel() {
  const [categories, setCategories] = useState<NotificationCategory[]>(defaultCategories);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [badgeCount, setBadgeCount] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Toggle category enabled
  const toggleCategory = useCallback((id: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  }, []);

  // Toggle channel
  const toggleChannel = useCallback((categoryId: string, channel: 'inApp' | 'email' | 'push') => {
    setCategories(prev => prev.map(c =>
      c.id === categoryId
        ? { ...c, channels: { ...c.channels, [channel]: !c.channels[channel] } }
        : c
    ));
  }, []);

  // Update frequency
  const updateFrequency = useCallback((categoryId: string, frequency: NotificationCategory['frequency']) => {
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, frequency } : c
    ));
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 1000)); // Simulate save
    setIsSaving(false);
    toast.success('Notification preferences saved');
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    setCategories(defaultCategories);
    setQuietHoursEnabled(false);
    setQuietHoursStart('22:00');
    setQuietHoursEnd('08:00');
    setSoundEnabled(true);
    setBadgeCount(true);
    toast.info('Preferences reset to defaults');
  }, []);

  const enabledCount = categories.filter(c => c.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notification Preferences
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabledCount} of {categories.length} categories enabled
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs gap-1.5">
            {isSaving ? (
              <div className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Global Settings */}
      <Card className="glass-card-premium p-4">
        <CardHeader className="pb-3 px-0 pt-0">
          <CardTitle className="text-xs font-semibold">Global Settings</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              <div>
                <Label className="text-xs font-medium">Notification Sound</Label>
                <p className="text-[10px] text-muted-foreground">Play sound for new notifications</p>
              </div>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs font-medium">Badge Count</Label>
                <p className="text-[10px] text-muted-foreground">Show unread count on notification bell</p>
              </div>
            </div>
            <Switch checked={badgeCount} onCheckedChange={setBadgeCount} />
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card className="glass-card-premium p-4">
        <CardHeader className="pb-3 px-0 pt-0">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" />
            Quiet Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Enable Quiet Hours</Label>
              <p className="text-[10px] text-muted-foreground">Mute notifications during set hours</p>
            </div>
            <Switch checked={quietHoursEnabled} onCheckedChange={setQuietHoursEnabled} />
          </div>
          {quietHoursEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 pt-2"
            >
              <div className="flex items-center gap-2">
                <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={quietHoursStart} onValueChange={setQuietHoursStart}>
                  <SelectTrigger className="w-[90px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['20:00', '21:00', '22:00', '23:00'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground">to</span>
              <div className="flex items-center gap-2">
                <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={quietHoursEnd} onValueChange={setQuietHoursEnd}>
                  <SelectTrigger className="w-[90px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['06:00', '07:00', '08:00', '09:00'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="text-[9px] ml-auto">
                {(() => {
                  const [sh, sm] = quietHoursStart.split(':').map(Number);
                  const [eh, em] = quietHoursEnd.split(':').map(Number);
                  const start = sh * 60 + sm;
                  const end = eh * 60 + em;
                  const hours = end > start ? (end - start) / 60 : (24 * 60 - start + end) / 60;
                  return `${hours}h quiet`;
                })()}
              </Badge>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((cat, i) => {
          const CatIcon = cat.icon;
          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={cn(
                'glass-card-premium p-4 transition-all duration-200',
                !cat.enabled && 'opacity-50'
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn('rounded-lg p-2 shrink-0', cat.color.replace('text-', 'bg-').replace('-500', '-500/15'))}>
                    <CatIcon className={cn('h-4 w-4', cat.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-medium">{cat.name}</Label>
                      <Switch
                        checked={cat.enabled}
                        onCheckedChange={() => toggleCategory(cat.id)}
                        className="scale-90"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-3">{cat.description}</p>

                    {cat.enabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3"
                      >
                        {/* Delivery Channels */}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground w-12 shrink-0">Deliver via:</span>
                          <div className="flex gap-2">
                            {([
                              { key: 'inApp' as const, icon: Monitor, label: 'In-App' },
                              { key: 'email' as const, icon: Mail, label: 'Email' },
                              { key: 'push' as const, icon: Smartphone, label: 'Push' },
                            ]).map(ch => (
                              <button
                                key={ch.key}
                                onClick={() => toggleChannel(cat.id, ch.key)}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-all',
                                  cat.channels[ch.key]
                                    ? 'bg-primary/10 border-primary/20 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-muted/50'
                                )}
                              >
                                <ch.icon className="h-3 w-3" />
                                {ch.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Frequency */}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground w-12 shrink-0">Frequency:</span>
                          <Select
                            value={cat.frequency}
                            onValueChange={(v) => updateFrequency(cat.id, v as NotificationCategory['frequency'])}
                          >
                            <SelectTrigger className="w-[140px] h-7 text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="instant">Instant</SelectItem>
                              <SelectItem value="digest_daily">Daily Digest</SelectItem>
                              <SelectItem value="digest_weekly">Weekly Digest</SelectItem>
                              <SelectItem value="off">Off</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
