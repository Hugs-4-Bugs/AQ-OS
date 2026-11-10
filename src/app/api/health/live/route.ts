// AcquisitionOS — GET /api/health/live
// Liveness probe — confirms the process is running and can serve requests.
// Cheap & synchronous: no DB calls, no external checks, no auth.
// Returns 200 if the process can answer, 503 only on uncaught error.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(
      {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        pid: process.pid,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    return NextResponse.json(
      { status: 'down', timestamp: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
