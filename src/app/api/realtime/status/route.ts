/**
 * Realtime system status endpoint
 * GET /api/realtime/status
 */
import { NextResponse } from 'next/server';
import { getRealtimeMetrics, getHealthSummary } from '@/lib/realtime-observability';
import { getEventBusStats } from '@/lib/realtime-event-bus';
import { getSSEStats } from '@/lib/sse-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [realtimeMetrics, eventBusStats, sseStats, healthSummary] = [
      getRealtimeMetrics(),
      getEventBusStats(),
      getSSEStats(),
      getHealthSummary(),
    ];

    return NextResponse.json({
      status: healthSummary.status,
      timestamp: new Date().toISOString(),
      connections: {
        websocket: realtimeMetrics.wsConnections,
        sse: realtimeMetrics.sseConnections,
        total: realtimeMetrics.totalConnections,
        sseByChannel: sseStats.connectionsByChannel,
        sseByUser: sseStats.connectionsByUser,
      },
      events: {
        eventsPerSecond: realtimeMetrics.eventsPerSecond,
        channels: realtimeMetrics.channels,
        eventBus: eventBusStats,
      },
      health: {
        status: healthSummary.status,
        details: realtimeMetrics.healthDetails,
        reconnectionRate: realtimeMetrics.reconnectionRate,
        errorRate: realtimeMetrics.errorRate,
      },
    });
  } catch (error) {
    console.error('[RealtimeStatus] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to get realtime status', error: String(error) },
      { status: 500 },
    );
  }
}
