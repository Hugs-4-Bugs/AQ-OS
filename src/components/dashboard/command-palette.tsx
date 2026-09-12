'use client';

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Plus,
  Download,
  Upload,
  Sun,
  Moon,
  Keyboard,
  Building2,
  Clock,
  FileText,
  Zap,
  Target,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { fetchLeads, fetchDeals } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { STAGE_LABELS, type TabId } from '@/lib/types';
import { toast } from 'sonner';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TabNavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TAB_NAV: TabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranchPlus },
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'outreach', label: 'Outreach', icon: Send },
  { id: 'assistant', label: 'Assistant', icon: Bot },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'deals', label: 'Deals', icon: HandshakeIcon },
  { id: 'competitors', label: 'Competitors', icon: Shield },
];

// ─── Recent Searches (localStorage) ──────────────────────

const RECENT_SEARCHES_KEY = 'acq-os-recent-searches';
const MAX_RECENT_SEARCHES = 8;

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(RECENT_SEARCHES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  if (!query.trim()) return;
  const existing = getRecentSearches();
  const updated = [query, ...existing.filter((s) => s !== query)].slice(0, MAX_RECENT_SEARCHES);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

// ─── Score Badge Component ───────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-red-500';
  const bg = score >= 70 ? 'bg-emerald-500/15' : score >= 40 ? 'bg-amber-500/15' : 'bg-red-500/15';
  return (
    <span className={cn('text-[10px] font-mono font-bold px-1.5 py-0.5 rounded', color, bg)}>
      {score}%
    </span>
  );
}

function cn(...inputs: (string | boolean | undefined)[]) {
  return inputs.filter(Boolean).join(' ');
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { setActiveTab, setSelectedLeadId } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    return getRecentSearches();
  });

  // Fetch all leads for search
  const { data: leadsResult } = useQuery({
    queryKey: ['leads', { limit: 200 }],
    queryFn: () => fetchLeads({ limit: 200 }),
    enabled: open,
  });

  const leads = leadsResult?.leads ?? [];

  // Fetch all deals for search
  const { data: deals } = useQuery({
    queryKey: ['deals'],
    queryFn: () => fetchDeals(),
    enabled: open,
  });

  // Filter leads based on search
  const filteredLeads = search.trim()
    ? leads.filter((lead) => {
        const q = search.toLowerCase();
        return (
          lead.businessName.toLowerCase().includes(q) ||
          (lead.ownerName && lead.ownerName.toLowerCase().includes(q)) ||
          (lead.email && lead.email.toLowerCase().includes(q)) ||
          (lead.niche && lead.niche.toLowerCase().includes(q))
        );
      })
    : [];

  // Filter deals based on search
  const filteredDeals = search.trim()
    ? (deals ?? []).filter((deal) => {
        const q = search.toLowerCase();
        return (
          (deal.projectType && deal.projectType.toLowerCase().includes(q)) ||
          (deal.lead?.businessName && deal.lead.businessName.toLowerCase().includes(q))
        );
      })
    : [];

  const navigateToTab = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId);
      onOpenChange(false);
    },
    [setActiveTab, onOpenChange]
  );

  const selectLead = useCallback(
    (leadId: string) => {
      setSelectedLeadId(leadId);
      setActiveTab('leads');
      if (search.trim()) {
        addRecentSearch(search.trim());
        setRecentSearches(getRecentSearches());
      }
      onOpenChange(false);
    },
    [setSelectedLeadId, setActiveTab, onOpenChange, search]
  );

  const handleToggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    onOpenChange(false);
    toast.success(`Switched to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }, [theme, setTheme, onOpenChange]);

  const handleCreateNewLead = useCallback(() => {
    setActiveTab('leads');
    onOpenChange(false);
    toast.info('Create a new lead from the Leads tab');
  }, [setActiveTab, onOpenChange]);

  const handleDiscoverBusinesses = useCallback(() => {
    setActiveTab('discover');
    onOpenChange(false);
  }, [setActiveTab, onOpenChange]);

  const handleGenerateReport = useCallback(() => {
    setActiveTab('insights');
    onOpenChange(false);
    toast.info('View and export reports from the Insights tab');
  }, [setActiveTab, onOpenChange]);

  const handleExportData = useCallback(() => {
    setActiveTab('leads');
    onOpenChange(false);
    toast.info('Use the Export button on the Leads tab');
  }, [setActiveTab, onOpenChange]);

  const handleShowShortcuts = useCallback(() => {
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent('show-shortcuts'));
  }, [onOpenChange]);

  const handleRecentSearchClick = useCallback((query: string) => {
    setSearch(query);
  }, []);

  const handleClearRecentSearches = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
    toast.success('Recent searches cleared');
  }, []);

  // Handle close with search reset
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch('');
    }
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  // Determine if we have search results
  const hasSearchResults = filteredLeads.length > 0 || filteredDeals.length > 0;
  const hasNoResults = search.trim() && !hasSearchResults;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Search leads, deals, navigate tabs, and run actions"
    >
      <CommandInput
        placeholder="Search leads, deals, or type a command..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Recent Searches - only when no search query */}
        {!search.trim() && recentSearches.length > 0 && (
          <CommandGroup heading="Recent Searches">
            {recentSearches.slice(0, 5).map((query, idx) => (
              <CommandItem
                key={`recent-${idx}`}
                value={`recent-${query}`}
                onSelect={() => handleRecentSearchClick(query)}
                className="cursor-pointer"
              >
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">{query}</span>
                <span className="text-[10px] text-muted-foreground">search</span>
              </CommandItem>
            ))}
            <CommandItem
              value="clear-recent-searches"
              onSelect={handleClearRecentSearches}
              className="cursor-pointer text-muted-foreground"
            >
              <XIcon className="h-4 w-4" />
              <span className="text-sm">Clear recent searches</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Lead Search Results */}
        {filteredLeads.length > 0 && (
          <CommandGroup heading={`Leads (${filteredLeads.length})`}>
            {filteredLeads.slice(0, 8).map((lead) => (
              <CommandItem
                key={lead.id}
                value={`lead-${lead.businessName}-${lead.ownerName ?? ''}`}
                onSelect={() => selectLead(lead.id)}
                className="cursor-pointer"
              >
                <Building2 className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{lead.businessName}</span>
                    <ScoreBadge score={lead.conversionScore} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lead.niche && `${lead.niche} · `}{lead.country}
                    {lead.ownerName && ` · ${lead.ownerName}`}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {STAGE_LABELS[lead.stage as keyof typeof STAGE_LABELS]}
                </Badge>
              </CommandItem>
            ))}
            {filteredLeads.length > 8 && (
              <CommandItem disabled className="text-xs text-muted-foreground justify-center">
                +{filteredLeads.length - 8} more leads
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {/* Deal Search Results */}
        {filteredDeals.length > 0 && (
          <CommandGroup heading={`Deals (${filteredDeals.length})`}>
            {filteredDeals.slice(0, 5).map((deal) => (
              <CommandItem
                key={deal.id}
                value={`deal-${deal.projectType ?? 'deal'}-${deal.lead?.businessName ?? ''}`}
                onSelect={() => {
                  if (deal.leadId) {
                    setSelectedLeadId(deal.leadId);
                  }
                  setActiveTab('deals');
                  onOpenChange(false);
                }}
                className="cursor-pointer"
              >
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{deal.projectType || 'Untitled Deal'}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{deal.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {deal.lead?.businessName || 'No business'}
                    {deal.proposedPrice ? ` · $${deal.proposedPrice.toLocaleString()}` : ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Quick Actions - always visible when no search */}
        {!search.trim() && (
          <CommandGroup heading="Quick Actions">
            <CommandItem
              value="action-create-lead"
              onSelect={handleCreateNewLead}
              className="cursor-pointer"
            >
              <Plus className="h-4 w-4 text-emerald-500" />
              <span>Create New Lead</span>
            </CommandItem>
            <CommandItem
              value="action-discover"
              onSelect={handleDiscoverBusinesses}
              className="cursor-pointer"
            >
              <Search className="h-4 w-4 text-sky-500" />
              <span>Discover Businesses</span>
            </CommandItem>
            <CommandItem
              value="action-report"
              onSelect={handleGenerateReport}
              className="cursor-pointer"
            >
              <BarChart3 className="h-4 w-4 text-amber-500" />
              <span>Generate Report</span>
            </CommandItem>
            <CommandItem
              value="action-export"
              onSelect={handleExportData}
              className="cursor-pointer"
            >
              <Download className="h-4 w-4 text-violet-500" />
              <span>Export Data</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Navigate Tabs */}
        <CommandGroup heading="Navigate">
          {TAB_NAV.map((tab) => {
            const Icon = tab.icon;
            return (
              <CommandItem
                key={tab.id}
                value={`navigate-${tab.label.toLowerCase()}`}
                onSelect={() => navigateToTab(tab.id)}
                className="cursor-pointer"
              >
                <Icon className="h-4 w-4" />
                <span>Go to {tab.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {TAB_NAV.indexOf(tab) + 1}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* Other Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="action-export-leads"
            onSelect={handleExportData}
            className="cursor-pointer"
          >
            <Download className="h-4 w-4 text-sky-500" />
            <span>Export Leads</span>
          </CommandItem>
          <CommandItem
            value="action-import-csv"
            onSelect={() => {
              setActiveTab('leads');
              onOpenChange(false);
              toast.info('Use the Import button on the Leads tab');
            }}
            className="cursor-pointer"
          >
            <Upload className="h-4 w-4 text-amber-500" />
            <span>Import CSV</span>
          </CommandItem>
          <CommandItem
            value="action-toggle-theme"
            onSelect={handleToggleTheme}
            className="cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-violet-400" />
            )}
            <span>Toggle Theme</span>
          </CommandItem>
          <CommandItem
            value="action-show-shortcuts"
            onSelect={handleShowShortcuts}
            className="cursor-pointer"
          >
            <Keyboard className="h-4 w-4 text-violet-500" />
            <span>Show Keyboard Shortcuts</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}
