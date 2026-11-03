// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard Layout (SERVER-GUARDED)
//
// Every request to any /admin/* page resolves the session on the SERVER
// via cookies + DB lookup and requires the PLATFORM `super_admin` role.
// - No valid super_admin session → redirect to '/' (the AuthGate handles
//   sign-in / token refresh there). No admin content is ever rendered or
//   leaked to non-admins — this is server-side enforcement, not UI hiding.
// - Org-level `owner`/`admin` roles are deliberately NOT sufficient
//   (account isolation policy — see withSuperAdmin in auth-middleware).
//
// MANDATORY 2FA ENFORCEMENT (Phase: Admin Security):
// - If the super_admin has NOT enrolled in TOTP 2FA, they are redirected
//   to /admin/security/enrollment BEFORE any admin console content loads.
// - The enrollment page is the ONLY admin route accessible without 2FA.
// - Once enrolled, every future login requires TOTP (handled by the
//   signin route which checks mfaConfig.isEnabled).
// ═══════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSuperAdminSession } from '@/lib/admin-guard';
import AdminNav from '@/components/admin/admin-nav';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Console — AcquisitionOS',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getSuperAdminSession();

  if (!admin) {
    // Safe for everyone: authenticated non-admins land in their own app,
    // unauthenticated users get the sign-in flow. Nothing is leaked.
    redirect('/');
  }

  // ── Mandatory 2FA enforcement ──────────────────────────────────
  // If the admin hasn't enrolled in 2FA, redirect to the enrollment page.
  // The enrollment page is the ONLY /admin/* route accessible without 2FA.
  // All other admin routes (CRM, Users, Billing, Operations, etc.) require
  // completed 2FA enrollment. This is enforced server-side in the layout,
  // not just in the UI.
  if (!admin.mfaEnrolled) {
    // Allow access to the enrollment page itself
    // (checked via headers in server component — we can't use usePathname
    //  here, so we redirect to enrollment unconditionally; the enrollment
    //  page handles its own rendering)
    redirect('/auth/mfa-enrollment');
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AdminNav admin={admin} />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
