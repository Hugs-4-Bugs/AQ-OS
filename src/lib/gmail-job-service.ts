// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Job Service
// Phase 9: Gmail Integration
// Background job processing for Gmail operations (Next.js compatible)
// In-memory priority queue with rate limiting and retry logic
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type JobType =
  | 'inbox_sync'
  | 'token_refresh'
  | 'thread_sync'
  | 'pubsub_check'
  | 'pubsub_setup';

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying';

export type JobPriority = 'low' | 'medium' | 'high' | 'critical';

interface GmailJob {
  id: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempts: number;
  maxRetries: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  error: string | null;
}

interface JobResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export class GmailJobError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string = 'GMAIL_JOB_ERROR', retryable: boolean = false) {
    super(message);
    this.name = 'GmailJobError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ===== JOB QUEUE IMPLEMENTATION =====

const PRIORITY_ORDER: Record<JobPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

class GmailJobQueue {
  private queue: Map<string, GmailJob> = new Map();
  private running: Set<string> = new Set();
  private completed: Map<string, GmailJob> = new Map();
  private readonly maxConcurrent = 10;
  private readonly maxCompletedHistory = 100;
  private isProcessing = false;

  /**
   * Add a job to the queue.
   */
  addJob(
    type: JobType,
    priority: JobPriority,
    payload: Record<string, unknown>,
    maxRetries: number = 3
  ): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const job: GmailJob = {
      id,
      type,
      priority,
      status: 'pending',
      payload,
      attempts: 0,
      maxRetries,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      nextRetryAt: null,
      error: null,
    };

    this.queue.set(id, job);
    console.log(`[GmailJob] Job added: ${id} (type: ${type}, priority: ${priority})`);

    // Start processing if not already running
    this.startProcessing();

    return id;
  }

  /**
   * Get the next job to process based on priority and creation time.
   */
  private getNextJob(): GmailJob | null {
    let nextJob: GmailJob | null = null;

    for (const job of this.queue.values()) {
      // Skip non-pending jobs
      if (job.status !== 'pending') continue;

      // Skip jobs scheduled for future retry
      if (job.nextRetryAt && new Date() < job.nextRetryAt) continue;

      // Skip if we've hit max concurrent
      if (this.running.size >= this.maxConcurrent) break;

      if (!nextJob) {
        nextJob = job;
      } else {
        // Compare priority (lower number = higher priority)
        const currentPriority = PRIORITY_ORDER[job.priority];
        const nextPriority = PRIORITY_ORDER[nextJob.priority];

        if (currentPriority < nextPriority) {
          nextJob = job;
        } else if (currentPriority === nextPriority && job.createdAt < nextJob.createdAt) {
          nextJob = job;
        }
      }
    }

    return nextJob;
  }

  /**
   * Start the job processing loop.
   */
  private startProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Use setImmediate-like behavior with setTimeout
    this.processLoop();
  }

  /**
   * Process loop — picks up and processes jobs.
   */
  private async processLoop(): Promise<void> {
    while (this.isProcessing) {
      // Check if we can run more jobs
      if (this.running.size >= this.maxConcurrent) {
        await sleep(1000);
        continue;
      }

      const job = this.getNextJob();
      if (!job) {
        // No jobs to process — wait and check again
        if (this.queue.size === 0) {
          // No jobs at all, stop processing
          this.isProcessing = false;
          return;
        }
        await sleep(500);
        continue;
      }

      // Mark as running
      job.status = 'running';
      job.startedAt = new Date();
      job.attempts++;
      this.running.add(job.id);

      // Process job asynchronously
      this.executeJob(job)
        .then(result => {
          this.handleJobComplete(job, result);
        })
        .catch(error => {
          this.handleJobError(job, error instanceof Error ? error : new Error(String(error)));
        });
    }
  }

  /**
   * Execute a job by type.
   */
  private async executeJob(job: GmailJob): Promise<JobResult> {
    console.log(`[GmailJob] Processing job: ${job.id} (type: ${job.type}, attempt: ${job.attempts})`);

    switch (job.type) {
      case 'inbox_sync':
        return this.executeInboxSync(job);
      case 'token_refresh':
        return this.executeTokenRefresh(job);
      case 'thread_sync':
        return this.executeThreadSync(job);
      case 'pubsub_check':
        return this.executePubSubCheck(job);
      case 'pubsub_setup':
        return this.executePubSubSetup(job);
      default:
        return { success: false, error: `Unknown job type: ${job.type}` };
    }
  }

  /**
   * Execute inbox sync job.
   */
  private async executeInboxSync(job: GmailJob): Promise<JobResult> {
    try {
      const { syncInbox } = await import('./gmail-inbox-service');
      const emailAccountId = job.payload.emailAccountId as string;

      if (!emailAccountId) {
        return { success: false, error: 'Missing emailAccountId' };
      }

      const result = await syncInbox(emailAccountId);

      return {
        success: true,
        data: {
          threadsSynced: result.threadsSynced,
          messagesSynced: result.messagesSynced,
          newThreads: result.newThreads,
          newMessages: result.newMessages,
          errors: result.errors,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute token refresh job.
   */
  private async executeTokenRefresh(job: GmailJob): Promise<JobResult> {
    try {
      const { refreshAccessToken } = await import('./gmail-oauth-service');
      const emailAccountId = job.payload.emailAccountId as string;

      if (!emailAccountId) {
        return { success: false, error: 'Missing emailAccountId' };
      }

      await refreshAccessToken(emailAccountId);

      return { success: true, data: { emailAccountId } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute thread sync job.
   */
  private async executeThreadSync(job: GmailJob): Promise<JobResult> {
    try {
      const { syncThread } = await import('./gmail-inbox-service');
      const emailAccountId = job.payload.emailAccountId as string;
      const gmailThreadId = job.payload.gmailThreadId as string;

      if (!emailAccountId || !gmailThreadId) {
        return { success: false, error: 'Missing emailAccountId or gmailThreadId' };
      }

      const result = await syncThread(emailAccountId, gmailThreadId);

      return {
        success: true,
        data: { threadId: result.threadId, messagesSynced: result.messagesSynced },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute PubSub health check job.
   */
  private async executePubSubCheck(job: GmailJob): Promise<JobResult> {
    try {
      const { checkAllPubSubHealth } = await import('./gmail-pubsub-service');
      const result = await checkAllPubSubHealth();

      return {
        success: true,
        data: {
          total: result.total,
          healthy: result.healthy,
          unhealthy: result.unhealthy,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute PubSub setup job.
   */
  private async executePubSubSetup(job: GmailJob): Promise<JobResult> {
    try {
      const { setupPubSubNotification } = await import('./gmail-pubsub-service');
      const emailAccountId = job.payload.emailAccountId as string;

      if (!emailAccountId) {
        return { success: false, error: 'Missing emailAccountId' };
      }

      const result = await setupPubSubNotification(emailAccountId);

      return {
        success: result.success,
        error: result.error,
        data: result.success ? { historyId: result.historyId, expiration: result.expiration } : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle job completion.
   */
  private handleJobComplete(job: GmailJob, result: JobResult): void {
    this.running.delete(job.id);

    if (result.success) {
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`[GmailJob] Job completed: ${job.id}`);
    } else {
      this.handleJobError(job, new Error(result.error || 'Job failed without error message'));
      return;
    }

    // Move to completed history
    this.queue.delete(job.id);
    this.completed.set(job.id, job);

    // Trim completed history
    if (this.completed.size > this.maxCompletedHistory) {
      const oldest = Array.from(this.completed.entries())
        .sort((a, b) => (a[1].completedAt?.getTime() || 0) - (b[1].completedAt?.getTime() || 0));
      for (let i = 0; i < oldest.length - this.maxCompletedHistory; i++) {
        this.completed.delete(oldest[i][0]);
      }
    }
  }

  /**
   * Handle job error with retry logic.
   */
  private handleJobError(job: GmailJob, error: Error): void {
    this.running.delete(job.id);
    job.error = error.message;

    console.error(`[GmailJob] Job failed: ${job.id} (attempt ${job.attempts}/${job.maxRetries}): ${error.message}`);

    if (job.attempts < job.maxRetries) {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, job.attempts - 1), 5 * 60 * 1000);
      job.nextRetryAt = new Date(Date.now() + backoffMs);
      job.status = 'retrying';

      console.log(`[GmailJob] Job retrying: ${job.id} in ${backoffMs}ms`);
    } else {
      // Max retries exceeded
      job.status = 'failed';
      job.completedAt = new Date();

      console.error(`[GmailJob] Job permanently failed: ${job.id} after ${job.attempts} attempts`);

      // Move to completed history
      this.queue.delete(job.id);
      this.completed.set(job.id, job);
    }
  }

  /**
   * Get job status.
   */
  getJobStatus(jobId: string): GmailJob | null {
    return this.queue.get(jobId) || this.completed.get(jobId) || null;
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    pending: number;
    running: number;
    retrying: number;
    completed: number;
    failed: number;
  } {
    let pending = 0;
    let retrying = 0;
    let failed = 0;

    for (const job of this.queue.values()) {
      if (job.status === 'pending') pending++;
      if (job.status === 'retrying') retrying++;
      if (job.status === 'failed') failed++;
    }

    let completed = 0;
    for (const job of this.completed.values()) {
      if (job.status === 'completed') completed++;
      if (job.status === 'failed') failed++;
    }

    return {
      pending,
      running: this.running.size,
      retrying,
      completed,
      failed,
    };
  }

  /**
   * Cancel a pending job.
   */
  cancelJob(jobId: string): boolean {
    const job = this.queue.get(jobId);
    if (!job || job.status === 'running') return false;

    job.status = 'failed';
    job.completedAt = new Date();
    job.error = 'Cancelled by user';

    this.queue.delete(jobId);
    this.completed.set(jobId, job);

    return true;
  }

  /**
   * Destroy the job queue.
   */
  destroy(): void {
    this.isProcessing = false;
    this.queue.clear();
    this.running.clear();
    this.completed.clear();
  }
}

// ===== SINGLETON =====

let jobQueueInstance: GmailJobQueue | null = null;

function getJobQueue(): GmailJobQueue {
  if (!jobQueueInstance) {
    jobQueueInstance = new GmailJobQueue();
  }
  return jobQueueInstance;
}

// ===== PUBLIC API =====

/**
 * Schedule an inbox sync job.
 * @param userId - The user ID
 * @param emailAccountId - The EmailAccount ID to sync
 * @returns Job ID
 */
export function scheduleInboxSync(userId: string, emailAccountId: string): string {
  console.log(`[GmailJob] Scheduling inbox sync for account: ${emailAccountId} (user: ${userId})`);
  return getJobQueue().addJob('inbox_sync', 'medium', { userId, emailAccountId }, 3);
}

/**
 * Schedule token refresh for all accounts with expiring tokens.
 * @returns Array of job IDs
 */
export async function scheduleTokenRefresh(): Promise<string[]> {
  const jobIds: string[] = [];

  try {
    // Find all active accounts with tokens expiring in the next 10 minutes
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

    const accounts = await db.emailAccount.findMany({
      where: {
        status: 'active',
        tokenExpiry: { lte: tenMinutesFromNow },
      },
      select: { id: true, userId: true },
    });

    for (const account of accounts) {
      const jobId = getJobQueue().addJob(
        'token_refresh',
        'high', // Token refresh is high priority
        { userId: account.userId, emailAccountId: account.id },
        3
      );
      jobIds.push(jobId);
    }

    console.log(`[GmailJob] Scheduled ${jobIds.length} token refresh jobs`);
  } catch (error) {
    console.error('[GmailJob] Failed to schedule token refresh:', error);
  }

  return jobIds;
}

/**
 * Schedule a thread sync job.
 * @param emailAccountId - The EmailAccount ID
 * @param threadId - The Gmail thread ID to sync
 * @returns Job ID
 */
export function scheduleThreadSync(emailAccountId: string, threadId: string): string {
  console.log(`[GmailJob] Scheduling thread sync: ${threadId} (account: ${emailAccountId})`);
  return getJobQueue().addJob('thread_sync', 'medium', { emailAccountId, gmailThreadId: threadId }, 3);
}

/**
 * Schedule a PubSub health check job.
 * @returns Job ID
 */
export function schedulePubSubCheck(): string {
  console.log('[GmailJob] Scheduling PubSub health check');
  return getJobQueue().addJob('pubsub_check', 'low', {}, 2);
}

/**
 * Process the job queue.
 * Called by a cron endpoint or timer.
 * Triggers any pending jobs and schedules periodic maintenance.
 */
export async function processJobQueue(): Promise<{
  triggered: number;
  stats: ReturnType<GmailJobQueue['getStats']>;
}> {
  const queue = getJobQueue();
  const statsBefore = queue.getStats();

  // Schedule periodic token refreshes
  await scheduleTokenRefresh();

  // The queue processes jobs automatically, but we can trigger
  // a processing pass for any newly added jobs
  const statsAfter = queue.getStats();

  const triggered = statsBefore.pending - statsAfter.pending;

  return {
    triggered: Math.max(0, triggered),
    stats: statsAfter,
  };
}

/**
 * Get job queue statistics.
 */
export function getJobQueueStats(): ReturnType<GmailJobQueue['getStats']> {
  return getJobQueue().getStats();
}

/**
 * Get a specific job's status.
 */
export function getJobStatus(jobId: string): GmailJob | null {
  return getJobQueue().getJobStatus(jobId);
}

/**
 * Cancel a pending job.
 */
export function cancelJob(jobId: string): boolean {
  return getJobQueue().cancelJob(jobId);
}

// ===== UTILITY =====

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
