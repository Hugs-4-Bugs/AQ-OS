'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings → Integrations → Discovery Sources
//
// Shows every lead-discovery source with its real-time configuration
// status (from GET /api/discovery/sources):
//   - Connected      (green)  — real credentials present, ready to run
//   - Not Configured (yellow) — needs API keys; Configure shows the names
//   - Error          (red)    — partially configured (e.g. missing URL)
// Free sources (Yellow Pages, Sulekha, AI Search) show "No setup required".
// Only env var NAMES are displayed — never values.
// ═══════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ExternalLink, Search, MapPin, Globe, Building2, Star, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscoverySourceStatus {
  id: string;
  label: string;
  type: 'ai' | 'api' | 'scrape';
  description: string;
  status: 'connected' | 'not_configured' | 'error';
  configMessage: string;
  requiredEnvVars: Array<{ name: string; label: string; required: boolean }>;
  optionalEnvVars: Array<{ name: string; label: string; required: boolean }>;
  signupUrl: string | null;
  notes: string | null;
  noSetupRequired: boolean;
}

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai_search: Sparkles,
  google_maps: MapPin,
  google_business: Globe,
  yelp: Star,
  linkedin: Building2,
  justdial: Search,
  indiamart: Building2,
  facebook: Globe,
  instagram: Globe,
  yellow_pages: Search,
  sulekha: Globe,
};

const STATUS_STYLES: Record<
  DiscoverySourceStatus['status'],
  { label: string; badgeClass: string; dotClass: string }
> = {
  connected: {
    label: 'Connected',
    badgeClass: 'border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  not_configured: {
    label: 'Not Configured',
    badgeClass: 'border-yellow-400 text-yellow-600 dark:border-yellow-600 dark:text-yellow-400',
    dotClass: 'bg-yellow-500',
  },
  error: {
    label: 'Error',
    badgeClass: 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
};

export default function DiscoverySourcesSettings() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['discovery-source-status'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/sources');
      if (!res.ok) throw new Error('Failed to load discovery sources');
      const json = await res.json();
      return json.sources as DiscoverySourceStatus[];
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading discovery source status...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Could not load discovery source status. Please refresh the page.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((source) => {
        const Icon = SOURCE_ICONS[source.id] || Search;
        const statusStyle = STATUS_STYLES[source.status];
        const expanded = expandedId === source.id;
        const allEnvVars = [...source.requiredEnvVars, ...source.optionalEnvVars];

        return (
          <Card key={source.id} className="overflow-hidden">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{source.label}</p>
                      <span className="inline-flex items-center gap-1">
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusStyle.dotClass)} />
                        <Badge variant="outline" className={cn('text-[10px]', statusStyle.badgeClass)}>
                          {statusStyle.label}
                        </Badge>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {source.noSetupRequired
                        ? 'No setup required — works out of the box'
                        : source.status === 'connected'
                          ? 'Connected and ready'
                          : source.configMessage}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {source.noSetupRequired ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400">
                      No setup required
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedId(expanded ? null : source.id)}
                    >
                      Configure
                      <ChevronDown className={cn('h-3 w-3 ml-1 transition-transform', expanded && 'rotate-180')} />
                    </Button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="mt-3 space-y-2 rounded-lg bg-muted/40 border p-3">
                  <p className="text-xs text-muted-foreground">{source.description}</p>
                  {allEnvVars.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Required environment variables:</p>
                      <ul className="space-y-0.5">
                        {allEnvVars.map((v) => (
                          <li key={v.name} className="flex items-center gap-2 text-xs">
                            <code className="px-1.5 py-0.5 rounded bg-background border font-mono text-[11px]">
                              {v.name}
                            </code>
                            <span className="text-muted-foreground">
                              {v.label}
                              {!v.required && ' (optional)'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-muted-foreground">
                        Add these to your server environment (never commit secret values to Git).
                      </p>
                    </div>
                  )}
                  {source.notes && <p className="text-[11px] text-muted-foreground">{source.notes}</p>}
                  {source.signupUrl && (
                    <a
                      href={source.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Get credentials
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
