// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — OpenTelemetry Tracing Setup
// Phase 14.2: Observability Infrastructure
//
// Initializes OpenTelemetry SDK with:
// - Trace provider with console/OTLP exporter
// - Meter provider for metrics
// - Auto-instrumentation for HTTP
// - Span creation helpers for custom instrumentation
// - Trace context propagation
// ═══════════════════════════════════════════════════════════════════

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  type Span,
  type Tracer,
  type Context,
  type SpanOptions,
} from '@opentelemetry/api';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false'; // enabled by default
const OTEL_EXPORTER = process.env.OTEL_EXPORTER || 'console'; // 'console' | 'otlp'
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'acquisitionos';
const SERVICE_VERSION = process.env.npm_package_version || '0.2.0';
const DEPLOYMENT_ENV = process.env.NODE_ENV || 'development';

// ═══════════════════════════════════════════════════════════════════
// SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

let sdk: NodeSDK | null = null;
let isInitialized = false;

function initializeTracing(): void {
  if (isInitialized || !OTEL_ENABLED) {
    return;
  }

  try {
    // Build resource attributes
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      [ATTR_DEPLOYMENT_ENVIRONMENT]: DEPLOYMENT_ENV,
    });

    // Configure trace exporter based on environment
    const traceExporter = OTEL_EXPORTER === 'otlp'
      ? new OTLPTraceExporter({
          url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
          headers: {},
        })
      : new ConsoleSpanExporter();

    // Configure metric exporter
    const metricExporter = OTEL_EXPORTER === 'otlp'
      ? new OTLPMetricExporter({
          url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
          headers: {},
        })
      : undefined; // Console metric exporter is default

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000, // Export every 30 seconds
    });

    // Create SDK instance
    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable fs instrumentation to reduce noise
          '@opentelemetry/instrumentation-fs': { enabled: false },
          // Configure HTTP instrumentation
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            // Ignore health check and metrics endpoints to reduce noise
            ignoreIncomingRequestHook: (req) => {
              const url = req.url || '';
              return url === '/api/health' || url === '/api/health/detailed' || url === '/api/metrics';
            },
          },
          // Disable Prisma auto-instrumentation if not available
          '@opentelemetry/instrumentation-prisma': {
            enabled: true,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    isInitialized = true;

    console.log(`[OTEL] Tracing initialized — exporter: ${OTEL_EXPORTER}, service: ${SERVICE_NAME}`);

    // Graceful shutdown
    const shutdown = async () => {
      try {
        await sdk?.shutdown();
        console.log('[OTEL] Tracing shut down gracefully');
      } catch (err) {
        console.error('[OTEL] Error shutting down tracing:', err);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[OTEL] Failed to initialize tracing:', error);
  }
}

// NOTE: Auto-initialization is disabled to prevent startup issues with Next.js Turbopack.
// Call initializeTracing() explicitly in your application's instrumentation file
// or in a custom server entry point if you need distributed tracing.
// The helper functions (withSpan, traceDbQuery, etc.) work without initialization —
// they simply use the no-op tracer when OTEL is not initialized.

// ═══════════════════════════════════════════════════════════════════
// SPAN CREATION HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Get the global tracer for AcquisitionOS */
export function getTracer(name: string = 'acquisitionos', version?: string): Tracer {
  return trace.getTracer(name, version || SERVICE_VERSION);
}

/** Create and start a new span */
export function startSpan(
  name: string,
  options?: SpanOptions
): { span: Span; ctx: Context } {
  const tracer = getTracer();
  const span = tracer.startSpan(name, options);
  const ctx = trace.setSpan(context.active(), span);
  return { span, ctx };
}

/** Run a function within a new span context */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const { span, ctx } = startSpan(name, options);
  return context.with(ctx, async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Run a synchronous function within a new span context */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions
): T {
  const { span, ctx } = startSpan(name, options);
  return context.with(ctx, () => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS FOR COMMON OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/** Trace a database query */
export async function traceDbQuery<T>(
  operation: string,
  model: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`db.${model}.${operation}`, async (span) => {
    span.setAttribute('db.system', 'sqlite');
    span.setAttribute('db.operation', operation);
    span.setAttribute('db.model', model);
    span.setKind(SpanKind.CLIENT);
    return fn();
  });
}

/** Trace an AI API call */
export async function traceAiRequest<T>(
  type: string,
  provider: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`ai.${type}`, async (span) => {
    span.setAttribute('ai.type', type);
    span.setAttribute('ai.provider', provider);
    span.setKind(SpanKind.CLIENT);
    return fn();
  });
}

/** Trace an external API call */
export async function traceExternalCall<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`external.${service}.${operation}`, async (span) => {
    span.setAttribute('external.service', service);
    span.setAttribute('external.operation', operation);
    span.setKind(SpanKind.CLIENT);
    return fn();
  });
}

/** Trace a workflow execution */
export async function traceWorkflow<T>(
  workflowId: string,
  workflowName: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`workflow.${workflowName}`, async (span) => {
    span.setAttribute('workflow.id', workflowId);
    span.setAttribute('workflow.name', workflowName);
    return fn();
  });
}

/** Trace a credit operation */
export async function traceCreditOperation<T>(
  operation: string,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`credits.${operation}`, async (span) => {
    span.setAttribute('credits.operation', operation);
    span.setAttribute('credits.user_id', userId);
    return fn();
  });
}

// ═══════════════════════════════════════════════════════════════════
// TRACE CONTEXT PROPAGATION
// ═══════════════════════════════════════════════════════════════════

/** Get the current trace ID from the active context */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return ctx.traceId;
}

/** Get the current span ID from the active context */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return ctx.spanId;
}

/** Add an attribute to the current active span */
export function addSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/** Add an event to the current active span */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  type Span,
  type Tracer,
  type Context,
  type SpanOptions,
};

export { initializeTracing };

const tracingService = {
  initializeTracing,
  getTracer,
  startSpan,
  withSpan,
  withSpanSync,
  traceDbQuery,
  traceAiRequest,
  traceExternalCall,
  traceWorkflow,
  traceCreditOperation,
  getCurrentTraceId,
  getCurrentSpanId,
  addSpanAttribute,
  addSpanEvent,
};

export default tracingService;
