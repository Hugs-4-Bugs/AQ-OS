// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Consent API
// Phase 14.6: Compliance
// GET/POST: Consent tracking (6 consent categories)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// 6 consent categories as specified
const CONSENT_CATEGORIES = [
  {
    key: 'data_processing',
    label: 'Data Processing',
    description: 'Required processing of your personal data to provide the AcquisitionOS service.',
    required: true,
  },
  {
    key: 'marketing_emails',
    label: 'Marketing Emails',
    description: 'Receive product updates, feature announcements, and promotional offers.',
    required: false,
  },
  {
    key: 'analytics_tracking',
    label: 'Analytics Tracking',
    description: 'Allow us to collect usage analytics to improve the product experience.',
    required: false,
  },
  {
    key: 'third_party_integrations',
    label: 'Third-Party Integrations',
    description: 'Share data with connected third-party services (Gmail, Slack, etc.).',
    required: false,
  },
  {
    key: 'ai_data_usage',
    label: 'AI Data Usage',
    description: 'Allow your data to be used for AI model improvements and personalization.',
    required: false,
  },
  {
    key: 'cookie_analytics',
    label: 'Cookie Analytics',
    description: 'Use non-essential cookies for analytics and performance monitoring.',
    required: false,
  },
] as const;

type ConsentCategory = typeof CONSENT_CATEGORIES[number]['key'];

interface ConsentState {
  [key: string]: {
    granted: boolean;
    grantedAt: string | null;
    revokedAt: string | null;
    version: string;
  };
}

// ── GET: Get current consent state ─────────────────────────────────
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get user settings which stores consent data
      let settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      if (!settings) {
        // Create default settings with required consent
        settings = await db.userSettings.create({
          data: {
            userId: user.id,
            notificationPreferences: JSON.stringify(getDefaultConsentState()),
          },
        });
      }

      // Parse consent state from notificationPreferences field (repurposed for consent)
      let consentState: ConsentState;
      try {
        consentState = JSON.parse(settings.notificationPreferences || '{}');
      } catch {
        consentState = getDefaultConsentState();
      }

      // Ensure all categories exist
      const fullConsentState = { ...getDefaultConsentState(), ...consentState };

      return NextResponse.json({
        categories: CONSENT_CATEGORIES.map((cat) => ({
          ...cat,
          ...fullConsentState[cat.key],
        })),
        lastUpdated: settings.updatedAt,
      });
    } catch (error) {
      console.error('Get consent error:', error);
      return NextResponse.json({ error: 'Failed to get consent state' }, { status: 500 });
    }
  });
}

// ── POST: Update consent preferences ───────────────────────────────
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const updates: Record<string, boolean> = body.consents || {};

      // Validate: cannot revoke required consent
      for (const cat of CONSENT_CATEGORIES) {
        if (cat.required && updates[cat.key] === false) {
          return NextResponse.json(
            { error: `Cannot revoke required consent: ${cat.label}` },
            { status: 400 }
          );
        }
      }

      // Get current state
      let settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      let currentState: ConsentState;
      try {
        currentState = JSON.parse(settings?.notificationPreferences || '{}');
      } catch {
        currentState = getDefaultConsentState();
      }

      const fullCurrentState = { ...getDefaultConsentState(), ...currentState };

      // Apply updates
      const now = new Date().toISOString();
      const version = '1.0';

      for (const [key, granted] of Object.entries(updates)) {
        if (fullCurrentState[key]) {
          const wasGranted = fullCurrentState[key].granted;
          fullCurrentState[key] = {
            ...fullCurrentState[key],
            granted: granted as boolean,
            grantedAt: granted ? now : fullCurrentState[key].grantedAt,
            revokedAt: !granted ? now : null,
            version,
          };
        }
      }

      // Save updated consent state
      if (settings) {
        await db.userSettings.update({
          where: { userId: user.id },
          data: {
            notificationPreferences: JSON.stringify(fullCurrentState),
          },
        });
      } else {
        await db.userSettings.create({
          data: {
            userId: user.id,
            notificationPreferences: JSON.stringify(fullCurrentState),
          },
        });
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'gdpr_consent_updated',
          details: JSON.stringify({ updates, timestamp: now }),
          resource: 'gdpr',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      return NextResponse.json({
        message: 'Consent preferences updated',
        categories: CONSENT_CATEGORIES.map((cat) => ({
          ...cat,
          ...fullCurrentState[cat.key],
        })),
        updatedAt: now,
      });
    } catch (error) {
      console.error('Update consent error:', error);
      return NextResponse.json({ error: 'Failed to update consent' }, { status: 500 });
    }
  });
}

function getDefaultConsentState(): ConsentState {
  const now = new Date().toISOString();
  const state: ConsentState = {};
  for (const cat of CONSENT_CATEGORIES) {
    state[cat.key] = {
      granted: cat.required, // Required categories are granted by default
      grantedAt: cat.required ? now : null,
      revokedAt: null,
      version: '1.0',
    };
  }
  return state;
}
