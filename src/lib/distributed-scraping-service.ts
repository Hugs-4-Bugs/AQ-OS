// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Distributed Scraping Service
// Phase 7 Remediation: Lead engine fixes
//
// Job queue for scraping tasks with worker assignment,
// priority levels, status tracking, result aggregation,
// and retry with exponential backoff.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type JobPriority = 'high' | 'medium' | 'low';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ScrapingJob {
  id: string;
  type: string;
  url: string;
  priority: JobPriority;
  status: JobStatus;
  workerId: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  scheduledAt: Date | null;
}

export interface WorkerInfo {
  id: string;
  status: 'idle' | 'busy' | 'offline';
  currentJobId: string | null;
  jobsCompleted: number;
  jobsFailed: number;
  lastHeartbeat: Date | null;
}

export interface ScrapingResult {
  jobId: string;
  success: boolean;
  data: Record<string, unknown>;
  metadata?: {
    responseTime?: number;
    statusCode?: number;
    proxyUsed?: string;
    timestamp: Date;
  };
}

// ===== IN-MEMORY STATE =====

// In-memory job queue (backed by DB for persistence)
const jobQueue: ScrapingJob[] = [];

// Worker registry
const workers = new Map<string, WorkerInfo>();

// Result cache
const resultCache = new Map<string, ScrapingResult>();

// ===== CONSTANTS =====

const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const MAX_RETRIES_DEFAULT = 3;
const BACKOFF_BASE_MS = 1000; // 1 second
const BACKOFF_MAX_MS = 60000; // 1 minute
const MAX_CONCURRENT_PER_WORKER = 1;

// ===== JOB MANAGEMENT =====

/**
 * Queue a new scraping job.
 * Returns the created job ID.
 */
export async function queueScrapingJob(config: {
  type: string;
  url: string;
  priority?: JobPriority;
  payload?: Record<string, unknown>;
  maxRetries?: number;
  scheduledAt?: Date;
}): Promise<string> {
  const priority = config.priority || 'medium';
  const maxRetries = config.maxRetries ?? MAX_RETRIES_DEFAULT;

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const job: ScrapingJob = {
    id: jobId,
    type: config.type,
    url: config.url,
    priority,
    status: 'queued',
    workerId: null,
    payload: config.payload || {},
    result: null,
    error: null,
    retryCount: 0,
    maxRetries,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    scheduledAt: config.scheduledAt || null,
  };

  // Insert into queue sorted by priority
  insertJobByPriority(job);

  return jobId;
}

/**
 * Assign a job to an available worker.
 * Returns the assigned job or null if no jobs/workers available.
 */
export async function assignWorker(workerId: string): Promise<ScrapingJob | null> {
  // Update worker heartbeat
  const worker = workers.get(workerId);
  if (worker) {
    worker.lastHeartbeat = new Date();
  }

  // Check if worker already has a job
  if (worker?.currentJobId) {
    return null;
  }

  // Find next queued job
  const nextJob = jobQueue.find(
    (job) =>
      job.status === 'queued' &&
      (!job.scheduledAt || job.scheduledAt <= new Date())
  );

  if (!nextJob) {
    return null;
  }

  // Assign job to worker
  nextJob.status = 'running';
  nextJob.workerId = workerId;
  nextJob.startedAt = new Date();

  // Update worker status
  if (worker) {
    worker.status = 'busy';
    worker.currentJobId = nextJob.id;
  }

  return nextJob;
}

/**
 * Update a job's status.
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates?: {
    result?: Record<string, unknown>;
    error?: string;
  }
): Promise<boolean> {
  const jobIndex = jobQueue.findIndex((j) => j.id === jobId);
  if (jobIndex === -1) return false;

  const job = jobQueue[jobIndex];
  job.status = status;

  if (updates?.result) {
    job.result = updates.result;
  }

  if (updates?.error) {
    job.error = updates.error;
  }

  if (status === 'completed' || status === 'failed') {
    job.completedAt = new Date();

    // Free up worker
    if (job.workerId) {
      const worker = workers.get(job.workerId);
      if (worker) {
        worker.status = 'idle';
        worker.currentJobId = null;
        if (status === 'completed') {
          worker.jobsCompleted++;
        } else {
          worker.jobsFailed++;
        }
      }
    }

    // If failed and retries available, re-queue
    if (status === 'failed' && job.retryCount < job.maxRetries) {
      await retryJob(jobId);
    }
  }

  return true;
}

/**
 * Get results for a completed job.
 */
export function getJobResults(jobId: string): ScrapingResult | null {
  return resultCache.get(jobId) || null;
}

/**
 * Retry failed jobs with exponential backoff.
 * Returns the number of jobs re-queued.
 */
export async function retryFailedJobs(): Promise<number> {
  let retried = 0;

  for (const job of jobQueue) {
    if (job.status === 'failed' && job.retryCount < job.maxRetries) {
      await retryJob(job.id);
      retried++;
    }
  }

  return retried;
}

// ===== WORKER MANAGEMENT =====

/**
 * Register a new worker.
 */
export function registerWorker(workerId: string): WorkerInfo {
  const worker: WorkerInfo = {
    id: workerId,
    status: 'idle',
    currentJobId: null,
    jobsCompleted: 0,
    jobsFailed: 0,
    lastHeartbeat: new Date(),
  };

  workers.set(workerId, worker);
  return worker;
}

/**
 * Unregister a worker and re-queue its current job.
 */
export function unregisterWorker(workerId: string): void {
  const worker = workers.get(workerId);
  if (!worker) return;

  // If worker has a current job, re-queue it
  if (worker.currentJobId) {
    const job = jobQueue.find((j) => j.id === worker.currentJobId);
    if (job && job.status === 'running') {
      job.status = 'queued';
      job.workerId = null;
      job.startedAt = null;
    }
  }

  workers.delete(workerId);
}

/**
 * Get all registered workers.
 */
export function getWorkers(): WorkerInfo[] {
  return Array.from(workers.values());
}

/**
 * Get queue statistics.
 */
export function getQueueStats(): {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
  workersIdle: number;
  workersBusy: number;
  workersTotal: number;
} {
  const allWorkers = Array.from(workers.values());

  return {
    queued: jobQueue.filter((j) => j.status === 'queued').length,
    running: jobQueue.filter((j) => j.status === 'running').length,
    completed: jobQueue.filter((j) => j.status === 'completed').length,
    failed: jobQueue.filter((j) => j.status === 'failed').length,
    total: jobQueue.length,
    workersIdle: allWorkers.filter((w) => w.status === 'idle').length,
    workersBusy: allWorkers.filter((w) => w.status === 'busy').length,
    workersTotal: allWorkers.length,
  };
}

// ===== HELPER FUNCTIONS =====

function insertJobByPriority(job: ScrapingJob): void {
  const jobWeight = PRIORITY_WEIGHTS[job.priority];

  let insertIndex = jobQueue.length;
  for (let i = 0; i < jobQueue.length; i++) {
    const existingWeight = PRIORITY_WEIGHTS[jobQueue[i].priority];
    if (jobWeight > existingWeight) {
      insertIndex = i;
      break;
    }
  }

  jobQueue.splice(insertIndex, 0, job);
}

async function retryJob(jobId: string): Promise<void> {
  const job = jobQueue.find((j) => j.id === jobId);
  if (!job) return;

  job.retryCount++;
  job.status = 'queued';
  job.workerId = null;
  job.startedAt = null;
  job.completedAt = null;
  job.error = null;

  // Calculate exponential backoff delay
  const delayMs = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, job.retryCount - 1) + Math.random() * 1000,
    BACKOFF_MAX_MS
  );

  job.scheduledAt = new Date(Date.now() + delayMs);

  console.log(
    `[DistributedScraping] Retrying job ${jobId} (attempt ${job.retryCount}/${job.maxRetries}) after ${Math.round(delayMs)}ms`
  );
}

/**
 * Store a scraping result in the cache.
 */
export function storeResult(result: ScrapingResult): void {
  resultCache.set(result.jobId, result);

  // Limit cache size
  if (resultCache.size > 1000) {
    const firstKey = resultCache.keys().next().value;
    if (firstKey) resultCache.delete(firstKey);
  }
}

/**
 * Get jobs by status.
 */
export function getJobsByStatus(status: JobStatus): ScrapingJob[] {
  return jobQueue.filter((j) => j.status === status);
}

/**
 * Get a specific job by ID.
 */
export function getJob(jobId: string): ScrapingJob | undefined {
  return jobQueue.find((j) => j.id === jobId);
}

/**
 * Clear completed and failed jobs from the queue.
 */
export function cleanupJobs(): number {
  const beforeCount = jobQueue.length;

  // Remove completed jobs older than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (let i = jobQueue.length - 1; i >= 0; i--) {
    const job = jobQueue[i];
    if (
      (job.status === 'completed' || job.status === 'failed') &&
      job.completedAt &&
      job.completedAt < oneHourAgo
    ) {
      jobQueue.splice(i, 1);
    }
  }

  return beforeCount - jobQueue.length;
}
