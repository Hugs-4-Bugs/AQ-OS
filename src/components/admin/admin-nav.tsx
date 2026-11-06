'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Console Navigation (client)
//
// Sticky top navigation for the Admin Dashboard. Also keeps the admin
// session alive on long sessions by reusing the existing 14-minute
// token refresh hook (same one the main app uses).
//
// ISSUE 5 (Admin Profile Menu): The admin identity chip on the right
// opens a dropdown with:
//   - Admin name, email, role
//   - Account / profile settings (link to /dashboard/settings)
//   - Security & MFA management (link to /dashboard/settings?tab=security)
//   - Sign out (POST /api/auth/signout)
// The menu is keyboard accessible (Enter/Space to open, Escape and
// outside-click to close, arrow keys not needed because the items are
// short). Every visible action navigates to an existing route or
// invokes actual functionality — no fabricated pages.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useTokenRefresh } from '@/hooks/use-token-refresh';
import { BrandLogo } from '@/components/brand/brand-logo';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  MessageSquareWarning,
  LifeBuoy,
  ArrowUpRight,
  ServerCog,
  Lock,
  Radar,
  LogOut,
  Settings,
  KeyRound,
  ChevronDown,
} from 'lucide-react';

interface AdminNavProps {
  admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    mfaEnrolled: boolean;
  };
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/crm', label: 'CRM', icon: Radar, exact: false },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/billing', label: 'Billing', icon: CreditCard, exact: false },
  { href: '/admin/operations', label: 'Operations', icon: ServerCog, exact: false },
  { href: '/admin/security', label: 'Security', icon: Lock, exact: false },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquareWarning, exact: false },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, exact: false },
];

/** Human-readable label for each platform-admin role. */
function roleLabel(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'support':
      return 'Support';
    case 'analytics':
      return 'Analytics';
    default:
      return role;
  }
}

export default function AdminNav({ admin }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  // Keeps the access_token cookie fresh while admins work in the console.
  // CRITICAL: this hook was previously called without being imported,
  // causing a ReferenceError that broke the entire AdminNav render and
  // silently killed token refresh — leaving admin APIs returning 401
  // after the 15-minute access token expired. The import is restored.
  useTokenRefresh();

  // ── Profile dropdown state ──────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Close on outside click or touch
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
        // Return focus to the trigger for keyboard users
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, closeMenu]);

  // Close on route change
  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      } else if (e.key === 'ArrowDown' && !menuOpen) {
        e.preventDefault();
        setMenuOpen(true);
      } else if (e.key === 'Escape' && menuOpen) {
        e.preventDefault();
        closeMenu();
      }
    },
    [menuOpen, closeMenu]
  );

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    closeMenu();
    try {
      // Server-side session invalidation — same endpoint the main app uses.
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {
        // Even if the network call fails, clear client state and redirect.
      });
    } finally {
      // Hard redirect to the sign-in entry point. The AuthGate on `/`
      // will render the appropriate auth flow.
      router.replace('/');
    }
  }, [signingOut, closeMenu, router]);

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const displayName = admin.name || admin.email;
  const initials = displayName.slice(0, 2).toUpperCase();
  const mfaStatus = admin.mfaEnrolled ? 'MFA enabled' : 'MFA not configured';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand — official AcquisitionOS symbol + Admin Console label */}
        <Link href="/admin" className="flex items-center gap-2 shrink-0" aria-label="Admin Console home">
          <BrandLogo variant="symbol" size="sm" priority />
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

        {/* Admin identity + profile menu + back to app */}
        <div className="flex shrink-0 items-center gap-2">
          {/* ── Profile menu trigger + dropdown ─────────────────────── */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={toggleMenu}
              onKeyDown={handleMenuKeyDown}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account menu for ${displayName}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors min-h-[36px]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                menuOpen
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted hover:text-foreground'
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
              >
                {initials}
              </span>
              <span className="hidden md:flex md:flex-col md:items-start md:leading-tight">
                <span className="max-w-[160px] truncate text-xs font-medium">
                  {displayName}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {roleLabel(admin.role)}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  menuOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Account"
                className="absolute right-0 top-full mt-1 z-50 w-72 origin-top-right rounded-md border border-border bg-popover p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
              >
                {/* Identity header */}
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate" title={admin.email}>
                    {admin.email}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {roleLabel(admin.role)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        admin.mfaEnrolled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      )}
                    >
                      <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                      {mfaStatus}
                    </span>
                  </div>
                </div>

                {/* Menu items — each navigates to an EXISTING route */}
                <Link
                  href="/business-ai/settings"
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>Account &amp; profile settings</span>
                </Link>
                <Link
                  href="/business-ai/settings"
                  role="menuitem"
                  onClick={() => useAppStore.getState().requestSettingsSection('security')}
                  className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>Security &amp; MFA management</span>
                </Link>

                <div className="my-1 h-px bg-border" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Back to app — navigates to the main AcquisitionOS app entry
              point. Same-session navigation: the access_token cookie is
              preserved, so the user stays authenticated. */}
          <Link
            href="/"
            aria-label="Back to main application"
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
