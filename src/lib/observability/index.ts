// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Observability Barrel Export
// Phase 11: Observability Infrastructure (Updated L10)
// ═══════════════════════════════════════════════════════════════════

export { metricsCollector, MetricsCollector } from './metrics-collector';
export type { CounterEntry, HistogramEntry, GaugeEntry } from './metrics-collector';

export {
  logger,
  PerfTimer,
  setDefaultContext,
  clearDefaultContext,
  getDefaultContext,
  createModuleLogger,
  logApiRequest,
  logBusinessEvent,
} from './logger';
export type { LogLevel, LogEntry, ModuleLogger, ModuleLoggerOptions } from './logger';

export { apiMonitor, ApiMonitor, withApiMonitoring } from './api-monitor';
export type { ApiRequestMetrics } from './api-monitor';

export { alertEngine, AlertEngine, ALERT_RULES } from './alerts';
export type { Alert, AlertSeverity, AlertStatus } from './alerts';

export {
  trackError,
  getRecentErrors,
  getErrorCounts,
  acknowledgeError,
  clearErrors,
  hasCriticalErrors,
} from './error-tracker';
export type { TrackedError, ErrorSeverity, TrackErrorOptions } from './error-tracker';

export { logRequest, startRequestTimer } from './request-logger';

export {
  generateTraceId,
  generateSpanId,
  createRequestTrace,
  setTraceContext,
  getTraceContext,
  clearTraceContext,
  startDbSpan,
  startApiSpan,
  startAiSpan,
  startSpan,
  endSpan,
  traceAsync,
  traceSync,
  getRecentTraces,
  getActiveSpans,
  addSpanLog,
  addSpanTag,
} from './tracer';
export type { TraceContext, Span } from './tracer';

export { withMonitoring, traceDbCall, traceAiCall } from './middleware';

export { runFullHealthCheck, checkDatabase, checkRedis, checkMemory, checkDisk, checkProcess, checkEnvVars, checkProviders } from './health';
export type { HealthCheckResult, ComponentHealth, ComponentStatus } from './health';
