// ═══════════════════════════════════════════════════════════════════
// POST + GET /api/competitors — Competitor CRUD
// Phase 13: Create and list competitors
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createCompetitor, getCompetitors } from '@/lib/competitor-intelligence-service';
import { db } from '@/lib/db';

// POST /api/competitors — Create a new competitor
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { name, url, leadId } = body;

      // Validate required fields
      if (!name || !url) {
        return NextResponse.json(
          { error: 'Missing required fields: name, url' },
          { status: 400 }
        );
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }

      const result = (await createCompetitor(user.id, { name, url, leadId })) as {
        id: string;
        [key: string]: unknown;
      };

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'competitor_added',
          details: JSON.stringify({
            competitorId: result.id,
            name,
            url,
            leadId,
          }),
          resource: 'competitor',
          resourceId: result.id,
        },
      }).catch(() => {});

      return NextResponse.json({ analysis: result }, { status: 201 });
    } catch (error) {
      console.error('[POST /api/competitors] Error:', error);
      return NextResponse.json(
        { error: 'Failed to create competitor' },
        { status: 500 }
      );
    }
  });
}

// GET /api/competitors — List competitors with pagination
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
      const threatLevel = searchParams.get('threatLevel') || undefined;

      // Validate threat level if provided
      if (threatLevel && !['low', 'medium', 'high'].includes(threatLevel)) {
        return NextResponse.json(
          { error: 'Invalid threatLevel. Must be one of: low, medium, high' },
          { status: 400 }
        );
      }

      const result = await getCompetitors(user.id, { page, limit, threatLevel });

      return NextResponse.json({
        data: result.data,
        total: result.total,
        page,
        limit,
      });
    } catch (error) {
      console.error('[GET /api/competitors] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch competitors' },
        { status: 500 }
      );
    }
  });
}
