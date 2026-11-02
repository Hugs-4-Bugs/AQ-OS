'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Landing Page (Redesigned)
//
// Premium, motion-rich landing page with REAL production data.
// - Logo is clickable → redirects to "/" (home) from any page
// - Hero shows live stats fetched from /api/public/stats
// - Before/After comparison with real acquisition numbers
// - Fully responsive (mobile/tablet/desktop)
// - framer-motion entrance animations + reduced-motion support
// - Trust signals from real data (not fabricated testimonials)
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import {
  Rocket, Search, Bot, BarChart3, Zap, Shield, ChevronRight, ArrowRight,
  CheckCircle2, Sparkles, Users, Target, TrendingUp, Globe, Brain,
  Mail, Calendar, Handshake, DollarSign, Activity, Clock, Send,
  Menu, X, Play, Star, Building2, MapPin, Cpu, LineChart,
  Phone, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ── Real stats type (from /api/public/stats) ─────────────────────────
interface PublicStats {
  totalLeadsDiscovered: number;
  leadsDiscovered30d: number;
  leadsDiscovered7d: number;
  leadsContacted: number;
  outreachMessagesSent: number;
  autopilotRuns: number;
  activeAutopilotWorkflows: number;
  activeSubscriptions: number;
  totalUsers: number;
  activityEvents7d: number;
  topNiches: Array<{ niche: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  leadStages: Array<{ stage: string; count: number }>;
  contactRate: number;
  automationActive: boolean;
  generatedAt: string;
}

export default function LandingPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fetch real stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/public/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStats(json.data);
      }
    } catch { /* fail silently — hero still renders with fallback */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Logo click → navigate to home (works from any page)
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ===== NAVBAR ===== */}
      <header className="sticky top-0 z-[100] border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo — CLICKABLE → home */}
          <a href="/" onClick={handleLogoClick} className="flex items-center gap-2 cursor-pointer" aria-label="AcquisitionOS — go to home">
            <motion.span
              initial={reduced ? false : { rotate: -10, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15 }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-md"
            >
              <Rocket className="h-5 w-5 text-white" aria-hidden="true" />
            </motion.span>
            <span className="text-lg font-bold tracking-tight">
              Acquisition<span className="text-primary">OS</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm" aria-label="Main navigation">
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#real-data" className="text-muted-foreground hover:text-foreground transition-colors">Live Data</a>
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => router.push('/auth/signin')}>
              Sign In
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => router.push('/auth/signup')}>
              Get Started <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-md hover:bg-muted"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduced ? undefined : { height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden border-t border-border bg-background"
              aria-label="Mobile navigation"
            >
              <div className="px-4 py-3 space-y-2">
                <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-muted-foreground hover:text-foreground">How It Works</a>
                <a href="#real-data" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-muted-foreground hover:text-foreground">Live Data</a>
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-muted-foreground hover:text-foreground">Features</a>
                <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-muted-foreground hover:text-foreground">Pricing</a>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-grid opacity-[0.03]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[120px] opacity-50" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs font-medium bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                AI-Powered Autonomous Client Acquisition
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            >
              Stop chasing leads.
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                Start acquiring clients.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 text-lg text-muted-foreground sm:text-xl max-w-2xl mx-auto"
            >
              AcquisitionOS discovers hidden business opportunities with AI, analyzes them for fit,
              and runs autonomous outreach that converts prospects into paying clients — 24/7.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.3, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Button size="lg" className="gap-2 w-full sm:w-auto" onClick={() => router.push('/auth/signup')}>
                Start Acquiring Clients <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                <Play className="h-4 w-4" aria-hidden="true" /> See How It Works
              </Button>
            </motion.div>

            {/* Live stats strip — REAL DATA */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.4, duration: 0.6 }}
              className="mt-12"
            >
              <LiveStatsStrip stats={stats} mounted={mounted} reduced={reduced} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== BEFORE / AFTER COMPARISON ===== */}
      <section id="real-data" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-xs">
              <Activity className="h-3 w-3 mr-1" aria-hidden="true" /> Real Production Data
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Before vs After AcquisitionOS
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Real numbers from real users. No fabricated testimonials, no demo data.
            </p>
          </div>

          <BeforeAfterComparison stats={stats} reduced={reduced} />
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From Discovery to Deal — Autonomously</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            AcquisitionOS automates the entire client acquisition lifecycle.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Search, step: '01', title: 'AI Discovers', desc: 'Autopilot searches Google Maps, LinkedIn, AI search, and more to find businesses matching your target criteria.', color: 'from-sky-500 to-cyan-500' },
            { icon: Brain, step: '02', title: 'AI Analyzes', desc: 'Each lead is scored for reply probability, conversion potential, urgency, and revenue — automatically.', color: 'from-violet-500 to-purple-500' },
            { icon: Send, step: '03', title: 'AI Contacts', desc: 'Personalized outreach sequences run across email, WhatsApp, LinkedIn — with AI-generated messaging.', color: 'from-emerald-500 to-teal-500' },
            { icon: Handshake, step: '04', title: 'You Close', desc: 'Replies, meetings, and deals flow into your pipeline. You focus on closing — AI handles the rest.', color: 'from-amber-500 to-orange-500' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={reduced ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={reduced ? { duration: 0 } : { delay: i * 0.1, duration: 0.5 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} mb-4`}>
                      <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mb-1">{item.step}</p>
                    <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to acquire clients at scale</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              One platform. Complete acquisition lifecycle. Zero manual lead-chasing.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Search, title: 'AI Lead Discovery', desc: 'Multi-source discovery across Google Maps, LinkedIn, AI search, and more — with provenance tracking.' },
              { icon: Brain, title: 'Lead Intelligence', desc: 'AI scores every lead for reply probability, conversion potential, urgency, and revenue. Know who to contact first.' },
              { icon: Send, title: 'Autonomous Outreach', desc: 'AI-generated, personalized outreach sequences across email, WhatsApp, LinkedIn — sent automatically.' },
              { icon: Bot, title: 'Autopilot Engine', desc: 'Set your target niches and geography. Autopilot discovers, analyzes, and contacts leads on your schedule.' },
              { icon: BarChart3, title: 'Sales Command Center', desc: 'Real-time dashboard with live KPIs, funnel, pipeline, revenue tracking, and deal velocity.' },
              { icon: Building2, title: 'Business Intelligence', desc: 'Research your own business website to generate acquisition angles, SWOT, and positioning intelligence.' },
              { icon: Shield, title: 'Competitor Analysis', desc: 'Monitor competitors and identify market gaps to position your offers strategically.' },
              { icon: Zap, title: 'Workflow Automation', desc: 'Automate follow-ups, scoring, lead routing, and meeting scheduling — scale without hiring.' },
              { icon: DollarSign, title: 'Stripe-Powered Billing', desc: 'Real payments via Stripe. Subscription plans, credit add-ons, and customer portal — built-in.' },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={reduced ? { duration: 0 } : { delay: (i % 3) * 0.1, duration: 0.5 }}
                >
                  <Card className="h-full hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                        </span>
                        <div>
                          <h3 className="font-semibold mb-1">{feature.title}</h3>
                          <p className="text-sm text-muted-foreground">{feature.desc}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== PRICING TEASER ===== */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, credit-based pricing</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you're ready to scale. Real Stripe-powered payments.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
          {[
            { name: 'Starter', price: 'Free', credits: '50 credits', features: ['AI discovery', 'Lead scoring', 'Basic outreach', '1 niche'] },
            { name: 'Pro', price: '$29/mo', credits: '750 credits', features: ['Everything in Starter', 'Autopilot automation', 'Multi-channel outreach', '5 niches', 'Sales dashboard'] },
            { name: 'Elite', price: '$99/mo', credits: '2,000 credits', features: ['Everything in Pro', 'Business intelligence', 'Sequence automation', 'Unlimited niches', 'Priority support'] },
            { name: 'Enterprise', price: 'Custom', credits: 'Custom', features: ['Everything in Elite', 'Dedicated infrastructure', 'Custom integrations', 'SLA guarantee', 'White-glove onboarding'] },
          ].map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={reduced ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={reduced ? { duration: 0 } : { delay: i * 0.1, duration: 0.5 }}
            >
              <Card className={i === 2 ? 'border-primary shadow-lg' : ''}>
                <CardContent className="p-6">
                  {i === 2 && <Badge className="mb-2 w-full justify-center">Most Popular</Badge>}
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <p className="mt-2 text-2xl font-bold">{plan.price}</p>
                  <p className="text-sm text-muted-foreground">{plan.credits}</p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-4 w-full" variant={i === 2 ? 'default' : 'outline'} size="sm" onClick={() => router.push('/auth/signup')}>
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="border-t border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 text-center">
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={reduced ? { duration: 0 } : { duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your acquisition engine is waiting.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Join the businesses using AcquisitionOS to discover, contact, and close clients autonomously.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="gap-2" onClick={() => router.push('/auth/signup')}>
                Start Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => router.push('/auth/signin')}>
                Sign In
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold">AcquisitionOS</span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} AcquisitionOS. AI-Powered Client Acquisition System.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Live Stats Strip (real data from /api/public/stats) ──────────────

function LiveStatsStrip({ stats, mounted, reduced }: { stats: PublicStats | null; mounted: boolean; reduced: boolean | null }) {
  if (!mounted) {
    return <div className="h-24" aria-busy="true" />;
  }

  const items = stats ? [
    { value: stats.totalLeadsDiscovered, label: 'Leads Discovered', icon: Search },
    { value: stats.leadsContacted, label: 'Contacted', icon: Send },
    { value: stats.autopilotRuns, label: 'Autopilot Runs', icon: Bot },
    { value: stats.activeSubscriptions, label: 'Active Users', icon: Users },
  ] : [
    { value: '—', label: 'Leads Discovered', icon: Search },
    { value: '—', label: 'Contacted', icon: Send },
    { value: '—', label: 'Autopilot Runs', icon: Bot },
    { value: '—', label: 'Active Users', icon: Users },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y-0 divide-border sm:divide-y-0">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={reduced ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? { duration: 0 } : { delay: 0.5 + i * 0.1, duration: 0.4 }}
              className="p-4 sm:p-6 text-center"
            >
              <Icon className="mx-auto h-5 w-5 text-primary mb-2" aria-hidden="true" />
              <AnimatedNumber value={typeof item.value === 'number' ? item.value : 0} mounted={mounted} />
              <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
            </motion.div>
          );
        })}
      </div>
      {stats && (
        <div className="border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live data · updated {new Date(stats.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </Card>
  );
}

function AnimatedNumber({ value, mounted }: { value: number; mounted: boolean }) {
  const [display, setDisplay] = React.useState(0);
  useEffect(() => {
    if (!mounted || value === 0) { setDisplay(value); return; }
    const duration = 1000;
    const start = performance.now();
    let raf = 0;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, mounted]);
  return <p className="text-2xl font-bold tabular-nums sm:text-3xl">{display.toLocaleString()}</p>;
}

// ── Before/After Comparison ──────────────────────────────────────────

function BeforeAfterComparison({ stats, reduced }: { stats: PublicStats | null; reduced: boolean | null }) {
  const beforeItems = [
    { label: 'Manual lead finding', value: 'Hours/day', icon: Clock },
    { label: 'Cold calling', value: 'Low response', icon: Phone },
    { label: 'No lead scoring', value: 'Guesswork', icon: Target },
    { label: 'Manual follow-ups', value: 'Forgotten leads', icon: Bell },
  ];
  const afterItems = stats ? [
    { label: 'AI-discovered leads', value: stats.totalLeadsDiscovered.toLocaleString(), icon: Search },
    { label: 'Auto-contacted', value: stats.leadsContacted.toLocaleString(), icon: Send },
    { label: 'Autopilot runs', value: stats.autopilotRuns.toLocaleString(), icon: Bot },
    { label: 'Activity events (7d)', value: stats.activityEvents7d.toLocaleString(), icon: Activity },
  ] : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-4xl mx-auto">
      {/* BEFORE */}
      <motion.div
        initial={reduced ? false : { opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={reduced ? { duration: 0 } : { duration: 0.5 }}
      >
        <Card className="border-muted">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <h3 className="font-semibold">Before AcquisitionOS</h3>
            </div>
            <ul className="space-y-3">
              {beforeItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </span>
                    <Badge variant="outline" className="text-xs text-muted-foreground">{item.value}</Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* AFTER */}
      <motion.div
        initial={reduced ? false : { opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.5 }}
      >
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <h3 className="font-semibold">With AcquisitionOS</h3>
              {stats && (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                  Live
                </Badge>
              )}
            </div>
            {afterItems.length > 0 ? (
              <ul className="space-y-3">
                {afterItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.label} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                        {item.label}
                      </span>
                      <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30">{item.value}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="space-y-3">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}