// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Retention API
// Phase 14.6: Compliance
// GET: Retention policies, POST: Enforce retention (admin)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { enforceRetention, RETENTION_POLICIES } from '@/lib/compliance/retention';

// ── GET: List retention policies ───────────────────────────────────
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      return NextResponse.json({
        policies: RETENTION_POLICIES.map((policy) => ({
          category: policy.category,
          description: policy.description,
          retentionDays: policy.retentionDays,
          action: policy.action,
          legalBasis: policy.legalBasis,
          gdprArticle: policy.gdprArticle,
        })),
        summary: {
          totalPolicies: RETENTION_POLICIES.length,
          shortestRetention: Math.min(...RETENTION_POLICIES.map((p) => p.retentionDays)),
          longestRetention: Math.max(...RETENTION_POLICIES.map((p) => p.retentionDays)),
          lastEnforced: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Get retention policies error:', error);
      return NextResponse.json({ error: 'Failed to get retention policies' }, { status: 500 });
    }
  });
}

// ── POST: Enforce retention (admin only) ───────────────────────────
export async function POST(request: NextRequest) {
  return withSuperAdmin(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const dryRun = body.dryRun !== false; // Default to dry run for safety
      const categories = body.categories || null; // null = all categories

      const result = await enforceRetention({
        dryRun,
        categories: categories as string[] | null,
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'gdpr_retention_enforced',
          details: JSON.stringify({
            dryRun,
            categories: categories || 'all',
            recordsAffected: result.totalAffected,
            results: result.details,
          }),
          resource: 'gdpr',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      return NextResponse.json({
        dryRun,
        message: dryRun
          ? 'Dry run completed. No data was actually deleted.'
          : 'Retention enforcement completed.',
        ...result,
      });
    } catch (error) {
      console.error('Enforce retention error:', error);
      return NextResponse.json({ error: 'Failed to enforce retention' }, { status: 500 });
    }
  });
}
