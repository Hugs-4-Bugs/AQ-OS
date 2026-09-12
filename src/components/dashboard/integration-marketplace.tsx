'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Search,
  Plug,
  Star,
  Settings,
  Link2,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Users,
  Shield,
  ArrowUpRight,
  Globe,
  Zap,
  MessageSquare,
  CreditCard,
  BarChart3,
  Mail,
  Clock,
} from 'lucide-react';

/* ===== Types ===== */
type IntegrationStatus = 'connected' | 'available' | 'coming_soon';
type IntegrationCategory = 'all' | 'crm' | 'email' | 'analytics' | 'payments' | 'communication' | 'productivity';

interface IntegrationDefinition {
  id: string;
  name: string;
  initials: string;
  description: string;
  status: IntegrationStatus;
  category: IntegrationCategory[];
  rating: number;
  reviewCount: number;
  installCount: string;
  color: string;
  bg: string;
  borderColor: string;
  icon: React.ElementType;
  features: string[];
}

/* ===== Constants ===== */
const CATEGORIES: { id: IntegrationCategory; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'communication', label: 'Communication', icon: MessageSquare },
  { id: 'productivity', label: 'Productivity', icon: Zap },
];

const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: 'salesforce',
    name: 'Salesforce',
    initials: 'SF',
    description: 'Sync leads, contacts, and deals bi-directionally with Salesforce CRM. Auto-push stage changes and notes.',
    status: 'connected',
    category: ['crm'],
    rating: 4.8,
    reviewCount: 1247,
    installCount: '12.4k',
    color: 'text-sky-500',
    bg: 'bg-sky-500',
    borderColor: 'border-sky-500/30',
    icon: Users,
    features: ['Bi-directional sync', 'Auto-stage push', 'Custom fields mapping'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    initials: 'HS',
    description: 'Connect your HubSpot CRM for seamless lead management, email tracking, and deal pipeline sync.',
    status: 'available',
    category: ['crm', 'marketing'],
    rating: 4.6,
    reviewCount: 892,
    installCount: '8.2k',
    color: 'text-orange-500',
    bg: 'bg-orange-500',
    borderColor: 'border-orange-500/30',
    icon: Users,
    features: ['Lead sync', 'Email tracking', 'Pipeline sync'],
  },
  {
    id: 'slack',
    name: 'Slack',
    initials: 'SL',
    description: 'Get real-time deal notifications, lead alerts, and team updates directly in your Slack channels.',
    status: 'connected',
    category: ['communication'],
    rating: 4.9,
    reviewCount: 2103,
    installCount: '18.7k',
    color: 'text-violet-500',
    bg: 'bg-violet-500',
    borderColor: 'border-violet-500/30',
    icon: MessageSquare,
    features: ['Real-time alerts', 'Channel routing', 'Interactive actions'],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    initials: 'GM',
    description: 'Track all email outreach, log conversations automatically, and enable one-click templates.',
    status: 'available',
    category: ['email'],
    rating: 4.5,
    reviewCount: 1567,
    installCount: '14.1k',
    color: 'text-red-500',
    bg: 'bg-red-500',
    borderColor: 'border-red-500/30',
    icon: Mail,
    features: ['Auto-logging', 'Templates', 'Thread tracking'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    initials: 'ST',
    description: 'Link payment data with your deals. Track invoices, payment status, and revenue automatically.',
    status: 'available',
    category: ['payments'],
    rating: 4.7,
    reviewCount: 634,
    installCount: '5.8k',
    color: 'text-indigo-500',
    bg: 'bg-indigo-500',
    borderColor: 'border-indigo-500/30',
    icon: CreditCard,
    features: ['Invoice tracking', 'Revenue sync', 'Payment status'],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    initials: 'GA',
    description: 'Pull web analytics, conversion funnels, and traffic source data into your acquisition dashboard.',
    status: 'coming_soon',
    category: ['analytics'],
    rating: 4.4,
    reviewCount: 421,
    installCount: '3.2k',
    color: 'text-amber-500',
    bg: 'bg-amber-500',
    borderColor: 'border-amber-500/30',
    icon: BarChart3,
    features: ['Web analytics', 'Conversion data', 'Traffic sources'],
  },
];

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; color: string; bg: string; borderColor: string }> = {
  connected: { label: 'Connected', color: 'text-emerald-500', bg: 'bg-emerald-500/10', borderColor: 'border-emerald-500/25' },
  available: { label: 'Available', color: 'text-sky-500', bg: 'bg-sky-500/10', borderColor: 'border-sky-500/25' },
  coming_soon: { label: 'Coming Soon', color: 'text-amber-500', bg: 'bg-amber-500/10', borderColor: 'border-amber-500/25' },
};

/* ===== Animation Styles ===== */
const animationStyles = `
@keyframes marketFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes marketScaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes marketToastSlide {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes marketPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.market-animate-in { animation: marketFadeSlideIn 0.5s ease-out both; }
.market-animate-in-d1 { animation: marketFadeSlideIn 0.5s ease-out 0.1s both; }
.market-animate-in-d2 { animation: marketFadeSlideIn 0.5s ease-out 0.2s both; }
.market-animate-in-d3 { animation: marketFadeSlideIn 0.5s ease-out 0.3s both; }
.market-scale-in { animation: marketScaleIn 0.3s ease-out both; }
.market-toast-in { animation: marketToastSlide 0.3s ease-out both; }
`;

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
            i < fullStars
              ? 'text-amber-400 fill-amber-400'
              : i === fullStars && hasHalf
                ? 'text-amber-400 fill-amber-400/50'
                : 'text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

export default function IntegrationMarketplace() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const filteredIntegrations = useMemo(() => {
    return INTEGRATIONS.filter((integration) => {
      const matchesSearch = searchQuery === '' ||
        integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'all' ||
        integration.category.includes(activeCategory as IntegrationCategory);
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  const connectedCount = INTEGRATIONS.filter((i) => i.status === 'connected').length;
  const availableCount = INTEGRATIONS.filter((i) => i.status === 'available').length;

  const handleConnect = useCallback((integration: IntegrationDefinition) => {
    setConnectingId(integration.id);
    setTimeout(() => {
      setConnectingId(null);
      showToast(`${integration.name} connected successfully!`);
    }, 1500);
  }, [showToast]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'market-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-amber-500 to-orange-600">
                  <Plug className="h-4 w-4 text-white" />
                </div>
                Integration Marketplace
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{connectedCount} connected</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
                    <Shield className="h-3 w-3 text-sky-500" />
                    <span className="font-semibold text-sky-600 dark:text-sky-400">{availableCount} available</span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-border/60 bg-background/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all duration-200"
              />
            </div>
          </CardContent>
        </Card>

        {/* Category filter tabs */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'market-animate-in-d1' : 'opacity-0')}>
          <CardContent className="py-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                const count = cat.id === 'all'
                  ? INTEGRATIONS.length
                  : INTEGRATIONS.filter((i) => i.category.includes(cat.id as IntegrationCategory)).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-all duration-200 shrink-0 cursor-pointer',
                      isActive
                        ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/20'
                        : 'border-border/50 text-muted-foreground hover:border-border hover:bg-muted/30'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-primary' : '')} />
                    {cat.label}
                    <span className={cn(
                      'text-[9px] px-1.5 py-0 rounded-full',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Integration Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredIntegrations.map((integration, index) => {
            const statusCfg = STATUS_CONFIG[integration.status];
            const isConnecting = connectingId === integration.id;
            const delayClass = index === 0 ? 'market-animate-in-d1' : index === 1 ? 'market-animate-in-d2' : 'market-animate-in-d3';

            return (
              <Card
                key={integration.id}
                className={cn(
                  'glass-card overflow-hidden transition-all duration-300 hover:shadow-lg group',
                  integration.borderColor,
                  mounted ? delayClass : 'opacity-0'
                )}
              >
                <CardContent className="p-4">
                  {/* Top row: Logo, name, status */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn(
                      'flex items-center justify-center h-12 w-12 rounded-xl text-white font-bold text-sm shrink-0 shadow-md',
                      `bg-gradient-to-br ${integration.bg === 'bg-sky-500' ? 'from-sky-500 to-blue-600' : ''}${integration.bg === 'bg-orange-500' ? 'from-orange-500 to-amber-600' : ''}${integration.bg === 'bg-violet-500' ? 'from-violet-500 to-purple-600' : ''}${integration.bg === 'bg-red-500' ? 'from-red-500 to-rose-600' : ''}${integration.bg === 'bg-indigo-500' ? 'from-indigo-500 to-blue-600' : ''}${integration.bg === 'bg-amber-500' ? 'from-amber-500 to-yellow-600' : ''}`
                    )}>
                      {integration.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold truncate">{integration.name}</h3>
                        <Badge className={cn('text-[8px] px-1.5 py-0 h-4 border shrink-0', statusCfg.bg, statusCfg.color, statusCfg.borderColor)}>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={integration.rating} />
                        <span className="text-[10px] text-muted-foreground font-medium">{integration.rating}</span>
                        <span className="text-[10px] text-muted-foreground/60">({integration.reviewCount.toLocaleString()})</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                    {integration.description}
                  </p>

                  {/* Features */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {integration.features.map((feature) => (
                      <span
                        key={feature}
                        className="text-[9px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/30"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  {/* Bottom row: installs, action */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3" />
                      <span className="font-medium">{integration.installCount}</span> installs
                    </div>

                    {/* Action button */}
                    {integration.status === 'connected' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] h-7 gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => showToast(`${integration.name} settings opened`, 'info')}
                      >
                        <Settings className="h-3 w-3" />
                        Configure
                      </Button>
                    ) : integration.status === 'available' ? (
                      <Button
                        size="sm"
                        className="text-[11px] h-7 gap-1.5"
                        onClick={() => handleConnect(integration)}
                        disabled={isConnecting}
                      >
                        {isConnecting ? (
                          <>
                            <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-3 w-3" />
                            Connect
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] h-7 gap-1.5 text-muted-foreground cursor-not-allowed"
                        disabled
                      >
                        <Clock className="h-3 w-3" />
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredIntegrations.length === 0 && (
          <Card className="glass-card overflow-hidden">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Search className="h-8 w-8 opacity-40" />
                <p className="text-sm font-medium">No integrations found</p>
                <p className="text-xs">Try adjusting your search or category filter</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs mt-2"
                  onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer summary */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'market-animate-in-d3' : 'opacity-0')}>
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing <strong className="text-foreground">{filteredIntegrations.length}</strong> of {INTEGRATIONS.length} integrations
              </span>
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => showToast('Browse all integrations', 'info')}>
                  Browse All <ExternalLink className="h-3 w-3" />
                </button>
                <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => showToast('Request integration form opened', 'info')}>
                  Request Integration <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Toast */}
        {toast && (
          <div
            className={cn(
              'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md market-toast-in',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
