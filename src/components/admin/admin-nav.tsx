'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Console Navigation (client)
//
// Sticky top navigation for the Admin Dashboard. Also keeps the admin
// session alive on long sessions by reusing the existing 14-minute
// token refresh hook (same one the main app uses).
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTokenRefresh } from '@/hooks/use-token-refresh';
import { cn } from '@/lib/utils';
import {
  Shield,
  LayoutDashboard,
  Users,
  CreditCard,
  MessageSquareWarning,
  LifeBuoy,
  ArrowUpRight,
} from 'lucide-react';

interface AdminNavProps {
  admin: { id: string; email: string; name: string; avatarUrl: string | null };
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/billing', label: 'Billing', icon: CreditCard, exact: false },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquareWarning, exact: false },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, exact: false },
];

export default function AdminNav({ admin }: AdminNavProps) {
  const pathname = usePathname();
  // Keeps the access_token cookie fresh while admins work in the console
  useTokenRefresh();

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/admin" className="flex items-center gap-2 shrink-0" aria-label="Admin Console home">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="hidden sm:flex sm:flex-col sm:leading-none">
            <span className="text-sm font-semibold">Admin Console</span>
            <span className="text-[11px] text-muted-foreground">AcquisitionOS</span>
          </span>
        </Link>

        {/* Section links — horizontally scrollable on mobile */}
        <nav aria-label="Admin sections" className="ml-2 min-w-0 flex-1">
          <ul className="flex items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px]',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Admin identity + back to app */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="max-w-[180px] truncate text-xs font-medium">
              {admin.name || admin.email}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              super admin
            </span>
          </div>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
          >
            {(admin.name || admin.email).slice(0, 2)}
          </span>
          <Link
            href="/"
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-[36px]"
          >
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
