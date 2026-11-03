// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Mandatory Admin 2FA Enrollment (Server Guard)
//
// This page is OUTSIDE the /admin/ layout to avoid infinite redirects.
// It verifies that the visitor is an authenticated super_admin who has
// NOT yet enrolled in 2FA, then renders the enrollment flow.
//
// If the visitor is NOT a super_admin → redirect to /
// If the visitor IS enrolled → redirect to /admin
// ═══════════════════════════════════════════════════════════════════

import { redirect } from 'next/navigation';
import { getSuperAdminSession } from '@/lib/admin-guard';
import MfaEnrollmentClient from './mfa-enrollment-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Secure Your Admin Account — AcquisitionOS',
  robots: { index: false, follow: false },
};

export default async function MfaEnrollmentPage() {
  const admin = await getSuperAdminSession();

  // Not authenticated or not super_admin → send to login
  if (!admin) {
    redirect('/');
  }

  // Already enrolled → no need for enrollment, go to admin console
  if (admin.mfaEnrolled) {
    redirect('/admin');
  }

  // Authenticated super_admin without 2FA → show enrollment flow
  return <MfaEnrollmentClient adminEmail={admin.email} adminName={admin.name} />;
}
