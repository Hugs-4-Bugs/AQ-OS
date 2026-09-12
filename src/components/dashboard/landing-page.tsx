'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Search,
  Bot,
  BarChart3,
  Zap,
  Shield,
  ChevronRight,
  Star,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Users,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const FEATURES = [
  { icon: Search, title: 'AI Lead Discovery', description: 'Find hidden business opportunities with AI-powered search across multiple data sources.' },
  { icon: Bot, title: 'Sales AI Assistant', description: 'Get real-time coaching and conversation analysis to close deals faster.' },
  { icon: Target, title: 'Smart Outreach', description: 'Craft personalized outreach sequences that convert leads into clients.' },
  { icon: BarChart3, title: 'Deal Intelligence', description: 'Track pipeline metrics and get AI-driven insights to improve win rates.' },
  { icon: Shield, title: 'Competitor Analysis', description: 'Monitor competitors and identify market gaps to position your offers.' },
  { icon: Zap, title: 'Workflow Automation', description: 'Automate follow-ups, scoring, and lead routing to scale your acquisition.' },
];

const TESTIMONIALS = [
  { name: 'Sarah Chen', role: 'M&A Director', company: 'Apex Ventures', quote: 'AcquisitionOS helped us discover 3x more qualified leads in our target market.', avatar: 'SC' },
  { name: 'Marcus Webb', role: 'Business Broker', company: 'Webb & Associates', quote: 'The AI assistant is like having a senior analyst available 24/7. Game changer.', avatar: 'MW' },
  { name: 'Priya Sharma', role: 'Acquisition Lead', company: 'NovaTech Capital', quote: 'Reduced our outreach-to-response time by 60%. The smart sequences are incredible.', avatar: 'PS' },
];

const STATS = [
  { value: '3x', label: 'More Qualified Leads' },
  { value: '60%', label: 'Faster Response Time' },
  { value: '2.5x', label: 'Close Rate Improvement' },
  { value: '500+', label: 'Businesses Acquired' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ===== NAVBAR ===== */}
      <header className="sticky top-0 z-[100] border-b bg-background/80 backdrop-blur-xl">
        <div className="container-app flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold gradient-text">AcquisitionOS</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Sign In</Button>
            <Button size="sm" className="gap-1.5">
              Get Started <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="container-app relative py-20 sm:py-28 lg:py-36">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs font-medium bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-Powered Acquisition Platform
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
              Acquire Smarter.{' '}
              <span className="gradient-text-animated">Close Faster.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              The AI-powered client acquisition system that reveals hidden opportunities, automates outreach, and closes deals faster than ever.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="gap-2 text-base px-8 h-12">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" className="gap-2 text-base px-8 h-12">
                Watch Demo <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No credit card required · 50 free credits · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="border-y bg-muted/30">
        <div className="container-app py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold gradient-text">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20 lg:py-28">
        <div className="container-app">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary border-primary/20">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Everything You Need to Dominate</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">From discovery to close, AcquisitionOS gives you the AI-powered tools to find, analyze, and acquire businesses at scale.</p>
          </div>
          <div className="grid-auto-fill">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="card-glow card-responsive group">
                <CardHeader className="pb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-20 lg:py-28 bg-muted/30">
        <div className="container-app">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary border-primary/20">Testimonials</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Trusted by Acquisition Leaders</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="card-responsive">
                <div className="flex items-center gap-1 mb-3 px-6 pt-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 px-6">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3 px-6 pb-6">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}, {t.company}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-20 lg:py-28">
        <div className="container-app">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary border-primary/20">Pricing</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Start free and scale as you grow. No hidden fees.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <Card className="card-responsive">
              <CardHeader>
                <CardTitle className="text-lg">Free</CardTitle>
                <CardDescription>For getting started</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {['50 AI credits/month', 'Up to 10 leads', 'Basic lead scoring', 'Email support'].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4">Get Started Free</Button>
              </CardContent>
            </Card>
            {/* Pro */}
            <Card className="card-responsive border-primary shadow-lg shadow-primary/10 relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
              <CardHeader>
                <CardTitle className="text-lg">Pro</CardTitle>
                <CardDescription>For growing teams</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {['500 AI credits/month', 'Up to 200 leads', 'Advanced scoring & analysis', 'Outreach sequences', 'Priority support', 'Gmail integration'].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Button className="w-full mt-4">Start Pro Trial</Button>
              </CardContent>
            </Card>
            {/* Elite */}
            <Card className="card-responsive">
              <CardHeader>
                <CardTitle className="text-lg">Elite</CardTitle>
                <CardDescription>For power users</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold">$89</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {['2,000 AI credits/month', 'Unlimited leads', 'Full AI suite', 'Workflow automation', 'Competitor intelligence', 'Telegram & WhatsApp', 'Dedicated support'].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4">Start Elite Trial</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-20 lg:py-28 bg-muted/30">
        <div className="container-app text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Ready to Dominate Your Market?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">Join hundreds of acquisition professionals who are closing deals faster with AI.</p>
          <Button size="lg" className="gap-2 text-base px-8 h-12">
            Start Your Free Trial <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t py-12">
        <div className="container-app">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="h-5 w-5 text-primary" />
                <span className="font-bold gradient-text">AcquisitionOS</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">AI-powered client acquisition that reveals opportunities, automates outreach, and closes deals.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="hover:text-foreground cursor-pointer transition-colors">Features</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Pricing</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Integrations</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Changelog</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="hover:text-foreground cursor-pointer transition-colors">About</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Blog</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Careers</p>
                <p className="hover:text-foreground cursor-pointer transition-colors">Contact</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Legal</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <a href="/privacy" className="hover:text-foreground cursor-pointer transition-colors block">Privacy Policy</a>
                <a href="/terms" className="hover:text-foreground cursor-pointer transition-colors block">Terms of Service</a>
                <a href="/terms#cookies" className="hover:text-foreground cursor-pointer transition-colors block">Cookie Policy</a>
                <a href="/privacy#gdpr" className="hover:text-foreground cursor-pointer transition-colors block">GDPR</a>
              </div>
            </div>
          </div>
          <Separator className="mb-6" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} AcquisitionOS. All rights reserved.</p>
            <div className="flex items-center gap-1 text-foreground">
              Crafted with <span className="text-red-500">❤️</span> by{' '}
              <a
                href="https://www.linkedin.com/company/quantumfusion-solutions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                QuantumFusion Solutions
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
