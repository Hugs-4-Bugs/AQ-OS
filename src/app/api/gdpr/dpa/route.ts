// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR DPA (Data Processing Agreement) API
// Phase 14.6: Compliance
// GET: Data processing agreement, POST: Accept DPA
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

const CURRENT_DPA_VERSION = '1.0';
const DPA_UPDATED_AT = '2025-01-15';

// ── GET: Get DPA ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Check DPA acceptance
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      const dpaAcceptance = (() => {
        try {
          const prefs = JSON.parse(settings?.notificationPreferences || '{}');
          return prefs._dpaAcceptance || {};
        } catch {
          return {};
        }
      })();

      return NextResponse.json({
        dpa: {
          version: CURRENT_DPA_VERSION,
          updatedAt: DPA_UPDATED_AT,
          title: 'Data Processing Agreement',
          parties: {
            processor: {
              name: 'AcquisitionOS Inc.',
              role: 'Data Processor',
            },
            controller: {
              name: user.name || user.email,
              role: 'Data Controller',
            },
          },
          summary: {
            scope: 'Processing of personal data for the provision of AcquisitionOS services.',
            dataTypes: [
              'Personal identification data (name, email, phone)',
              'Business data (leads, deals, communications)',
              'Usage data (analytics, logs, feature usage)',
              'Financial data (payment records, invoices)',
              'Technical data (IP addresses, device info)',
            ],
            purposes: [
              'Service delivery and maintenance',
              'AI-powered lead analysis and outreach generation',
              'Communication management and tracking',
              'Billing and subscription management',
              'Security and fraud prevention',
              'Product improvement and analytics',
            ],
            retentionPeriods: {
              personalData: 'Duration of account + 30 days after deletion request',
              financialRecords: '7 years (legal/tax compliance)',
              auditLogs: '1 year',
              marketingConsent: 'Until revoked',
            },
            rights: [
              'Right of access (Article 15)',
              'Right to rectification (Article 16)',
              'Right to erasure (Article 17)',
              'Right to restrict processing (Article 18)',
              'Right to data portability (Article 20)',
              'Right to object (Article 21)',
            ],
            securityMeasures: [
              'Encryption at rest (AES-256)',
              'Encryption in transit (TLS 1.2+)',
              'Access control and authentication',
              'Regular security audits',
              'Incident response procedures',
              'Employee data protection training',
            ],
            subprocessors: [
              { name: 'AWS', purpose: 'Cloud infrastructure', location: 'US/EU' },
              { name: 'Stripe', purpose: 'Payment processing', location: 'US' },
              { name: 'Razorpay', purpose: 'Payment processing (India)', location: 'India' },
              { name: 'Google Cloud', purpose: 'AI/ML services', location: 'US' },
            ],
          },
          accepted: dpaAcceptance.version === CURRENT_DPA_VERSION,
          acceptedAt: dpaAcceptance.acceptedAt || null,
        },
      });
    } catch (error) {
      console.error('Get DPA error:', error);
      return NextResponse.json({ error: 'Failed to get DPA' }, { status: 500 });
    }
  });
}

// ── POST: Accept DPA ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
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

      const now = new Date().toISOString();
      prefs._dpaAcceptance = {
        version: CURRENT_DPA_VERSION,
        acceptedAt: now,
        userName: user.name || user.email,
      };

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
          action: 'gdpr_dpa_accepted',
          details: JSON.stringify({
            dpaVersion: CURRENT_DPA_VERSION,
            acceptedAt: now,
          }),
          resource: 'gdpr',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      return NextResponse.json({
        message: 'Data Processing Agreement accepted',
        dpa: {
          version: CURRENT_DPA_VERSION,
          acceptedAt: now,
        },
      });
    } catch (error) {
      console.error('Accept DPA error:', error);
      return NextResponse.json({ error: 'Failed to accept DPA' }, { status: 500 });
    }
  });
}
