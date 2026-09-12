// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — /api/leads/proxy-pool
// Phase 7 Remediation: Proxy pool management
// GET: Get proxy pool status
// POST: Add a new proxy
// DELETE: Remove a proxy
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getProxyPoolStatus, addProxy, removeProxy } from '@/lib/proxy-rotation-service';
import { db } from '@/lib/db';
import type { ProxyType } from '@/lib/proxy-rotation-service';

const VALID_PROXY_TYPES: ProxyType[] = ['datacenter', 'residential', 'mobile', 'isp'];

/**
 * GET: Get proxy pool status and list of proxies
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const includeProxies = searchParams.get('includeProxies') === 'true';

      const [status, proxies] = await Promise.all([
        getProxyPoolStatus(),
        includeProxies
          ? db.proxyEndpoint.findMany({
              orderBy: { successRate: 'desc' },
              select: {
                id: true,
                url: true,
                type: true,
                isActive: true,
                successRate: true,
                avgLatency: true,
                lastUsedAt: true,
                failureCount: true,
                totalRequests: true,
                successCount: true,
                lastError: true,
                rateLimitPerMinute: true,
                country: true,
                provider: true,
                createdAt: true,
              },
            })
          : Promise.resolve(null),
      ]);

      return NextResponse.json({
        status,
        proxies,
      });
    } catch (error) {
      console.error('[API /leads/proxy-pool GET] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get proxy pool status' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST: Add a new proxy to the pool
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { url, type, rateLimitPerMinute, country, provider } = body;

      // Validate required fields
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return NextResponse.json(
          { error: 'url is required' },
          { status: 400 }
        );
      }

      if (!type || !VALID_PROXY_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `type must be one of: ${VALID_PROXY_TYPES.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate URL format
      try {
        const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
        if (!parsed.hostname) {
          throw new Error('Invalid hostname');
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid proxy URL format' },
          { status: 400 }
        );
      }

      // Check for duplicate URL
      const existing = await db.proxyEndpoint.findFirst({
        where: { url: url.trim() },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'A proxy with this URL already exists' },
          { status: 409 }
        );
      }

      const proxy = await addProxy({
        url: url.trim(),
        type,
        rateLimitPerMinute: rateLimitPerMinute ? parseInt(String(rateLimitPerMinute), 10) : undefined,
        country: country || undefined,
        provider: provider || undefined,
      });

      return NextResponse.json({
        success: true,
        proxy: {
          id: proxy.id,
          url: proxy.url,
          type: proxy.type,
          isActive: proxy.isActive,
        },
      }, { status: 201 });
    } catch (error) {
      console.error('[API /leads/proxy-pool POST] Error:', error);
      return NextResponse.json(
        { error: 'Failed to add proxy' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE: Remove a proxy from the pool
 */
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const proxyId = searchParams.get('id');

      if (!proxyId) {
        return NextResponse.json(
          { error: 'id query parameter is required' },
          { status: 400 }
        );
      }

      const removed = await removeProxy(proxyId);

      if (!removed) {
        return NextResponse.json(
          { error: 'Proxy not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Proxy removed from pool',
      });
    } catch (error) {
      console.error('[API /leads/proxy-pool DELETE] Error:', error);
      return NextResponse.json(
        { error: 'Failed to remove proxy' },
        { status: 500 }
      );
    }
  });
}
