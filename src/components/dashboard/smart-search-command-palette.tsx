'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Command,
  UserPlus,
  HandshakeIcon,
  Phone,
  Mail,
  BarChart3,
  GitBranch,
  Clock,
  TrendingUp,
  Users,
  FileText,
  ArrowRight,
  X,
  Sparkles,
  Filter,
  Star,
  ArrowUpRight,
} from 'lucide-react';

/* ===== Types ===== */
type SearchFilter = 'all' | 'contacts' | 'deals' | 'documents' | 'emails';
type PaletteMode = 'search' | 'command';

interface RecentSearch {
  id: string;
  query: string;
  timestamp: string;
  resultCount: number;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  shortcut?: string;
}

interface ContactResult {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  avatar: string;
}

interface DealResult {
  id: string;
  name: string;
  value: string;
  stage: string;
  company: string;
  stageColor: string;
}

interface DocumentResult {
  id: string;
  name: string;
  type: string;
  date: string;
  icon: string;
}

interface TrendingSearch {
  id: string;
  term: string;
  category: string;
  trend: 'up' | 'down' | 'stable';
  count: string;
}

/* ===== Empty Data — search results come from API, these are defaults ===== */
const RECENT_SEARCHES: RecentSearch[] = [];
const QUICK_ACTIONS: QuickAction[] = [];
const CONTACT_RESULTS: ContactResult[] = [];
const DEAL_RESULTS: DealResult[] = [];
const DOCUMENT_RESULTS: DocumentResult[] = [];
const TRENDING_SEARCHES: TrendingSearch[] = [];

const FILTER_TABS: { key: SearchFilter; label: string; count: number }[] = [
  { key: 'all', label: 'All', count: 0 },
  { key: 'contacts', label: 'Contacts', count: 0 },
  { key: 'deals', label: 'Deals', count: 0 },
  { key: 'documents', label: 'Documents', count: 0 },
  { key: 'emails', label: 'Emails', count: 0 },
];

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
};

const resultVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

/* ===== Search Input Component ===== */
function SearchInput({
  query,
  setQuery,
  mode,
}: {
  query: string;
  setQuery: (q: string) => void;
  mode: PaletteMode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/50 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all duration-200">
        {mode === 'search' ? (
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <Command className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'search' ? 'Search contacts, deals, documents...' : 'Type a command...'}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {query ? (
          <button onClick={() => setQuery('')} className="p-1 rounded-md hover:bg-muted/50 cursor-pointer">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded-md bg-background/80 border border-border/60 text-[10px] font-mono text-muted-foreground shadow-sm">
              ⌘K
            </kbd>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Mode Toggle Component ===== */
function ModeToggle({ mode, setMode }: { mode: PaletteMode; setMode: (m: PaletteMode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border/30">
      <button
        onClick={() => setMode('search')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer',
          mode === 'search'
            ? 'bg-violet-500/10 text-violet-500 shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Search className="h-3.5 w-3.5" />
        Search
      </button>
      <button
        onClick={() => setMode('command')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer',
          mode === 'command'
            ? 'bg-violet-500/10 text-violet-500 shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Command className="h-3.5 w-3.5" />
        Command
      </button>
    </div>
  );
}

/* ===== Quick Actions Section ===== */
function QuickActionsSection({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              variants={resultVariants}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/40 bg-background/50 hover:border-violet-500/30 hover:bg-accent/30 transition-all duration-200 group cursor-pointer text-left"
            >
              <div className={cn('rounded-lg p-1.5 shrink-0 transition-transform duration-200 group-hover:scale-110', action.bg)}>
                <Icon className={cn('h-3.5 w-3.5', action.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate group-hover:text-violet-500 transition-colors">{action.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{action.description}</p>
              </div>
              {action.shortcut && (
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/40 text-[9px] font-mono text-muted-foreground shrink-0">
                  {action.shortcut}
                </kbd>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ===== Recent Searches Section ===== */
function RecentSearchesSection({ searches }: { searches: RecentSearch[] }) {
  if (searches.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Searches</h3>
        </div>
        <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          Clear all
        </button>
      </div>
      <div className="space-y-1">
        {searches.map((search, index) => (
          <motion.button
            key={search.id}
            variants={resultVariants}
            whileHover={{ x: 4 }}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/30 transition-all duration-150 group cursor-pointer text-left"
          >
            <div className="rounded-md p-1.5 bg-muted/30 shrink-0 group-hover:bg-muted/50 transition-colors">
              <Clock className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate group-hover:text-foreground transition-colors">{search.query}</p>
              <p className="text-[10px] text-muted-foreground">{search.timestamp}</p>
            </div>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-0 bg-muted/40 text-muted-foreground shrink-0">
              {search.resultCount} results
            </Badge>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Contact Results Section ===== */
function ContactResultsSection({ contacts }: { contacts: ContactResult[] }) {
  if (contacts.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-3.5 w-3.5 text-emerald-500" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacts</h3>
        <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          {contacts.length}
        </Badge>
      </div>
      <div className="space-y-1">
        {contacts.map((contact, index) => (
          <motion.button
            key={contact.id}
            variants={resultVariants}
            whileHover={{ x: 4 }}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/30 transition-all duration-150 group cursor-pointer text-left"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 ring-2 ring-background group-hover:ring-violet-500/30 transition-all">
              {contact.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate group-hover:text-violet-500 transition-colors">{contact.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{contact.email}</p>
            </div>
            <div className="hidden sm:block text-right shrink-0">
              <p className="text-[10px] font-medium text-muted-foreground">{contact.company}</p>
              <p className="text-[9px] text-muted-foreground/60">{contact.role}</p>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-violet-500 group-hover:opacity-100 opacity-0 transition-all shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Deal Results Section ===== */
function DealResultsSection({ deals }: { deals: DealResult[] }) {
  if (deals.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <HandshakeIcon className="h-3.5 w-3.5 text-blue-500" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deals</h3>
        <Badge className="text-[9px] h-4 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20">
          {deals.length}
        </Badge>
      </div>
      <div className="space-y-1">
        {deals.map((deal) => (
          <motion.button
            key={deal.id}
            variants={resultVariants}
            whileHover={{ x: 4 }}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/30 transition-all duration-150 group cursor-pointer text-left"
          >
            <div className="rounded-lg p-1.5 bg-blue-500/10 shrink-0">
              <HandshakeIcon className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate group-hover:text-blue-500 transition-colors">{deal.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{deal.company}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold tabular-nums">{deal.value}</p>
              <Badge className={cn('text-[8px] h-4 px-1.5 border', deal.stageColor)}>
                {deal.stage}
              </Badge>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-blue-500 group-hover:opacity-100 opacity-0 transition-all shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Document Results Section ===== */
function DocumentResultsSection({ documents }: { documents: DocumentResult[] }) {
  const getDocColor = (type: string) => {
    switch (type) {
      case 'PDF': return 'bg-rose-500/10 text-rose-500';
      case 'Sheet': return 'bg-emerald-500/10 text-emerald-500';
      case 'Video': return 'bg-violet-500/10 text-violet-500';
      default: return 'bg-muted/30 text-muted-foreground';
    }
  };

  if (documents.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-3.5 w-3.5 text-amber-500" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents</h3>
        <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20">
          {documents.length}
        </Badge>
      </div>
      <div className="space-y-1">
        {documents.map((doc) => (
          <motion.button
            key={doc.id}
            variants={resultVariants}
            whileHover={{ x: 4 }}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/30 transition-all duration-150 group cursor-pointer text-left"
          >
            <div className={cn('rounded-lg p-1.5 shrink-0', getDocColor(doc.type))}>
              <span className="text-[9px] font-bold">{doc.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate group-hover:text-amber-500 transition-colors">{doc.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{doc.type} · {doc.date}</p>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-amber-500 group-hover:opacity-100 opacity-0 transition-all shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Trending Searches Section ===== */
function TrendingSearchesSection({ searches }: { searches: TrendingSearch[] }) {
  if (searches.length === 0) return null;
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trending</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map((trend, index) => (
          <motion.button
            key={trend.id}
            variants={resultVariants}
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border/40 bg-background/50 hover:border-violet-500/30 hover:bg-accent/30 transition-all duration-200 group cursor-pointer"
          >
            {trend.trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
            {trend.trend === 'down' && <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />}
            {trend.trend === 'stable' && <span className="w-3 h-3 rounded-full bg-muted-foreground/30" />}
            <span className="text-[11px] font-medium">{trend.term}</span>
            <span className="text-[9px] text-muted-foreground">{trend.count}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Filter Tabs Component ===== */
function FilterTabs({ activeFilter, setActiveFilter, tabs }: { activeFilter: SearchFilter; setActiveFilter: (f: SearchFilter) => void; tabs: typeof FILTER_TABS }) {
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</h3>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer',
              activeFilter === tab.key
                ? 'bg-violet-500/10 text-violet-500 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.label}
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-4 px-1.5 border-0',
                activeFilter === tab.key ? 'bg-violet-500/20 text-violet-500' : 'bg-muted/50 text-muted-foreground'
              )}
            >
              {tab.count}
            </Badge>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ===== Main Component ===== */
export default function SmartSearchCommandPalette() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<PaletteMode>('search');
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const [activeSection, setActiveSection] = useState<'results' | 'recent' | 'trending'>('recent');

  const filteredContacts = activeFilter === 'all' || activeFilter === 'contacts'
    ? CONTACT_RESULTS.filter((c) =>
        !query ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.email.toLowerCase().includes(query.toLowerCase()) ||
        c.company.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const filteredDeals = activeFilter === 'all' || activeFilter === 'deals'
    ? DEAL_RESULTS.filter((d) =>
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.company.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const filteredDocs = activeFilter === 'all' || activeFilter === 'documents'
    ? DOCUMENT_RESULTS.filter((d) =>
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const totalResults = filteredContacts.length + filteredDeals.length + filteredDocs.length;

  const hasResults = query.length > 0 && totalResults > 0;
  const hasNoResults = query.length > 0 && totalResults === 0;
  const showDefault = query.length === 0;

  const sectionForDisplay = showDefault ? activeSection : 'results';

  // Compute filter tab counts from actual data
  const filterTabsWithCounts = FILTER_TABS.map(tab => ({
    ...tab,
    count: tab.key === 'all'
      ? CONTACT_RESULTS.length + DEAL_RESULTS.length + DOCUMENT_RESULTS.length
      : tab.key === 'contacts'
        ? CONTACT_RESULTS.length
        : tab.key === 'deals'
          ? DEAL_RESULTS.length
          : tab.key === 'documents'
            ? DOCUMENT_RESULTS.length
            : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
              <Search className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Smart Search</h2>
              <p className="text-xs text-muted-foreground">
                {mode === 'search' ? 'Find anything across your workspace' : 'Execute commands quickly'}
              </p>
            </div>
          </div>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>
      </motion.div>

      {/* Search Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
      >
        <SearchInput query={query} setQuery={setQuery} mode={mode} />
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <FilterTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} tabs={filterTabsWithCounts} />
      </motion.div>

      {/* Content Area with Animated Transitions */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {/* Search Results View */}
          {sectionForDisplay === 'results' && hasResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Results Count */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
                </p>
                <Badge variant="outline" className="text-[10px] h-5 px-2 bg-violet-500/5 text-violet-500 border-violet-500/20">
                  <Star className="h-2.5 w-2.5 mr-1" />
                  Best match first
                </Badge>
              </div>

              {/* Contact Results */}
              {filteredContacts.length > 0 && (
                <ContactResultsSection contacts={filteredContacts} />
              )}

              {/* Deal Results */}
              {filteredDeals.length > 0 && (
                <DealResultsSection deals={filteredDeals} />
              )}

              {/* Document Results */}
              {filteredDocs.length > 0 && (
                <DocumentResultsSection documents={filteredDocs} />
              )}
            </motion.div>
          )}

          {/* No Results */}
          {sectionForDisplay === 'results' && hasNoResults && (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="rounded-2xl p-4 bg-muted/30 mb-4">
                <Search className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                Try adjusting your search terms or filters to find what you&apos;re looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => { setQuery(''); setActiveFilter('all'); }}
              >
                Clear search
              </Button>
            </motion.div>
          )}

          {/* Default View: Recent / Trending */}
          {showDefault && (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Quick Actions - Always visible in default */}
              <QuickActionsSection actions={QUICK_ACTIONS} />

              {/* Recent Searches */}
              <RecentSearchesSection searches={RECENT_SEARCHES} />

              {/* Suggested Results (always shown in default) */}
              {(CONTACT_RESULTS.length > 0 || DEAL_RESULTS.length > 0 || DOCUMENT_RESULTS.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ContactResultsSection contacts={CONTACT_RESULTS} />
                  <div className="space-y-6">
                    <DealResultsSection deals={DEAL_RESULTS} />
                    <DocumentResultsSection documents={DOCUMENT_RESULTS} />
                  </div>
                </div>
              )}

              {/* Empty state when no data at all */}
              {RECENT_SEARCHES.length === 0 && QUICK_ACTIONS.length === 0 && CONTACT_RESULTS.length === 0 && DEAL_RESULTS.length === 0 && DOCUMENT_RESULTS.length === 0 && TRENDING_SEARCHES.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-2xl p-4 bg-muted/30 mb-4">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">No search data available</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                    Search results, recent searches, and quick actions will appear here as data becomes available.
                  </p>
                </div>
              )}

              {/* Trending Searches */}
              <TrendingSearchesSection searches={TRENDING_SEARCHES} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/40 text-[9px] font-mono shadow-sm">⌘</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/40 text-[9px] font-mono shadow-sm">K</kbd>
              <span className="ml-1">to focus</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/40 text-[9px] font-mono shadow-sm">Esc</kbd>
              <span>to clear</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>Indexed: <strong className="text-foreground">0</strong> records</span>
            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
              Live
            </Badge>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
