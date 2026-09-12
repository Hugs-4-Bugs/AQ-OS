// ═══════════════════════════════════════════════════════════════════
// GET /api/events/analytics — SSE stream for realtime analytics updates
// Phase 13: Server-Sent Events for live analytics
//
// Event types:
//   analytics_update   — Dashboard metric updates (leads, AI, billing, workflows)
//   anomaly_detected   — New anomaly alert from AnalyticsAnomaly table
//   insight_generated  — New insight from AnalyticsInsight table
//   prediction_updated — New/updated prediction from AnalyticsPrediction table
//   competitor_changed — Competitor data change from CompetitorSnapshot table
//   report_completed   — Report finished from Report table
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { subscribeToUserChannel, getEventHistory } from '@/lib/realtime-engine';
import type { EventChannel } from '@/lib/realtime-engine';
import { db } from '@/lib/db';
import {
  getLeadMetrics,
  getAIMetrics,
  getBillingMetrics,
  getWorkflowMetrics,
} from '@/lib/analytics-engine';

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_SSE_TIMEOUT_MS = 300_000; // 5 minutes
const POLL_INTERVAL_MS = 15_000; // 15 seconds for polling fallback

// ═══════════════════════════════════════════════════════════════════
// CHANGE DETECTION: track last-seen timestamps per user so we only
// push new records on each poll cycle.
// ═══════════════════════════════════════════════════════════════════

const userLastPolled = new Map<string, {
  anomalies: Date;
  insights: Date;
  predictions: Date;
  competitorSnapshots: Date;
  reports: Date;
}>();

function getOrInitLastPolled(userId: string) {
  let entry = userLastPolled.get(userId);
  if (!entry) {
    const now = new Date(Date.now() - 60_000); // 1 min ago so initial connection gets recent items
    entry = {
      anomalies: now,
      insights: now,
      predictions: now,
      competitorSnapshots: now,
      reports: now,
    };
    userLastPolled.set(userId, entry);
  }
  return entry;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userId = user.id;
    const encoder = new TextEncoder();

    // Check Last-Event-ID header for resume support
    const lastEventId = request.headers.get('Last-Event-ID') || undefined;

    const stream = new ReadableStream({
      start(controller) {
        let eventCounter = 0;

        // Helper to send SSE event
        const sendEvent = (eventType: string, data: unknown) => {
          eventCounter++;
          try {
            controller.enqueue(
              encoder.encode(`id: evt_${Date.now()}_${eventCounter}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            // Stream may be closed
          }
        };

        // Send initial connection comment
        controller.enqueue(encoder.encode(': connected\n\n'));

        // Replay missed events if Last-Event-ID was provided
        if (lastEventId) {
          try {
            const missedEvents = getEventHistory(userId, lastEventId, 50);
            for (const event of missedEvents) {
              controller.enqueue(
                encoder.encode(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`)
              );
            }
          } catch (error) {
            console.error('[SSE /events/analytics] Error replaying events:', error);
          }
        }

        // ── Send initial state on connection ──────────────────────
        (async () => {
          try {
            const [leadMetrics, aiMetrics, billingMetrics, workflowMetrics] = await Promise.all([
              getLeadMetrics(userId, '7d').catch(() => null),
              getAIMetrics(userId, { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }).catch(() => null),
              getBillingMetrics(userId, { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }).catch(() => null),
              getWorkflowMetrics(userId, '7d').catch(() => null),
            ]);

            sendEvent('analytics_update', {
              source: 'initial',
              leads: leadMetrics,
              ai: aiMetrics,
              billing: billingMetrics,
              workflows: workflowMetrics,
              timestamp: new Date().toISOString(),
            });

            // Send recent active anomalies
            const recentAnomalies = await db.analyticsAnomaly.findMany({
              where: { userId, status: 'active' },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            for (const anomaly of recentAnomalies) {
              sendEvent('anomaly_detected', {
                id: anomaly.id,
                category: anomaly.category,
                anomalyType: anomaly.anomalyType,
                severity: anomaly.severity,
                metricName: anomaly.metricName,
                expectedValue: anomaly.expectedValue,
                actualValue: anomaly.actualValue,
                deviation: anomaly.deviation,
                description: anomaly.description,
                status: anomaly.status,
                createdAt: anomaly.createdAt.toISOString(),
              });
            }

            // Send recent unread insights
            const recentInsights = await db.analyticsInsight.findMany({
              where: { userId, isRead: false },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            for (const insight of recentInsights) {
              sendEvent('insight_generated', {
                id: insight.id,
                category: insight.category,
                insightType: insight.insightType,
                title: insight.title,
                description: insight.description,
                impact: insight.impact,
                changePercent: insight.changePercent,
                actionSuggestion: insight.actionSuggestion,
                createdAt: insight.createdAt.toISOString(),
              });
            }

            // Send recent predictions
            const recentPredictions = await db.analyticsPrediction.findMany({
              where: {
                userId,
                expiresAt: { gte: new Date() },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            for (const prediction of recentPredictions) {
              sendEvent('prediction_updated', {
                id: prediction.id,
                category: prediction.category,
                predictionType: prediction.predictionType,
                targetEntityId: prediction.targetEntityId,
                predictedValue: prediction.predictedValue,
                confidence: prediction.confidence,
                predictionHorizon: prediction.predictionHorizon,
                createdAt: prediction.createdAt.toISOString(),
              });
            }

            // Send recent competitor snapshots
            const recentSnapshots = await db.competitorSnapshot.findMany({
              where: { userId },
              orderBy: { createdAt: 'desc' },
              take: 5,
            });
            for (const snapshot of recentSnapshots) {
              sendEvent('competitor_changed', {
                id: snapshot.id,
                competitorId: snapshot.competitorId,
                snapshotType: snapshot.snapshotType,
                seoScore: snapshot.seoScore,
                socialScore: snapshot.socialScore,
                createdAt: snapshot.createdAt.toISOString(),
              });
            }

            // Send recently completed reports
            const recentReports = await db.report.findMany({
              where: { userId, lastRunAt: { not: null } },
              orderBy: { lastRunAt: 'desc' },
              take: 5,
            });
            for (const report of recentReports) {
              sendEvent('report_completed', {
                id: report.id,
                name: report.name,
                type: report.type,
                dashboard: report.dashboard,
                lastRunAt: report.lastRunAt?.toISOString(),
                exportFormat: report.exportFormat,
              });
            }
          } catch (error) {
            console.error('[SSE /events/analytics] Error sending initial state:', error);
          }
        })();

        // ── Subscribe to event bus channels ──────────────────────
        const channels: EventChannel[] = ['lead_events', 'ai_events', 'payment_events', 'workflow_events'];
        const unsubscribers: (() => void)[] = [];

        for (const channel of channels) {
          const unsub = subscribeToUserChannel(userId, channel, (event) => {
            try {
              const sseEvent = `id: ${event.eventId}\nevent: analytics_update\ndata: ${JSON.stringify({ source: 'eventbus', channel: event.channel, type: event.type, payload: event.payload, timestamp: new Date().toISOString() })}\n\n`;
              controller.enqueue(encoder.encode(sseEvent));
            } catch {
              // Stream may already be closed
              unsub();
            }
          });
          unsubscribers.push(unsub);
        }

        // ── Polling: periodically check for new analytics data ───
        const pollInterval = setInterval(async () => {
          try {
            eventCounter++;
            const last = getOrInitPolled(userId);

            // 1. Dashboard metric updates (analytics_update)
            const [leadMetrics, aiMetrics, billingMetrics, workflowMetrics] = await Promise.all([
              getLeadMetrics(userId, '7d').catch(() => null),
              getAIMetrics(userId, { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }).catch(() => null),
              getBillingMetrics(userId, { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() }).catch(() => null),
              getWorkflowMetrics(userId, '7d').catch(() => null),
            ]);

            sendEvent('analytics_update', {
              source: 'poll',
              leads: leadMetrics,
              ai: aiMetrics,
              billing: billingMetrics,
              workflows: workflowMetrics,
              timestamp: new Date().toISOString(),
            });

            // 2. New anomalies since last poll
            const newAnomalies = await db.analyticsAnomaly.findMany({
              where: {
                userId,
                createdAt: { gt: last.anomalies },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            });
            for (const anomaly of newAnomalies) {
              sendEvent('anomaly_detected', {
                id: anomaly.id,
                category: anomaly.category,
                anomalyType: anomaly.anomalyType,
                severity: anomaly.severity,
                metricName: anomaly.metricName,
                expectedValue: anomaly.expectedValue,
                actualValue: anomaly.actualValue,
                deviation: anomaly.deviation,
                description: anomaly.description,
                status: anomaly.status,
                createdAt: anomaly.createdAt.toISOString(),
              });
            }
            if (newAnomalies.length > 0) {
              last.anomalies = newAnomalies[0].createdAt;
            }

            // 3. New insights since last poll
            const newInsights = await db.analyticsInsight.findMany({
              where: {
                userId,
                createdAt: { gt: last.insights },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            });
            for (const insight of newInsights) {
              sendEvent('insight_generated', {
                id: insight.id,
                category: insight.category,
                insightType: insight.insightType,
                title: insight.title,
                description: insight.description,
                impact: insight.impact,
                metricName: insight.metricName,
                metricBefore: insight.metricBefore,
                metricAfter: insight.metricAfter,
                changePercent: insight.changePercent,
                isActionable: insight.isActionable,
                actionSuggestion: insight.actionSuggestion,
                createdAt: insight.createdAt.toISOString(),
              });
            }
            if (newInsights.length > 0) {
              last.insights = newInsights[0].createdAt;
            }

            // 4. New predictions since last poll
            const newPredictions = await db.analyticsPrediction.findMany({
              where: {
                userId,
                createdAt: { gt: last.predictions },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            });
            for (const prediction of newPredictions) {
              sendEvent('prediction_updated', {
                id: prediction.id,
                category: prediction.category,
                predictionType: prediction.predictionType,
                targetEntityId: prediction.targetEntityId,
                predictedValue: prediction.predictedValue,
                confidence: prediction.confidence,
                predictionHorizon: prediction.predictionHorizon,
                modelVersion: prediction.modelVersion,
                createdAt: prediction.createdAt.toISOString(),
              });
            }
            if (newPredictions.length > 0) {
              last.predictions = newPredictions[0].createdAt;
            }

            // 5. New competitor snapshots since last poll
            const newSnapshots = await db.competitorSnapshot.findMany({
              where: {
                userId,
                createdAt: { gt: last.competitorSnapshots },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            });
            for (const snapshot of newSnapshots) {
              // Also look up the CompetitorAnalysis for name info
              const competitor = await db.competitorAnalysis.findUnique({
                where: { id: snapshot.competitorId },
                select: { competitorName: true, competitorUrl: true },
              });
              sendEvent('competitor_changed', {
                id: snapshot.id,
                competitorId: snapshot.competitorId,
                competitorName: competitor?.competitorName || 'Unknown',
                competitorUrl: competitor?.competitorUrl || null,
                snapshotType: snapshot.snapshotType,
                seoScore: snapshot.seoScore,
                socialScore: snapshot.socialScore,
                pricingModel: snapshot.pricingModel,
                techStack: snapshot.techStack,
                strengths: snapshot.strengths,
                weaknesses: snapshot.weaknesses,
                estimatedTraffic: snapshot.estimatedTraffic,
                createdAt: snapshot.createdAt.toISOString(),
              });
            }
            if (newSnapshots.length > 0) {
              last.competitorSnapshots = newSnapshots[0].createdAt;
            }

            // 6. Newly completed reports since last poll
            const newReports = await db.report.findMany({
              where: {
                userId,
                lastRunAt: { gt: last.reports },
              },
              orderBy: { lastRunAt: 'desc' },
              take: 20,
            });
            for (const report of newReports) {
              sendEvent('report_completed', {
                id: report.id,
                name: report.name,
                description: report.description,
                type: report.type,
                dashboard: report.dashboard,
                exportFormat: report.exportFormat,
                lastExportUrl: report.lastExportUrl,
                lastRunAt: report.lastRunAt?.toISOString(),
              });
            }
            if (newReports.length > 0) {
              last.reports = newReports[0].lastRunAt!;
            }
          } catch (error) {
            console.error('[SSE /events/analytics] Polling error:', error);
          }
        }, POLL_INTERVAL_MS);

        // ── Heartbeat to keep connection alive ────────────────────
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(heartbeat);
            clearInterval(pollInterval);
            unsubscribers.forEach((unsub) => unsub());
            userLastPolled.delete(userId);
          }
        }, HEARTBEAT_INTERVAL_MS);

        // ── Cleanup on client disconnect (abort signal) ──────────
        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          clearInterval(pollInterval);
          unsubscribers.forEach((unsub) => unsub());
          userLastPolled.delete(userId);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });

        // ── Timeout: close stream after SSE_TIMEOUT ──────────────
        const timeoutMs = parseInt(process.env.SSE_TIMEOUT || String(DEFAULT_SSE_TIMEOUT_MS), 10);
        setTimeout(() => {
          clearInterval(heartbeat);
          clearInterval(pollInterval);
          unsubscribers.forEach((unsub) => unsub());
          userLastPolled.delete(userId);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }, timeoutMs);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    }) as unknown as NextResponse;
  });
}

// Alias to avoid naming clash with the map
function getOrInitPolled(userId: string) {
  return getOrInitLastPolled(userId);
}
