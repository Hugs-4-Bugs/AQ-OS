// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Policies API
// Phase 14.6: Compliance
// GET: Current privacy policy + ToS versions
// POST: Accept policies
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// Current policy versions
const CURRENT_PRIVACY_POLICY_VERSION = '2.0';
const CURRENT_TOS_VERSION = '2.0';
const PRIVACY_POLICY_UPDATED_AT = '2025-01-15';
const TOS_UPDATED_AT = '2025-01-15';

// ── GET: Current policy versions & acceptance status ───────────────
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Check user's current policy acceptance
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      const acceptedPolicies = (() => {
        try {
          const prefs = JSON.parse(settings?.notificationPreferences || '{}');
          return prefs._policyAcceptance || {};
        } catch {
          return {};
        }
      })();

      return NextResponse.json({
        policies: {
          privacyPolicy: {
            version: CURRENT_PRIVACY_POLICY_VERSION,
            updatedAt: PRIVACY_POLICY_UPDATED_AT,
            url: '/privacy-policy',
            accepted: acceptedPolicies.privacyPolicyVersion === CURRENT_PRIVACY_POLICY_VERSION,
            acceptedAt: acceptedPolicies.privacyPolicyAcceptedAt || null,
          },
          termsOfService: {
            version: CURRENT_TOS_VERSION,
            updatedAt: TOS_UPDATED_AT,
            url: '/terms-of-service',
            accepted: acceptedPolicies.tosVersion === CURRENT_TOS_VERSION,
            acceptedAt: acceptedPolicies.tosAcceptedAt || null,
          },
        },
        requiresAcceptance:
          acceptedPolicies.privacyPolicyVersion !== CURRENT_PRIVACY_POLICY_VERSION ||
          acceptedPolicies.tosVersion !== CURRENT_TOS_VERSION,
      });
    } catch (error) {
      console.error('Get policies error:', error);
      return NextResponse.json({ error: 'Failed to get policy information' }, { status: 500 });
    }
  });
}

// ── POST: Accept policies ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const acceptPrivacyPolicy = body.acceptPrivacyPolicy === true;
      const acceptTos = body.acceptTos === true;

      if (!acceptPrivacyPolicy && !acceptTos) {
        return NextResponse.json(
          { error: 'At least one policy must be accepted' },
          { status: 400 }
        );
      }

      // Get current settings
      let settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      let prefs: Record<string, unknown> = {};
      try {
        prefs = JSON.parse(settings?.notificationPreferences || '{}');
      } catch {
        prefs = {};
      }

      const policyAcceptance = (prefs._policyAcceptance || {}) as Record<string, unknown>;
      const now = new Date().toISOString();

      if (acceptPrivacyPolicy) {
        policyAcceptance.privacyPolicyVersion = CURRENT_PRIVACY_POLICY_VERSION;
        policyAcceptance.privacyPolicyAcceptedAt = now;
      }

      if (acceptTos) {
        policyAcceptance.tosVersion = CURRENT_TOS_VERSION;
        policyAcceptance.tosAcceptedAt = now;
      }

      prefs._policyAcceptance = policyAcceptance;

      // Save
      if (settings) {
        await db.userSettings.update({
          where: { userId: user.id },
          data: { notificationPreferences: JSON.stringify(prefs) },
        });
      } else {
        await db.userSettings.create({
          data: {
            userId: user.id,
            notificationPreferences: JSON.stringify(prefs),
          },
        });
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'gdpr_policies_accepted',
          details: JSON.stringify({
            privacyPolicyVersion: acceptPrivacyPolicy ? CURRENT_PRIVACY_POLICY_VERSION : null,
            tosVersion: acceptTos ? CURRENT_TOS_VERSION : null,
            acceptedAt: now,
          }),
          resource: 'gdpr',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      return NextResponse.json({
        message: 'Policies accepted successfully',
        privacyPolicy: {
          version: CURRENT_PRIVACY_POLICY_VERSION,
          accepted: policyAcceptance.privacyPolicyVersion === CURRENT_PRIVACY_POLICY_VERSION,
          acceptedAt: policyAcceptance.privacyPolicyAcceptedAt,
        },
        termsOfService: {
          version: CURRENT_TOS_VERSION,
          accepted: policyAcceptance.tosVersion === CURRENT_TOS_VERSION,
          acceptedAt: policyAcceptance.tosAcceptedAt,
        },
      });
    } catch (error) {
      console.error('Accept policies error:', error);
      return NextResponse.json({ error: 'Failed to accept policies' }, { status: 500 });
    }
  });
}
