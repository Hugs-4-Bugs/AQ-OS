'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type AnalyticsEventType =
  | 'analytics_update'
  | 'anomaly_detected'
  | 'insight_generated'
  | 'prediction_updated'
  | 'competitor_changed'
  | 'report_completed';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface AnomalyData {
  id: string;
  category: string;
  anomalyType: string;
  severity: string;
  metricName: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  description: string;
  relatedEntityId?: string;
  status: string;
  createdAt: string;
}

export interface InsightData {
  id: string;
  category: string;
  insightType: string;
  title: string;
  description: string;
  impact: string;
  metricName?: string;
  metricBefore?: number;
  metricAfter?: number;
  changePercent?: number;
  isActionable: boolean;
  actionSuggestion?: string;
  createdAt: string;
}

export interface PredictionData {
  id: string;
  category: string;
  predictionType: string;
  targetEntityId?: string;
  predictedValue: number;
  confidence: number;
  predictionHorizon?: string;
  modelVersion?: string;
  createdAt: string;
}

export interface CompetitorChangeData {
  id: string;
  competitorId: string;
  competitorName: string;
  competitorUrl?: string;
  snapshotType: string;
  seoScore?: number;
  socialScore?: number;
  pricingModel?: string;
  techStack?: string;
  strengths?: string;
  weaknesses?: string;
  estimatedTraffic?: string;
  createdAt: string;
}

export interface ReportCompletedData {
  id: string;
  name: string;
  description?: string;
  type: string;
  dashboard?: string;
  exportFormat: string;
  lastExportUrl?: string;
  lastRunAt?: string;
}

export interface AnalyticsUpdateData {
  source: string;
  leads?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  billing?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
  timestamp: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseAnalyticsRealtimeOptions {
  /** Whether to enable the connection (default: true) */
  enabled?: boolean;
  /** General event callback for any event type */
  onEvent?: (event: AnalyticsEvent) => void;
  /** Called when dashboard metrics update */
  onAnalyticsUpdate?: (data: AnalyticsUpdateData) => void;
  /** Called when an anomaly is detected */
  onAnomalyDetected?: (data: AnomalyData) => void;
  /** Called when an insight is generated */
  onInsightGenerated?: (data: InsightData) => void;
  /** Called when a prediction is updated */
  onPredictionUpdated?: (data: PredictionData) => void;
  /** Called when competitor data changes */
  onCompetitorChanged?: (data: CompetitorChangeData) => void;
  /** Called when a report completes */
  onReportCompleted?: (data: ReportCompletedData) => void;
  /** Called when connection status changes */
  onConnectionChange?: (status: ConnectionStatus) => void;
}

export interface UseAnalyticsRealtimeReturn {
  /** All received events (capped at maxEvents) */
  events: AnalyticsEvent[];
  /** The most recent event */
  latestEvent: AnalyticsEvent | null;
  /** Current connection status */
  connected: boolean;
  /** Detailed connection status */
  connectionStatus: ConnectionStatus;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Manually reconnect */
  reconnect: () => void;
  /** Latest analytics update data */
  latestAnalyticsUpdate: AnalyticsUpdateData | null;
  /** Active anomalies from events */
  activeAnomalies: AnomalyData[];
  /** Recent insights from events */
  recentInsights: InsightData[];
  /** Latest predictions from events */
  latestPredictions: PredictionData[];
  /** Recent competitor changes */
  recentCompetitorChanges: CompetitorChangeData[];
  /** Recent completed reports */
  recentReports: ReportCompletedData[];
}

const MAX_EVENTS = 100;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

/**
 * Hook for realtime analytics updates via SSE.
 * Connects to /api/events/analytics endpoint.
 * Supports all analytics event types with individual callbacks.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useAnalyticsRealtime(
  options: UseAnalyticsRealtimeOptions = {}
): UseAnalyticsRealtimeReturn {
  const {
    enabled = true,
    onEvent,
    onAnalyticsUpdate,
    onAnomalyDetected,
    onInsightGenerated,
    onPredictionUpdated,
    onCompetitorChanged,
    onReportCompleted,
    onConnectionChange,
  } = options;

  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<AnalyticsEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [latestAnalyticsUpdate, setLatestAnalyticsUpdate] = useState<AnalyticsUpdateData | null>(null);
  const [activeAnomalies, setActiveAnomalies] = useState<AnomalyData[]>([]);
  const [recentInsights, setRecentInsights] = useState<InsightData[]>([]);
  const [latestPredictions, setLatestPredictions] = useState<PredictionData[]>([]);
  const [recentCompetitorChanges, setRecentCompetitorChanges] = useState<CompetitorChangeData[]>([]);
  const [recentReports, setRecentReports] = useState<ReportCompletedData[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Ref to hold the connect function so the onerror handler can call it
  // without causing a "accessed before declaration" lint error
  const connectRef = useRef<() => void>(() => {});

  // Stabilized callback refs to avoid reconnection loops
  const onEventRef = useRef(onEvent);
  const onAnalyticsUpdateRef = useRef(onAnalyticsUpdate);
  const onAnomalyDetectedRef = useRef(onAnomalyDetected);
  const onInsightGeneratedRef = useRef(onInsightGenerated);
  const onPredictionUpdatedRef = useRef(onPredictionUpdated);
  const onCompetitorChangedRef = useRef(onCompetitorChanged);
  const onReportCompletedRef = useRef(onReportCompleted);
  const onConnectionChangeRef = useRef(onConnectionChange);

  // Update refs when callbacks change
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onAnalyticsUpdateRef.current = onAnalyticsUpdate; }, [onAnalyticsUpdate]);
  useEffect(() => { onAnomalyDetectedRef.current = onAnomalyDetected; }, [onAnomalyDetected]);
  useEffect(() => { onInsightGeneratedRef.current = onInsightGenerated; }, [onInsightGenerated]);
  useEffect(() => { onPredictionUpdatedRef.current = onPredictionUpdated; }, [onPredictionUpdated]);
  useEffect(() => { onCompetitorChangedRef.current = onCompetitorChanged; }, [onCompetitorChanged]);
  useEffect(() => { onReportCompletedRef.current = onReportCompleted; }, [onReportCompleted]);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; }, [onConnectionChange]);

  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    setConnected(status === 'connected');
    onConnectionChangeRef.current?.(status);
  }, []);

  // ── Process a received SSE event ──────────────────────────────
  const processEvent = useCallback((eventType: string, rawData: unknown) => {
    const timestamp = new Date().toISOString();
    const data = (typeof rawData === 'object' && rawData !== null) ? rawData as Record<string, unknown> : {};

    const analyticsEvent: AnalyticsEvent = {
      type: eventType as AnalyticsEventType,
      data,
      timestamp,
    };

    // Update event lists
    setLatestEvent(analyticsEvent);
    setEvents((prev) => {
      const updated = [...prev, analyticsEvent];
      return updated.slice(-MAX_EVENTS);
    });

    // Call general event callback
    onEventRef.current?.(analyticsEvent);

    // Call type-specific callbacks and update state
    switch (eventType) {
      case 'analytics_update': {
        const updateData = data as unknown as AnalyticsUpdateData;
        setLatestAnalyticsUpdate(updateData);
        onAnalyticsUpdateRef.current?.(updateData);
        break;
      }
      case 'anomaly_detected': {
        const anomalyData = data as unknown as AnomalyData;
        setActiveAnomalies((prev) => {
          // Add new anomaly, keep max 50, dedupe by id
          const existing = prev.filter(a => a.id !== anomalyData.id);
          return [anomalyData, ...existing].slice(0, 50);
        });
        onAnomalyDetectedRef.current?.(anomalyData);
        break;
      }
      case 'insight_generated': {
        const insightData = data as unknown as InsightData;
        setRecentInsights((prev) => {
          const existing = prev.filter(i => i.id !== insightData.id);
          return [insightData, ...existing].slice(0, 50);
        });
        onInsightGeneratedRef.current?.(insightData);
        break;
      }
      case 'prediction_updated': {
        const predictionData = data as unknown as PredictionData;
        setLatestPredictions((prev) => {
          // Replace existing prediction for same entity/type, or add new
          const existing = prev.filter(
            p => !(p.id === predictionData.id || (p.targetEntityId && p.targetEntityId === predictionData.targetEntityId && p.predictionType === predictionData.predictionType))
          );
          return [predictionData, ...existing].slice(0, 50);
        });
        onPredictionUpdatedRef.current?.(predictionData);
        break;
      }
      case 'competitor_changed': {
        const competitorData = data as unknown as CompetitorChangeData;
        setRecentCompetitorChanges((prev) => {
          const existing = prev.filter(c => c.id !== competitorData.id);
          return [competitorData, ...existing].slice(0, 30);
        });
        onCompetitorChangedRef.current?.(competitorData);
        break;
      }
      case 'report_completed': {
        const reportData = data as unknown as ReportCompletedData;
        setRecentReports((prev) => {
          const existing = prev.filter(r => r.id !== reportData.id);
          return [reportData, ...existing].slice(0, 20);
        });
        onReportCompletedRef.current?.(reportData);
        break;
      }
    }
  }, []);

  // ── Connect to SSE ────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!enabled) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    updateConnectionStatus('connecting');

    try {
      const es = new EventSource('/api/events/analytics');
      eventSourceRef.current = es;

      es.onopen = () => {
        updateConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
      };

      // Handle unnamed (default) messages
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          processEvent('analytics_update', parsed);
        } catch {
          // Ignore malformed events
        }
      };

      // ── Named event listeners ───────────────────────────────

      es.addEventListener('analytics_update', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('analytics_update', parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('anomaly_detected', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('anomaly_detected', parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('insight_generated', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('insight_generated', parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('prediction_updated', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('prediction_updated', parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('competitor_changed', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('competitor_changed', parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('report_completed', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          processEvent('report_completed', parsed);
        } catch {
          // Ignore
        }
      });

      // ── Error handling with auto-reconnect ──────────────────

      es.onerror = () => {
        updateConnectionStatus('disconnected');
        es.close();
        eventSourceRef.current = null;

        // Auto-reconnect with exponential backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          updateConnectionStatus('reconnecting');
          const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY
          );
          const jitter = Math.random() * 500; // Add jitter to prevent thundering herd
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            setReconnectAttempts(reconnectAttemptsRef.current);
            connectRef.current();
          }, delay + jitter);
        }
      };
    } catch {
      updateConnectionStatus('disconnected');
    }
  }, [enabled, updateConnectionStatus, processEvent]);

  // Keep the ref updated so the onerror handler can call it
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ── Manual reconnect ──────────────────────────────────────────
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connect();
  }, [connect]);

  // ── Auto-connect on mount ─────────────────────────────────────
  useEffect(() => {
    // Schedule connection on next tick to avoid synchronous setState in effect
    const timer = setTimeout(() => {
      connectRef.current();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      updateConnectionStatus('disconnected');
    };
  }, [enabled, updateConnectionStatus]);

  return {
    events,
    latestEvent,
    connected,
    connectionStatus,
    reconnectAttempts,
    reconnect,
    latestAnalyticsUpdate,
    activeAnomalies,
    recentInsights,
    latestPredictions,
    recentCompetitorChanges,
    recentReports,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export default useAnalyticsRealtime;
