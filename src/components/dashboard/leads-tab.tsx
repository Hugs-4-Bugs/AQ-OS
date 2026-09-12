'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ArrowUpDown,
  MoreHorizontal,
  Mail,
  Phone,
  Trash2,
  Eye,
  Filter,
  Download,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Plus,
  MapPin,
  Loader2,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchLeads, deleteLead, updateLead } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_ORDER,
  NICHE_OPTIONS,
  COUNTRY_OPTIONS,
  type Lead,
  type LeadStage,
  type Niche,
  type Country,
} from '@/lib/types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import LeadDetailPanel from './lead-detail-panel';
import LeadImportDialog from './lead-import-dialog';
import CreateLeadDialog from './create-lead-dialog';
import ErrorFallback from './error-fallback';

const STAGE_BADGE_STYLES: Record<string, string> = {
  discovered: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  analyzed: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  contacted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  replied: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  discussion: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  proposal: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  negotiation: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  lost: 'bg-red-500/15 text-red-400 border-red-500/25',
};

function ScoreBar({ value }: { value: number }) {
  const gradientClass = value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : value >= 25 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', gradientClass)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums">{value}</span>
    </div>
  );
}

export default function LeadsTab() {
  const { selectedLeadId, setSelectedLeadId } = useAppStore();
  const queryClient = useQueryClient();

  // Filter state
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [nicheFilter, setNicheFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // UI state
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Reset page on filter change
  const handleFilterChange = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
    setSelectedLeadIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedLeadIds(new Set()), []);

  // Fetch leads using the search API
  const { data: leadsResult, isLoading, error: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ['leads', { search, stage: stageFilter, niche: nicheFilter, country: countryFilter, sortBy, sortOrder, currentPage }],
    queryFn: () => fetchLeads({
      search: search || undefined,
      stage: stageFilter !== 'all' ? (stageFilter as LeadStage) : undefined,
      niche: nicheFilter !== 'all' ? (nicheFilter as Niche) : undefined,
      country: countryFilter !== 'all' ? (countryFilter as Country) : undefined,
      sortBy,
      sortOrder,
      page: currentPage,
      limit: pageSize,
    }),
  });

  const leads = leadsResult?.leads ?? [];
  const totalLeads = leadsResult?.pagination?.total ?? 0;
  const totalPages = leadsResult?.pagination?.totalPages ?? 1;

  // Selected lead for detail panel
  const selectedLead = leads.find((l: Lead) => l.id === selectedLeadId) ?? null;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted successfully');
    },
    onError: (error: unknown) => {
      // apiCall already shows a toast with the server's specific error
      // message, so we only log here for diagnostics.
      console.error('[LeadsTab] Delete lead failed:', error);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) => updateLead(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => deleteLead(id)));
      const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      // Surface the actual server error message for the first failure so the
      // user understands WHY deletions failed (e.g. "Lead not found" vs a
      // constraint error) instead of only an opaque count.
      const firstReason = failed.length > 0
        ? (failed[0].reason instanceof Error ? failed[0].reason.message : String(failed[0].reason ?? 'Unknown error'))
        : '';
      return {
        succeeded: results.filter(r => r.status === 'fulfilled').length,
        failed: failed.length,
        firstReason,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (result.failed > 0) {
        const reason = result.firstReason ? ` (${result.firstReason})` : '';
        toast.error(`Deleted ${result.succeeded} leads, ${result.failed} failed${reason}`);
      } else {
        toast.success(`Deleted ${result.succeeded} leads successfully`);
      }
      clearSelection();
      setBulkDeleteOpen(false);
    },
  });

  // Export handler
  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (nicheFilter !== 'all') params.set('niche', nicheFilter);
      if (countryFilter !== 'all') params.set('country', countryFilter);
      if (search) params.set('search', search);
      params.set('format', 'csv');

      const res = await fetch(`/api/leads/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export completed');
    } catch {
      toast.error('Export failed');
    }
  }, [stageFilter, nicheFilter, countryFilter, search]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 max-w-sm rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <div className="hidden sm:block space-y-1">
          <Skeleton className="h-10 w-full rounded-md" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
        <div className="sm:hidden space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (leadsError && !leadsResult) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorFallback
          error={leadsError instanceof Error ? leadsError : null}
          onRetry={() => refetchLeads()}
          title="Failed to Load Leads"
          description="We couldn't load your leads. Please check your connection and try again."
          className="min-h-[300px]"
        />
      </div>
    );
  }

  const selectedCount = selectedLeadIds.size;

  return (
    <div className="p-4 lg:p-6 space-y-4 pb-24 lg:pb-6">
      {/* Header: Search + Actions */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="pl-9 pr-8 border-primary/20 focus-visible:ring-primary/30 min-h-[44px]"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn('h-9 gap-1.5', showFilters && 'border-primary/40 bg-primary/5')}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-primary/20"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Lead</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-primary/20"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-primary/20"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>

        {/* Expandable Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 flex-wrap items-center p-3 rounded-lg bg-muted/30 border border-border/50">
                <Select value={stageFilter} onValueChange={(v) => handleFilterChange(setStageFilter, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs border-primary/20">
                    <Filter className="h-3 w-3 mr-1 text-primary shrink-0" />
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {Object.entries(STAGE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={nicheFilter} onValueChange={(v) => handleFilterChange(setNicheFilter, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs border-primary/20">
                    <SelectValue placeholder="Niche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Niches</SelectItem>
                    {NICHE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={countryFilter} onValueChange={(v) => handleFilterChange(setCountryFilter, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs border-primary/20">
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[130px] h-8 text-xs border-primary/20">
                    <ArrowUpDown className="h-3 w-3 mr-1 text-primary shrink-0" />
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date Created</SelectItem>
                    <SelectItem value="businessName">Name</SelectItem>
                    <SelectItem value="conversionScore">Conv. Score</SelectItem>
                    <SelectItem value="replyScore">Reply Score</SelectItem>
                    <SelectItem value="stage">Stage</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="w-[100px] h-8 text-xs border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest</SelectItem>
                    <SelectItem value="asc">Oldest</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    handleFilterChange(setStageFilter, 'all');
                    handleFilterChange(setNicheFilter, 'all');
                    handleFilterChange(setCountryFilter, 'all');
                    setSortBy('createdAt');
                    setSortOrder('desc');
                  }}
                >
                  Clear
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active filter chips */}
      {(stageFilter !== 'all' || nicheFilter !== 'all' || countryFilter !== 'all' || search) && (
        <div className="flex flex-wrap gap-1.5">
          {search && (
            <Badge variant="outline" className="text-xs gap-1 pr-1">
              Search: {search}
              <button onClick={() => handleFilterChange(setSearch, '')} className="hover:bg-muted rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          )}
          {stageFilter !== 'all' && (
            <Badge variant="outline" className="text-xs gap-1 pr-1">
              Stage: {STAGE_LABELS[stageFilter as LeadStage]}
              <button onClick={() => handleFilterChange(setStageFilter, 'all')} className="hover:bg-muted rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          )}
          {nicheFilter !== 'all' && (
            <Badge variant="outline" className="text-xs gap-1 pr-1">
              Niche: {nicheFilter}
              <button onClick={() => handleFilterChange(setNicheFilter, 'all')} className="hover:bg-muted rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          )}
          {countryFilter !== 'all' && (
            <Badge variant="outline" className="text-xs gap-1 pr-1">
              Country: {countryFilter}
              <button onClick={() => handleFilterChange(setCountryFilter, 'all')} className="hover:bg-muted rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
            </Badge>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
        >
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearSelection}>
            Clear selection
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </motion.div>
      )}

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {totalLeads} lead{totalLeads !== 1 ? 's' : ''} found
      </p>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {leads.length > 0 ? leads.map((lead: Lead) => {
          const isChecked = selectedLeadIds.has(lead.id);
          return (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'rounded-lg border bg-card p-3 cursor-pointer transition-all hover:border-primary/30',
                selectedLeadId === lead.id && 'border-primary/30 bg-primary/[0.04]'
              )}
              onClick={() => setSelectedLeadId(lead.id)}
            >
              <div className="flex items-start gap-3">
                <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleSelect(lead.id)}
                    aria-label={`Select ${lead.businessName}`}
                  />
                </div>
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary font-bold text-sm shrink-0">
                  {/* FIX (M_ID crash): guard against undefined/null businessName */}
                  {(lead.businessName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{lead.businessName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lead.ownerName || lead.niche || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 ml-14 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px] border', STAGE_BADGE_STYLES[lead.stage] ?? '')}>
                  {STAGE_LABELS[lead.stage]}
                </Badge>
                {lead.niche && (
                  <Badge variant="secondary" className="text-[10px]">{lead.niche}</Badge>
                )}
                {lead.city && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" />{lead.city}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2.5 ml-14">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Conv:</span>
                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', lead.conversionScore >= 75 ? 'bg-emerald-500' : lead.conversionScore >= 50 ? 'bg-amber-500' : lead.conversionScore >= 25 ? 'bg-orange-500' : 'bg-red-500')}
                      style={{ width: `${lead.conversionScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-medium text-primary">{lead.conversionScore}</span>
                </div>
                {lead.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span className="text-xs">{lead.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        }) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">No Leads Yet</h3>
            <p className="text-sm text-center max-w-sm mb-4">Start by discovering new businesses or import leads from a CSV file.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {}} className="gap-1.5">
                <Search className="h-3.5 w-3.5" />Discover
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />Import
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <Card className="card-glow overflow-hidden hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={leads.length > 0 && leads.every(l => selectedLeadIds.has(l.id))}
                      onCheckedChange={() => {
                        if (leads.every(l => selectedLeadIds.has(l.id))) {
                          clearSelection();
                        } else {
                          setSelectedLeadIds(new Set(leads.map(l => l.id)));
                        }
                      }}
                      aria-label="Select all"
                      className="translate-y-[2px]"
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Business</TableHead>
                  <TableHead className="whitespace-nowrap">Niche</TableHead>
                  <TableHead className="whitespace-nowrap">Location</TableHead>
                  <TableHead className="whitespace-nowrap">Stage</TableHead>
                  <TableHead className="whitespace-nowrap">Conv. Score</TableHead>
                  <TableHead className="whitespace-nowrap">Rating</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length > 0 ? leads.map((lead: Lead) => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  const isActive = selectedLeadId === lead.id;
                  return (
                    <TableRow
                      key={lead.id}
                      className={cn(
                        'cursor-pointer transition-all group',
                        isSelected ? 'bg-emerald-500/[0.08]' : isActive ? 'bg-primary/5' : '',
                        'hover:bg-emerald-500/[0.06]'
                      )}
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(lead.id)}
                          aria-label={`Select ${lead.businessName}`}
                          className="translate-y-[2px]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-[180px]">{lead.businessName}</p>
                          <p className="text-xs text-muted-foreground truncate">{lead.ownerName || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs font-normal">{lead.niche || '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{lead.city ? `${lead.city}, ` : ''}{lead.country || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs border', STAGE_BADGE_STYLES[lead.stage] ?? '')}>
                          {STAGE_LABELS[lead.stage]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ScoreBar value={lead.conversionScore} />
                      </TableCell>
                      <TableCell>
                        {lead.rating ? (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                            <span className="text-xs">{lead.rating.toFixed(1)}</span>
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedLeadId(lead.id)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateMutation.mutate({ id: lead.id, data: { stage: 'contacted' } })}>
                              <Mail className="mr-2 h-4 w-4" /> Mark Contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateMutation.mutate({ id: lead.id, data: { stage: 'contacted' } })}>
                              <Phone className="mr-2 h-4 w-4" /> Mark Called
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(lead.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium mb-1">No leads found</p>
                        <p className="text-xs">Try adjusting your filters or discover new businesses.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalLeads)} of {totalLeads}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs border-primary/20"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs border-primary/20"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} Lead{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {selectedCount} lead{selectedCount !== 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedLeadIds))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Detail Panel */}
      <LeadDetailPanel
        lead={selectedLead}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />

      {/* Import Dialog */}
      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Create Lead Dialog */}
      <CreateLeadDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
