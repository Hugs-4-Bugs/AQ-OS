'use client';

import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  GitBranchPlus,
  Search,
  Send,
  Bot,
  BarChart3,
  HandshakeIcon,
  Shield,
  LayoutGrid,
  Menu,
  X,
  Rocket,
  Keyboard,
  Clock,
  Sparkles,
  MoreHorizontal,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  GitBranch,
  User,
  CreditCard,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuShortcut } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore, pathToTab } from '@/lib/store';
import type { TabId } from '@/lib/types';
import { fetchReminders } from '@/lib/api';
import { useNotificationStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settings-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useAuth } from '@/hooks/use-auth';
import { useLegalStore } from '@/lib/legal-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import NotificationCenter from './notification-center';
const OverviewTab = React.lazy(() => import('./overview-tab'));
const LeadsTab = React.lazy(() => import('./leads-tab'));
const PipelineTab = React.lazy(() => import('./pipeline-tab'));
const DiscoverTab = React.lazy(() => import('./discover-tab'));
const OutreachTab = React.lazy(() => import('./outreach-tab'));
const MessagingTab = React.lazy(() => import('./messaging-tab'));
const AssistantTab = React.lazy(() => import('./assistant-tab'));
const InsightsTab = React.lazy(() => import('./insights-tab'));
const DealsTab = React.lazy(() => import('./deals-tab'));
const CompetitorTab = React.lazy(() => import('./competitor-tab'));
const SettingsShell = React.lazy(() => import('./settings-shell'));
const WorkflowsTab = React.lazy(() => import('./workflows-tab'));
import PlanGate from './plan-gate';
import CreditGate from './credit-gate';
import { ErrorBoundary } from '@/components/error-boundary';
import { SkeletonPage } from '@/components/skeleton-page';
import ShortcutsDialog from './shortcuts-dialog';
import CommandPalette from './command-palette';
import QuickActionsFAB from './quick-actions-fab';
import FollowUpReminders from './follow-up-reminders';
// FIX 10: SettingsPanel floating mini-panel import REMOVED — the settings
// gear icon in the navbar switches the dashboard tab to 'settings' which
// renders the full-page SettingsShell instead of a floating mini-panel.
import OnboardingFlow from './onboarding-flow';
import CookieConsent from './cookie-consent';
import CreditDisplay from './credit-display';
import UpgradeModal from './upgrade-modal';
import AIChatBubble from './ai-chat-bubble';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
// PART 5 — processes Stripe redirect params (?payment=success&session_id=…,
// ?credits_added=true&session_id=…, ?payment=cancelled) on dashboard mount:
// verifies the session server-side, activates the plan/credits and shows
// the "Welcome to [Plan Name]!" toast.
import { usePaymentRedirect } from '@/hooks/use-payment-redirect';
// FIX 5: FloatingFeedbackButton dead import removed — it rendered at the
// exact same position (bottom 80px right 20px) as the FeedbackProvider
// button mounted in the root layout, causing button overlap.
import { initAutoCapture } from '@/lib/feedback/auto-capture';
import { initCrashReporter, setCrashReporterUser } from '@/lib/feedback/crash-reporter';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  shortLabel?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, shortLabel: 'Home' },
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
  { id: 'outreach', label: 'Outreach', icon: Send },
  { id: 'workflows', label: 'Workflows', icon: GitBranch, shortLabel: 'Flows' },
  { id: 'messaging', label: 'Messaging', icon: MessageSquare, shortLabel: 'Msgs' },
  { id: 'assistant', label: 'Assistant', icon: Bot, shortLabel: 'AI' },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'deals', label: 'Deals', icon: HandshakeIcon },
  { id: 'competitors', label: 'Competitors', icon: Shield, shortLabel: 'Rivals' },
  { id: 'settings', label: 'Settings', icon: Settings, shortLabel: 'Config' },
];

function SidebarNav({
  activeTab,
  onTabChange,
  className,
  orientation = 'vertical',
  collapsed = false,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  collapsed?: boolean;
}) {
  return (
    <nav role="navigation" aria-label="Main navigation" className={cn('flex gap-1', orientation === 'vertical' ? 'flex-col' : 'flex-row', className)}>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const button = (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'relative flex items-center rounded-lg text-sm font-medium transition-all duration-200',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground',
              orientation === 'horizontal' && 'flex-col gap-1 px-2 py-1.5 text-xs'
            )}
          >
            <Icon className="shrink-0 h-4 w-4" />
            {!collapsed && <span className={cn(orientation === 'horizontal' && 'hidden sm:inline')}>{item.label}</span>}
            {isActive && orientation === 'vertical' && !collapsed && (
              <motion.div
                layoutId="sidebar-indicator"
                className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            {isActive && orientation === 'vertical' && collapsed && (
              <motion.div
                layoutId="sidebar-indicator-collapsed"
                className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            {isActive && orientation === 'horizontal' && (
              <motion.div
                layoutId="mobile-indicator"
                className="absolute -bottom-1 h-0.5 w-6 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        );

        if (collapsed && orientation === 'vertical') {
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                {button}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        }

        return button;
      })}
    </nav>
  );
}

/* ===== Live Clock Component ===== */
function LiveClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span className="font-mono tabular-nums">{time || '--:--:--'}</span>
    </div>
  );
}

/* ===== Mobile Bottom Nav Item ===== */
function MobileNavItem({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 xs:px-2 py-1 text-[10px] xs:text-xs transition-all duration-200 active:scale-95 min-w-0 flex-1',
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <div className={cn(
        'rounded-md p-0.5 xs:p-1 transition-all duration-200',
        isActive && 'bg-primary/10'
      )}>
        <Icon className="h-4 w-4 xs:h-[18px] xs:w-[18px]" />
      </div>
      <span className={cn(
        'truncate max-w-[48px] xs:max-w-none transition-all duration-200',
        isActive && 'font-semibold'
      )}>{item.shortLabel || item.label}</span>
      {isActive && (
        <motion.div
          layoutId="bottom-nav-glow"
          className="absolute -top-px left-1 right-1 h-0.5 rounded-full bg-primary"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}
    </button>
  );
}

export default function DashboardLayout({
  externalUpgradeModalOpen,
  onExternalUpgradeModalChange,
}: {
  externalUpgradeModalOpen?: boolean;
  onExternalUpgradeModalChange?: (open: boolean) => void;
}) {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  // FIX 10: settingsOpen mini-panel state removed — the settings gear icon
  // navigates directly to the full-page settings tab (setActiveTab('settings')).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [internalUpgradeModalOpen, setInternalUpgradeModalOpen] = useState(false);

  // Use external modal control if provided, otherwise use internal state
  const upgradeModalOpen = externalUpgradeModalOpen ?? internalUpgradeModalOpen;
  const setUpgradeModalOpen = onExternalUpgradeModalChange ?? setInternalUpgradeModalOpen;

  const currentPlanName = useSubscriptionStore((s) => s.getPlanDetails().name);
  const rolloverCredits = useSubscriptionStore((s) => s.rolloverCredits);
  const addonCredits = useSubscriptionStore((s) => s.addonCredits);
  const creditWarningStatus = useSubscriptionStore((s) => s.creditWarningStatus);

  // Get real user data from auth store
  const authUser = useAuthStore((s) => s.user);
  const { signOut } = useAuth();

  // Compute user initials from real name
  const userInitials = authUser?.name
    ? authUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';
  const userDisplayName = authUser?.name || 'Unknown User';
  const userEmail = authUser?.email || '';
  const userAvatarUrl = authUser?.avatarUrl || null;

  // Check if onboarding should show on first visit (hydration-safe via useSyncExternalStore)
  const onboardingCompleted = useSyncExternalStore(
    (callback) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    () => localStorage.getItem('acquisitionos_onboarding_completed') !== null,
    () => true // Server: assume completed (don't show onboarding during SSR)
  );
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  if (!onboardingChecked && !onboardingCompleted) {
    setOnboardingChecked(true);
    setOnboardingOpen(true);
  }
  if (!onboardingChecked && onboardingCompleted) {
    setOnboardingChecked(true);
  }

  const reminderCheckInterval = useSettingsStore((s) => s.reminderCheckInterval);

  const handleShowShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const handleOpenCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);

  useKeyboardShortcuts({
    onShowShortcuts: handleShowShortcuts,
    onOpenCommandPalette: handleOpenCommandPalette,
    onNewLead: useCallback(() => {
      setActiveTab('leads');
    }, [setActiveTab]),
  });

  // Listen for custom event from Command Palette to show shortcuts dialog
  useEffect(() => {
    const handler = () => {
      setCommandPaletteOpen(false);
      setTimeout(() => setShortcutsOpen(true), 150);
    };
    window.addEventListener('show-shortcuts', handler);
    return () => window.removeEventListener('show-shortcuts', handler);
  }, []);

  // Overdue reminder notifications - check every 60s
  const notifiedReminderIds = useRef<Set<string>>(new Set());
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const checkOverdueReminders = async () => {
      try {
        const overdueReminders = await fetchReminders(true);
        for (const reminder of overdueReminders) {
          if (!notifiedReminderIds.current.has(reminder.id)) {
            notifiedReminderIds.current.add(reminder.id);
            addNotification({
              type: 'stage_advanced',
              title: 'Follow-up Overdue',
              message: `${reminder.lead?.businessName ?? 'Unknown Lead'}: ${reminder.message.slice(0, 50)}`,
              timestamp: new Date(),
            });
          }
        }
      } catch {
        // Silently ignore errors in polling
      }
    };

    checkOverdueReminders();
    const interval = setInterval(checkOverdueReminders, reminderCheckInterval * 1000);
    return () => clearInterval(interval);
  }, [addNotification, reminderCheckInterval]);

  // ===== URL-to-Tab Synchronization =====
  // Reads the URL path on mount and popstate, and sets the active tab accordingly.
  // This enables direct navigation to /business-ai/leads, /business-ai/outreach, etc.
  useEffect(() => {
    const syncTabFromUrl = () => {
      const tab = pathToTab(window.location.pathname);
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
      }
    };
    // Sync on mount
    syncTabFromUrl();
    // Sync on back/forward navigation
    window.addEventListener('popstate', syncTabFromUrl);
    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, []);

  // ===== Stripe payment redirect handling (PART 5) =====
  usePaymentRedirect();

  // ===== "Upgrade Plan" button in Settings → Billing =====
  // settings-shell dispatches the 'open-upgrade-modal' CustomEvent; this is
  // the (previously missing) listener that actually opens the modal.
  useEffect(() => {
    const openUpgradeModal = () => setUpgradeModalOpen(true);
    window.addEventListener('open-upgrade-modal', openUpgradeModal);
    return () => window.removeEventListener('open-upgrade-modal', openUpgradeModal);
  }, [setUpgradeModalOpen]);

  const renderTab = () => {
    const content = (
      <Suspense fallback={<SkeletonPage />}>
        {(() => {
          switch (activeTab) {
            case 'overview': return <OverviewTab />;
            case 'leads': return <LeadsTab />;
            case 'pipeline': return <PipelineTab />;
            case 'discover': return <CreditGate action="lead_discovery" onUpgrade={() => setUpgradeModalOpen(true)}><DiscoverTab /></CreditGate>;
            case 'outreach': return <CreditGate action="outreach_message" onUpgrade={() => setUpgradeModalOpen(true)}><OutreachTab /></CreditGate>;
            case 'workflows': return <PlanGate requiredPlan="pro" featureName="Workflows" onUpgrade={() => setUpgradeModalOpen(true)}><WorkflowsTab /></PlanGate>;
            case 'messaging': return <MessagingTab />;
            case 'assistant': return <CreditGate action="sales_coaching" onUpgrade={() => setUpgradeModalOpen(true)}><AssistantTab /></CreditGate>;
            case 'insights': return <InsightsTab />;
            case 'deals': return <DealsTab />;
            case 'competitors': return <PlanGate requiredPlan="pro" featureName="Competitor Analysis" onUpgrade={() => setUpgradeModalOpen(true)}><CompetitorTab /></PlanGate>;
            case 'settings': return <SettingsShell />;
            default: return <OverviewTab />;
          }
        })()}
      </Suspense>
    );
    return content;
  };

  // Mobile bottom nav: show 5 items directly + More for the remaining 3
  const primaryNavItems = NAV_ITEMS.slice(0, 5);
  const secondaryNavItems = NAV_ITEMS.slice(5);
  const isMoreActive = secondaryNavItems.some((item) => item.id === activeTab);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
        Skip to content
      </a>
      {/* ===== Mobile Header - Sticky at Top ===== */}
      {/* FIX 8: z-[100] (was z-50) so the mobile navbar sits ABOVE any
          overlay-style layers (Radix sheets/dialogs render at z-50) and
          its icons stay clickable even when a panel is open. */}
      <header role="banner" className="sticky top-0 flex h-12 sm:h-14 items-center gap-2 sm:gap-4 border-b bg-background/95 backdrop-blur-md px-2 sm:px-4 lg:hidden primary-accent-line shrink-0 z-[100]">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">Navigation sidebar</SheetDescription>
            <div className="flex h-14 items-center border-b px-4 gradient-bg-animated">
              <Rocket className="h-6 w-6 text-primary mr-2" />
              <span className="font-bold text-lg gradient-text">AcquisitionOS</span>
            </div>
            <ScrollArea className="h-[calc(100vh-3.5rem)]">
              <div className="p-4">
                <SidebarNav
                  activeTab={activeTab}
                  onTabChange={(tab) => {
                    setActiveTab(tab);
                    setSidebarOpen(false);
                  }}
                />
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <span className="font-bold text-sm sm:text-base gradient-text">AcquisitionOS</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
          <CreditDisplay compact onClick={() => setUpgradeModalOpen(true)} rolloverCredits={rolloverCredits} addonCredits={addonCredits} />
          <NotificationCenter />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Command palette"
          >
            <Search className="h-4 w-4" />
          </Button>
          <ThemeToggle size="sm" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="User menu">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">{userInitials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userDisplayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                  <Badge variant="outline" className="w-fit text-[10px] mt-1">{currentPlanName} Plan</Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUpgradeModalOpen(true)} className="cursor-pointer">
                <CreditCard className="mr-2 h-4 w-4" /> Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { await signOut(); }} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20">
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground hidden md:inline">
            {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
          </span>
        </div>
      </header>

      {/* ===== Middle Section: Sidebar + Content ===== */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar - Collapsible */}
        <aside className={cn(
          "hidden lg:flex lg:flex-col lg:border-r bg-sidebar shrink-0 transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "lg:w-16" : "lg:w-60"
        )}>
          {/* Logo */}
          <div className="flex h-14 items-center gap-2 border-b px-4 gradient-bg-animated shrink-0">
            <Rocket className="h-6 w-6 text-primary shrink-0" />
            {!sidebarCollapsed && <span className="font-bold text-lg tracking-tight gradient-text">AcquisitionOS</span>}
          </div>
          <ScrollArea className="flex-1 py-4">
            <div className={cn("relative", sidebarCollapsed ? "px-2" : "px-3")}>
              <TooltipProvider>
                <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} collapsed={sidebarCollapsed} />
              </TooltipProvider>
            </div>
          </ScrollArea>
          {/* Collapsible sections - hidden when collapsed */}
          {!sidebarCollapsed && (
            <>
              {/* Credits Display */}
              <div className="border-t px-3 py-2 shrink-0">
                <CreditDisplay onClick={() => setUpgradeModalOpen(true)} rolloverCredits={rolloverCredits} addonCredits={addonCredits} />
              </div>
              {/* Notification Center */}
              <div className="border-t px-3 py-2 flex items-center justify-between shrink-0">
                <span className="text-xs font-medium text-muted-foreground">Notifications</span>
                <NotificationCenter />
              </div>
              {/* Follow-up Reminders */}
              <div className="border-t shrink-0">
                <FollowUpReminders />
              </div>
            </>
          )}
          {/* User Profile + Theme Toggle (real user data) */}
          <div className="border-t p-4 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-lg p-1 -m-1 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !sidebarCollapsed ? "gap-3" : "justify-center"
                  )}
                  aria-label="User menu"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{userInitials}</AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{userDisplayName}</p>
                        <p className="text-xs text-primary/70 truncate">{currentPlanName} Plan</p>
                      </div>
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userDisplayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                    <Badge variant="outline" className="w-fit text-[10px] mt-1">{currentPlanName} Plan</Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUpgradeModalOpen(true)} className="cursor-pointer">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => { await signOut(); }}
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!sidebarCollapsed && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Theme</span>
                <ThemeToggle size="sm" />
              </div>
            )}
          </div>
          {/* Collapse Toggle Button */}
          <div className="border-t p-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground mx-auto flex"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        {/* Desktop Topbar + Main Content */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Desktop Topbar */}
          <header role="banner" className="hidden lg:flex sticky top-0 z-[100] h-14 items-center gap-4 border-b bg-background/95 backdrop-blur-md px-6 shrink-0">
            <h1 className="text-lg font-semibold">{NAV_ITEMS.find((n) => n.id === activeTab)?.label}</h1>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setCommandPaletteOpen(true)} aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
              <CreditDisplay onClick={() => setUpgradeModalOpen(true)} rolloverCredits={rolloverCredits} addonCredits={addonCredits} />
              <NotificationCenter />
              <ThemeToggle size="sm" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setActiveTab('settings')} aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
              {/* Profile dropdown with real user data */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="User menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{userInitials}</AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userDisplayName}</p>
                      <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                      <Badge variant="outline" className="w-fit text-[10px] mt-1">{currentPlanName} Plan</Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                    <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('settings')} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                    <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setUpgradeModalOpen(true)} className="cursor-pointer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => { await signOut(); }}
                    className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          {/* Main Content Area */}
          <main role="main" id="main-content" aria-label={NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Content'} className="flex-1 overflow-auto bg-grid relative min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="h-full"
              >
                <ErrorBoundary>{renderTab()}</ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* ===== Mobile Bottom Nav - Sticky at Bottom ===== */}
      <div role="navigation" aria-label="Mobile navigation" className="lg:hidden shrink-0 border-t bg-background/95 backdrop-blur-md safe-bottom mt-auto z-[200]">
        <nav className="flex items-center justify-around px-0.5 xs:px-1 sm:px-2 py-0.5 sm:py-1">
          {primaryNavItems.map((item) => (
            <MobileNavItem
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
            />
          ))}
          {/* More Button for secondary tabs */}
          <button
            onClick={() => setMoreNavOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 xs:px-2 py-1 text-[10px] xs:text-xs transition-all duration-200 active:scale-95 min-w-0 flex-1',
              isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn(
              'rounded-md p-0.5 xs:p-1 transition-all duration-200',
              isMoreActive && 'bg-primary/10'
            )}>
              <MoreHorizontal className="h-4 w-4 xs:h-[18px] xs:w-[18px]" />
            </div>
            <span className={cn(
              'truncate transition-all duration-200',
              isMoreActive && 'font-semibold'
            )}>More</span>
            {isMoreActive && (
              <motion.div
                layoutId="bottom-nav-glow-more"
                className="absolute -top-px left-1 right-1 h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
          <Sheet open={moreNavOpen} onOpenChange={setMoreNavOpen}>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetTitle className="sr-only">More Navigation</SheetTitle>
              <SheetDescription className="sr-only">Additional navigation tabs</SheetDescription>
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">More Tabs</h3>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMoreNavOpen(false)}>
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {secondaryNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMoreNavOpen(false);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl p-4 transition-all duration-200 active:scale-95',
                          'hover:bg-accent',
                          isActive && 'bg-primary/10 ring-1 ring-primary/20'
                        )}
                      >
                        <Icon className={cn('h-6 w-6', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('text-xs', isActive && 'font-semibold text-primary')}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
        {/* Mobile mini footer bar */}
        <div className="border-t px-3 py-1 flex items-center justify-between text-[9px] xs:text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm">
          <Badge variant="outline" className="font-mono text-[8px] xs:text-[9px] h-3.5 px-1">v3.0.0</Badge>
          <span className="text-center truncate mx-2">AcquisitionOS &mdash; Client Acquisition</span>
          {/* PART 8: AI icon removed from the footer bar */}
          <span className="shrink-0">&nbsp;</span>
        </div>
      </div>

      {/* ===== Desktop Footer - Sticky at Bottom (Part 8: Crafted with heart + LinkedIn link) ===== */}
      <footer role="contentinfo" className="border-t bg-background py-2.5 px-4 sm:px-6 text-xs text-muted-foreground hidden lg:flex items-center justify-between gap-4 relative overflow-hidden shrink-0 mt-auto">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 shrink-0">v3.0.0</Badge>
        <span className="flex-1 text-center truncate px-2">
          AcquisitionOS &mdash; AI-Powered Client Acquisition System
        </span>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => useLegalStore.getState().openLegal('privacy')}
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </button>
          <span className="text-muted-foreground/30">·</span>
          <button
            type="button"
            onClick={() => useLegalStore.getState().openLegal('terms')}
            className="hover:text-foreground transition-colors"
          >
            Terms
          </button>
          <span className="text-muted-foreground/30">·</span>
          <LiveClock />
          <span className="flex items-center gap-1 text-foreground">
            Crafted with <span className="text-red-500">❤️</span> by{' '}
            <a
              href="https://www.linkedin.com/company/quantumfusion-solutions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              QuantumFusion Solutions
            </a>
          </span>
        </div>
      </footer>

      {/* Command Palette */}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

      {/* Keyboard Shortcuts Dialog */}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Quick Actions FAB (desktop only) */}
      <QuickActionsFAB />

      {/* Onboarding Flow */}
      <OnboardingFlow
        open={onboardingOpen}
        onComplete={() => setOnboardingOpen(false)}
      />

      {/* Cookie Consent Banner */}
      <CookieConsent />

      {/* Upgrade Modal */}
      <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />

      {/* AI Chat Bubble (floating) */}
      <AIChatBubble />
    </div>
  );
}
