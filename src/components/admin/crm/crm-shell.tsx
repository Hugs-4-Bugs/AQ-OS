'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Shell
//
// Shared layout wrapper for every /admin/crm/* page. Renders the section
// title, subtitle, a refresh button, and the CRM sub-navigation tabs.
// The parent /admin/layout.tsx already enforced super_admin server-side.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CRM_SECTIONS = [
  { href: '/admin/crm', label: 'Overview', exact: true },
  { href: '/admin/crm/sales', label: 'Sales Center', exact: false },
  { href: '/admin/crm/leads', label: 'Leads', exact: false },
  { href: '/admin/crm/pipeline', label: 'Pipeline', exact: false },
  { href: '/admin/crm/deals', label: 'Deals', exact: false },
  { href: '/admin/crm/activities', label: 'Activities', exact: false },
  { href: '/admin/crm/tasks', label: 'Tasks & Follow-ups', exact: false },
  { href: '/admin/crm/meetings', label: 'Meetings', exact: false },
  { href: '/admin/crm/outreach', label: 'Outreach', exact: false },
  { href: '/admin/crm/sequences', label: 'Sequences', exact: false },
  { href: '/admin/crm/autopilot', label: 'AI / Autopilot', exact: false },
  { href: '/admin/crm/intelligence', label: 'Intelligence', exact: false },
  { href: '/admin/crm/analytics', label: 'Analytics', exact: false },
];

interface CrmShellProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function CrmShell({ title, subtitle, onRefresh, refreshing, actions, children }: CrmShellProps) {
  const pathname = usePathname();
  const isActive = (item: (typeof CRM_SECTIONS)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              CRM
            </span>
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        )}
      </div>

      {/* Sub-nav */}
      <nav aria-label="CRM sections" className="overflow-x-auto">
        <ul className="flex items-center gap-1 border-b border-border pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CRM_SECTIONS.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]',
                    active
                      ? 'border-b-2 border-primary text-primary -mb-px'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
