// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Queue Observability Service
// Phase 7 Remediation: Lead engine fixes
//
// Tracks job queue depth, processing time, worker utilization,
// identifies bottlenecks, and alerts on queue backlog.
// ═══════════════════════════════════════════════════════════════════

import { getQueueStats, getWorkers, getJobsByStatus, type JobStatus } from './distributed-scraping-service';

// ===== TYPES =====

export interface QueueDepthInfo {
  current: number;
  byStatus: Record<JobStatus, number>;
  byPriority: Record<string, number>;
  trend: 'increasing' | 'stable' | 'decreasing';
  alertLevel: 'none' | 'warning' | 'critical';
  alertMessage: string | null;
}

export interface ProcessingTimeStats {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  sampleSize: number;
  byJobType: Record<string, { avgMs: number; count: number }>;
}

export interface WorkerUtilizationInfo {
  totalWorkers: number;
  idleWorkers: number;
  busyWorkers: number;
  offlineWorkers: number;
  utilizationPercent: number;
  perWorker: Array<{
    workerId: string;
    status: 'idle' | 'busy' | 'offline';
    jobsCompleted: number;
    jobsFailed: number;
    currentJobId: string | null;
    avgProcessingTimeMs: number;
    lastHeartbeat: Date | null;
  }>;
}

export interface Bottleneck {
  type: 'worker_shortage' | 'queue_backlog' | 'slow_processing' | 'high_failure_rate' | 'rate_limiting';
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  affectedJobs: number;
}

export interface QueueObservabilityReport {
  queueDepth: QueueDepthInfo;
  processingTime: ProcessingTimeStats;
  workerUtilization: WorkerUtilizationInfo;
  bottlenecks: Bottleneck[];
  timestamp: Date;
}

// ===== IN-MEMORY TRACKING =====

// Historical queue depth for trend calculation
const queueDepthHistory: Array<{ timestamp: Date; depth: number }> = [];
const MAX_HISTORY = 60; // Keep last 60 data points

// Processing time samples
const processingTimeSamples: Array<{ jobType: string; durationMs: number; timestamp: Date }> = [];
const MAX_SAMPLES = 5000;

// ===== ALERT THRESHOLDS =====

const QUEUE_BACKLOG_WARNING = 50; // Jobs queued
const QUEUE_BACKLOG_CRITICAL = 200;
const UTILIZATION_WARNING = 0.9; // 90% utilization
const UTILIZATION_CRITICAL = 0.98;
const AVG_PROCESSING_TIME_SLOW = 30000; // 30 seconds
const FAILURE_RATE_WARNING = 0.2; // 20%
const FAILURE_RATE_CRITICAL = 0.5; // 50%

// ===== CORE FUNCTIONS =====

/**
 * Get current queue depth with trend and alerting.
 */
export function getQueueDepth(): QueueDepthInfo {
  const stats = getQueueStats();
  const runningJobs = getJobsByStatus('running');
  const queuedJobs = getJobsByStatus('queued');

  // Calculate by priority
  const byPriority: Record<string, number> = { high: 0, medium: 0, low: 0 };
  queuedJobs.forEach((job) => {
    byPriority[job.priority] = (byPriority[job.priority] || 0) + 1;
  });

  const current = stats.queued;

  // Record depth for trend
  queueDepthHistory.push({ timestamp: new Date(), depth: current });
  if (queueDepthHistory.length > MAX_HISTORY) {
    queueDepthHistory.splice(0, queueDepthHistory.length - MAX_HISTORY);
  }

  // Calculate trend
  const trend = calculateDepthTrend();

  // Determine alert level
  let alertLevel: QueueDepthInfo['alertLevel'] = 'none';
  let alertMessage: string | null = null;

  if (current >= QUEUE_BACKLOG_CRITICAL) {
    alertLevel = 'critical';
    alertMessage = `Critical queue backlog: ${current} jobs waiting. Scale workers immediately.`;
  } else if (current >= QUEUE_BACKLOG_WARNING) {
    alertLevel = 'warning';
    alertMessage = `Queue backlog warning: ${current} jobs waiting. Consider adding workers.`;
  } else if (stats.workersTotal > 0 && stats.workersIdle === 0 && current > 10) {
    alertLevel = 'warning';
    alertMessage = `All workers busy with ${current} jobs queued. No idle capacity.`;
  }

  return {
    current,
    byStatus: {
      queued: stats.queued,
      running: stats.running,
      completed: stats.completed,
      failed: stats.failed,
    },
    byPriority,
    trend,
    alertLevel,
    alertMessage,
  };
}

/**
 * Get processing time statistics.
 */
export function getProcessingTimeStats(): ProcessingTimeStats {
  const samples = [...processingTimeSamples];

  if (samples.length === 0) {
    return {
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      minMs: 0,
      maxMs: 0,
      sampleSize: 0,
      byJobType: {},
    };
  }

  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const n = durations.length;

  const byJobType: Record<string, { avgMs: number; count: number }> = {};
  samples.forEach((s) => {
    if (!byJobType[s.jobType]) {
      byJobType[s.jobType] = { avgMs: 0, count: 0 };
    }
    const entry = byJobType[s.jobType];
    entry.avgMs = (entry.avgMs * entry.count + s.durationMs) / (entry.count + 1);
    entry.count++;
  });

  return {
    avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / n),
    p50Ms: Math.round(durations[Math.floor(n * 0.5)]),
    p95Ms: Math.round(durations[Math.floor(n * 0.95)]),
    p99Ms: Math.round(durations[Math.min(n - 1, Math.floor(n * 0.99))]),
    minMs: Math.round(durations[0]),
    maxMs: Math.round(durations[n - 1]),
    sampleSize: n,
    byJobType: Object.fromEntries(
      Object.entries(byJobType).map(([k, v]) => [k, { avgMs: Math.round(v.avgMs), count: v.count }])
    ),
  };
}

/**
 * Get worker utilization information.
 */
export function getWorkerUtilization(): WorkerUtilizationInfo {
  const allWorkers = getWorkers();
  const totalWorkers = allWorkers.length;
  const idleWorkers = allWorkers.filter((w) => w.status === 'idle').length;
  const busyWorkers = allWorkers.filter((w) => w.status === 'busy').length;
  const offlineWorkers = allWorkers.filter((w) => w.status === 'offline').length;

  const utilizationPercent = totalWorkers > 0
    ? Math.round((busyWorkers / totalWorkers) * 100)
    : 0;

  const perWorker = allWorkers.map((w) => ({
    workerId: w.id,
    status: w.status,
    jobsCompleted: w.jobsCompleted,
    jobsFailed: w.jobsFailed,
    currentJobId: w.currentJobId,
    avgProcessingTimeMs: 0, // Would be computed from actual samples
    lastHeartbeat: w.lastHeartbeat,
  }));

  return {
    totalWorkers,
    idleWorkers,
    busyWorkers,
    offlineWorkers,
    utilizationPercent,
    perWorker,
  };
}

/**
 * Identify bottlenecks in the scraping pipeline.
 */
export function identifyBottlenecks(): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const stats = getQueueStats();
  const utilization = getWorkerUtilization();
  const processingTime = getProcessingTimeStats();

  // Check for worker shortage
  if (utilization.totalWorkers === 0) {
    bottlenecks.push({
      type: 'worker_shortage',
      severity: 'high',
      description: 'No workers registered',
      recommendation: 'Register at least one worker to process scraping jobs',
      affectedJobs: stats.queued,
    });
  } else if (utilization.utilizationPercent >= 95 && stats.queued > 20) {
    bottlenecks.push({
      type: 'worker_shortage',
      severity: 'high',
      description: `Workers at ${utilization.utilizationPercent}% utilization with ${stats.queued} jobs queued`,
      recommendation: 'Add more workers to handle the queue backlog',
      affectedJobs: stats.queued,
    });
  } else if (utilization.utilizationPercent >= UTILIZATION_WARNING * 100) {
    bottlenecks.push({
      type: 'worker_shortage',
      severity: 'medium',
      description: `Workers at ${utilization.utilizationPercent}% utilization`,
      recommendation: 'Consider adding workers before queue backlog grows',
      affectedJobs: stats.queued,
    });
  }

  // Check for queue backlog
  if (stats.queued >= QUEUE_BACKLOG_CRITICAL) {
    bottlenecks.push({
      type: 'queue_backlog',
      severity: 'critical',
      description: `${stats.queued} jobs in queue (critical threshold: ${QUEUE_BACKLOG_CRITICAL})`,
      recommendation: 'Scale workers immediately or reduce job submission rate',
      affectedJobs: stats.queued,
    });
  } else if (stats.queued >= QUEUE_BACKLOG_WARNING) {
    bottlenecks.push({
      type: 'queue_backlog',
      severity: 'medium',
      description: `${stats.queued} jobs in queue (warning threshold: ${QUEUE_BACKLOG_WARNING})`,
      recommendation: 'Monitor queue growth and consider adding workers',
      affectedJobs: stats.queued,
    });
  }

  // Check for slow processing
  if (processingTime.avgMs > AVG_PROCESSING_TIME_SLOW && processingTime.sampleSize >= 10) {
    bottlenecks.push({
      type: 'slow_processing',
      severity: processingTime.avgMs > AVG_PROCESSING_TIME_SLOW * 2 ? 'high' : 'medium',
      description: `Average processing time ${Math.round(processingTime.avgMs / 1000)}s (threshold: ${Math.round(AVG_PROCESSING_TIME_SLOW / 1000)}s)`,
      recommendation: 'Investigate slow jobs, check proxy performance and target site responsiveness',
      affectedJobs: stats.running,
    });
  }

  // Check for high failure rate
  const totalCompleted = stats.completed + stats.failed;
  if (totalCompleted >= 10) {
    const failureRate = stats.failed / totalCompleted;
    if (failureRate >= FAILURE_RATE_CRITICAL) {
      bottlenecks.push({
        type: 'high_failure_rate',
        severity: 'critical',
        description: `Job failure rate at ${Math.round(failureRate * 100)}% (critical: ${FAILURE_RATE_CRITICAL * 100}%)`,
        recommendation: 'Stop submitting new jobs and investigate root cause of failures',
        affectedJobs: stats.failed,
      });
    } else if (failureRate >= FAILURE_RATE_WARNING) {
      bottlenecks.push({
        type: 'high_failure_rate',
        severity: 'medium',
        description: `Job failure rate at ${Math.round(failureRate * 100)}% (warning: ${FAILURE_RATE_WARNING * 100}%)`,
        recommendation: 'Check error logs and adjust scraping parameters',
        affectedJobs: stats.failed,
      });
    }
  }

  // Check for rate limiting (from processing time outliers)
  const rateLimitedTypes = Object.entries(processingTime.byJobType)
    .filter(([, v]) => v.avgMs > AVG_PROCESSING_TIME_SLOW * 3);
  if (rateLimitedTypes.length > 0) {
    bottlenecks.push({
      type: 'rate_limiting',
      severity: 'low',
      description: `Some job types showing very high latency (possible rate limiting): ${rateLimitedTypes.map(([t]) => t).join(', ')}`,
      recommendation: 'Reduce request frequency for affected sources or use proxy rotation',
      affectedJobs: rateLimitedTypes.reduce((sum, [, v]) => sum + v.count, 0),
    });
  }

  return bottlenecks.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

/**
 * Record a processing time sample for a completed job.
 */
export function recordProcessingTime(jobType: string, durationMs: number): void {
  processingTimeSamples.push({
    jobType,
    durationMs,
    timestamp: new Date(),
  });

  if (processingTimeSamples.length > MAX_SAMPLES) {
    processingTimeSamples.splice(0, processingTimeSamples.length - MAX_SAMPLES);
  }
}

/**
 * Generate a full observability report.
 */
export function getObservabilityReport(): QueueObservabilityReport {
  return {
    queueDepth: getQueueDepth(),
    processingTime: getProcessingTimeStats(),
    workerUtilization: getWorkerUtilization(),
    bottlenecks: identifyBottlenecks(),
    timestamp: new Date(),
  };
}

// ===== HELPER FUNCTIONS =====

function calculateDepthTrend(): 'increasing' | 'stable' | 'decreasing' {
  if (queueDepthHistory.length < 5) return 'stable';

  const recent = queueDepthHistory.slice(-5);
  const older = queueDepthHistory.slice(-10, -5);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, r) => sum + r.depth, 0) / recent.length;
  const olderAvg = older.reduce((sum, r) => sum + r.depth, 0) / older.length;

  const diff = recentAvg - olderAvg;
  const threshold = Math.max(olderAvg * 0.1, 5); // 10% or at least 5

  if (diff > threshold) return 'increasing';
  if (diff < -threshold) return 'decreasing';
  return 'stable';
}
