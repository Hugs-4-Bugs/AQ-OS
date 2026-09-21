// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — User Offer Profile (what THIS user sells)
// GET  /api/prospecting/offer-profile
// PUT  /api/prospecting/offer-profile  body: { services: OfferService[] }
//
// Stored in UserSettings.servicesOffered (JSON array, max 20 items).
// Consumed by STEP 3 (Offer Profile Match) of the prospecting pipeline.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { parseOfferServices } from '@/lib/prospecting/pipeline';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
        select: { servicesOffered: true, companyName: true, businessDescription: true },
      });
      return NextResponse.json({
        services: parseOfferServices(settings?.servicesOffered),
        companyName: settings?.companyName ?? '',
        businessDescription: settings?.businessDescription ?? '',
      });
    } catch (err) {
      console.error('[OfferProfile:GET] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to load offer profile' }, { status: 500 });
    }
  });
}, 'prospecting/offer-profile');

export const PUT = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const services = parseOfferServices(JSON.stringify(Array.isArray(body?.services) ? body.services : []));

      await db.userSettings.upsert({
        where: { userId: user.id },
        update: { servicesOffered: JSON.stringify(services) },
        create: { userId: user.id, servicesOffered: JSON.stringify(services) },
      });

      return NextResponse.json({ success: true, services });
    } catch (err) {
      console.error('[OfferProfile:PUT] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to save offer profile' }, { status: 500 });
    }
  });
}, 'prospecting/offer-profile');
