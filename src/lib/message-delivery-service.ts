// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Delivery Service (Hardened)
// Phase L8: Delivery tracking with retry logic, error categorization,
// dead-letter handling, and comprehensive audit logging
//
// CRITICAL RULES:
// - NEVER skip org isolation — always filter by userId
// - NEVER skip audit logs for key actions
// - ALWAYS use pagination for list queries (default 20, max 100)
// - Exponential backoff for retries: 1min, 5min, 15min, 1hr, 6hr
// - NEVER exceed maxRetries (default 3)
// - NON-RETRYABLE errors (auth_failure, recipient_invalid, content_rejected)
//   skip retries and go straight to dead-letter
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { createModuleLogger } from '@/lib/observability/logger';

const deliveryLogger = createModuleLogger({ module: 'message-delivery' });

// ===== TYPES =====

export type DeliveryStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
export type DeliveryChannel = 'email' | 'telegram' | 'whatsapp' | 'linkedin' | 'instagram';
export type DeliveryDirection = 'inbound' | 'outbound';

/**
 * Structured error categories for delivery failures.
 * Determines retry behavior:
 * - RETRYABLE: rate_limit, network_error, provider_error, timeout
 * - NON-RETRYABLE: auth_failure, recipient_invalid, content_rejected
 * - BOUNCED: bounced_hard, bounced_soft
 */
export type DeliveryErrorCategory =
  | 'rate_limit'           // 429, throttled — retryable after backoff
  | 'auth_failure'         // Invalid credentials, token expired — NOT retryable
  | 'network_error'        // DNS, connection, timeout — retryable
  | 'timeout'              // Provider response timeout — retryable
  | 'content_rejected'     // Spam, content policy violation — NOT retryable
  | 'recipient_invalid'    // Unknown user, invalid address — NOT retryable
  | 'provider_error'       // 5xx from provider, service down — retryable
  | 'bounced_hard'         // Permanent bounce (mailbox doesn't exist)
  | 'bounced_soft'         // Temporary bounce (mailbox full, greylisted)
  | 'config_error'         // Missing config, invalid settings — NOT retryable
  | 'unknown';             // Unclassified — retryable (conservative default)

export interface CreateDeliveryParams {
  userId: string;
  conversationId?: string;
  leadId?: string;
  channel: DeliveryChannel;
  provider?: string;
  providerMessageId?: string;
  direction?: DeliveryDirection;
  status?: DeliveryStatus;
  content?: string;
  contentMetadata?: Record<string, unknown>;
  recipientId?: string;
  recipientName?: string;
  senderId?: string;
  templateId?: string;
  templateName?: string;
  maxRetries?: number;
}

export interface DeliveryFilters {
  channel?: DeliveryChannel;
  status?: DeliveryStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DeliveryStats {
  channel: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  bounced: number;
  total: number;
  deliveryRate: number;
  readRate: number;
}

export interface DeadLetterFilters {
  channel?: DeliveryChannel;
  errorCategory?: DeliveryErrorCategory;
  resolved?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

// ===== CONSTANTS =====

/** Exponential backoff intervals: 1min, 5min, 15min, 1hr, 6hr (in ms) */
const RETRY_BACKOFF_MS = [
  1 * 60 * 1000,     // 1 minute
  5 * 60 * 1000,     // 5 minutes
  15 * 60 * 1000,    // 15 minutes
  60 * 60 * 1000,    // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
];

const DEFAULT_MAX_RETRIES = 3;

/** Error categories that should NOT be retried — skip straight to dead-letter */
const NON_RETRYABLE_CATEGORIES: DeliveryErrorCategory[] = [
  'auth_failure',
  'recipient_invalid',
  'content_rejected',
  'config_error',
];

/** Error categories that indicate a permanent bounce */
const HARD_BOUNCE_CATEGORIES: DeliveryErrorCategory[] = [
  'bounced_hard',
  'recipient_invalid',
];

/** Maximum error message length stored in DB */
const MAX_ERROR_LENGTH = 1000;

// ===== ERROR CATEGORIZATION =====

/**
 * Categorize a delivery error from its message or HTTP status code.
 * Used to determine retry eligibility and dead-letter behavior.
 */
export function categorizeError(
  errorMessage: string,
  httpStatus?: number
): DeliveryErrorCategory {
  const lower = errorMessage.toLowerCase();

  // HTTP status code heuristics
  if (httpStatus) {
    if (httpStatus === 429) return 'rate_limit';
    if (httpStatus === 401 || httpStatus === 403) return 'auth_failure';
    if (httpStatus === 400) return 'content_rejected';
    if (httpStatus === 404) return 'recipient_invalid';
    if (httpStatus >= 500) return 'provider_error';
  }

  // Content/message heuristics — ordered by specificity
  // Rate limiting
  if (lower.includes('rate limit') || lower.includes('too many requests') ||
      lower.includes('throttl') || lower.includes('quota exceeded') ||
      lower.includes('retry after')) {
    return 'rate_limit';
  }

  // Auth failures
  if (lower.includes('invalid token') || lower.includes('token expired') ||
      lower.includes('unauthorized') || lower.includes('authentication failed') ||
      lower.includes('credentials') || lower.includes('api key') ||
      lower.includes('access denied') || lower.includes('oauth') ||
      lower.includes('invalid_grant') || lower.includes('bad_request')) {
    return 'auth_failure';
  }

  // Recipient invalid
  if (lower.includes('user not found') || lower.includes('recipient not found') ||
      lower.includes('no such user') || lower.includes('invalid recipient') ||
      lower.includes('invalid email') || lower.includes('does not exist') ||
      lower.includes('unknown recipient') || lower.includes('address not found')) {
    return 'recipient_invalid';
  }

  // Content rejected
  if (lower.includes('spam') || lower.includes('content policy') ||
      lower.includes('message rejected') || lower.includes('blocked by') ||
      lower.includes('policy violation') || lower.includes('malformed') ||
      lower.includes('invalid template')) {
    return 'content_rejected';
  }

  // Hard bounce
  if (lower.includes('mailbox unavailable') || lower.includes('domain not found') ||
      lower.includes('permanently failed') || lower.includes('rejected') ||
      lower.includes('hard bounce') || lower.includes('permanent failure')) {
    return 'bounced_hard';
  }

  // Soft bounce
  if (lower.includes('mailbox full') || lower.includes('greylisted') ||
      lower.includes('deferred') || lower.includes('soft bounce') ||
      lower.includes('temporary failure') || lower.includes('try again later')) {
    return 'bounced_soft';
  }

  // Network/timeout
  if (lower.includes('timeout') || lower.includes('timed out') ||
      lower.includes('econnrefused') || lower.includes('econnreset') ||
      lower.includes('dns') || lower.includes('network') ||
      lower.includes('connection') || lower.includes('socket hang up') ||
      lower.includes('etimedout') || lower.includes('fetch error')) {
    return 'network_error';
  }

  // Config errors
  if (lower.includes('missing config') || lower.includes('not configured') ||
      lower.includes('invalid setting') || lower.includes('setup required')) {
    return 'config_error';
  }

  return 'unknown';
}

/**
 * Check if an error category is eligible for automatic retry.
 * Non-retryable errors go straight to dead-letter queue.
 */
export function isRetryableError(category: DeliveryErrorCategory): boolean {
  return !NON_RETRYABLE_CATEGORIES.includes(category);
}

// ===== HELPER: PAGINATION =====

function normalizePagination(params?: PaginationParams): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

// ===== HELPER: AUDIT LOG =====

/**
 * Log a delivery-related audit event.
 * All key delivery lifecycle events MUST be audited.
 * Failures in audit logging are caught and logged to prevent delivery failures.
 */
async function logDeliveryAudit(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'message_delivery',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    // Audit logging should NEVER block delivery operations
    deliveryLogger.error('Failed to log audit event', { error: error instanceof Error ? error.message : String(error) });
  }
}

// ===== 1. CREATE DELIVERY RECORD =====

/**
 * Create a MessageDelivery record for tracking message delivery.
 */
export async function createDeliveryRecord(params: CreateDeliveryParams): Promise<{
  success: boolean;
  deliveryId?: string;
  error?: string;
}> {
  try {
    const delivery = await db.messageDelivery.create({
      data: {
        userId: params.userId,
        conversationId: params.conversationId || null,
        leadId: params.leadId || null,
        channel: params.channel,
        provider: params.provider || null,
        providerMessageId: params.providerMessageId || null,
        direction: params.direction || 'outbound',
        status: params.status || 'pending',
        content: params.content || null,
        contentMetadata: params.contentMetadata ? JSON.stringify(params.contentMetadata) : null,
        recipientId: params.recipientId || null,
        recipientName: params.recipientName || null,
        senderId: params.senderId || null,
        templateId: params.templateId || null,
        templateName: params.templateName || null,
        retryCount: 0,
        maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
      },
    });

    await logDeliveryAudit(params.userId, 'delivery_created', {
      channel: params.channel,
      leadId: params.leadId,
      conversationId: params.conversationId,
      direction: params.direction || 'outbound',
      provider: params.provider,
      templateName: params.templateName,
    }, delivery.id);

    return { success: true, deliveryId: delivery.id };
  } catch (error) {
    deliveryLogger.error('Failed to create delivery record', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: 'Failed to create delivery record' };
  }
}

// ===== 2. UPDATE DELIVERY STATUS =====

/**
 * Update delivery status with appropriate timestamps and error categorization.
 * - 'sent' → sets sentAt
 * - 'delivered' → sets deliveredAt
 * - 'read' → sets readAt
 * - 'failed' → sets failedAt, categorizes error, stores errorCategory
 * - 'bounced' → sets failedAt, categorizes error as bounce type
 */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: DeliveryStatus,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const delivery = await db.messageDelivery.findUnique({
      where: { id: deliveryId },
      select: { userId: true, status: true, channel: true, retryCount: true, maxRetries: true },
    });

    if (!delivery) {
      return { success: false, error: 'Delivery record not found' };
    }

    const updateData: Record<string, unknown> = { status };

    // Set timestamps based on status
    switch (status) {
      case 'sent':
        updateData.sentAt = new Date();
        break;
      case 'delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'read':
        updateData.readAt = new Date();
        break;
      case 'failed': {
        updateData.failedAt = new Date();
        if (metadata?.errorMessage) {
          updateData.errorMessage = (metadata.errorMessage as string).slice(0, MAX_ERROR_LENGTH);
        }
        // Categorize the error
        const errorMsg = (metadata?.errorMessage as string) || 'Unknown error';
        const errorCategory = categorizeError(errorMsg, metadata?.httpStatus as number | undefined);
        updateData.errorCategory = errorCategory;

        // If non-retryable error, clear nextRetryAt to prevent re-queuing
        if (!isRetryableError(errorCategory) && delivery.retryCount < delivery.maxRetries) {
          updateData.maxRetries = delivery.retryCount; // Prevent future retries
        }
        break;
      }
      case 'bounced': {
        updateData.failedAt = new Date();
        if (metadata?.errorMessage) {
          updateData.errorMessage = (metadata.errorMessage as string).slice(0, MAX_ERROR_LENGTH);
        }
        // Categorize as bounce type
        const errorMsg = (metadata?.errorMessage as string) || 'Unknown bounce';
        const bounceType = inferBounceType(errorMsg);
        updateData.errorCategory = bounceType === 'hard' ? 'bounced_hard' : 'bounced_soft';
        // Bounces are never retried
        updateData.maxRetries = delivery.retryCount;
        updateData.nextRetryAt = null;
        break;
      }
    }

    // Update providerMessageId if provided
    if (metadata?.providerMessageId) {
      updateData.providerMessageId = metadata.providerMessageId as string;
    }

    await db.messageDelivery.update({
      where: { id: deliveryId },
      data: updateData,
    });

    await logDeliveryAudit(delivery.userId, 'delivery_status_updated', {
      deliveryId,
      previousStatus: delivery.status,
      newStatus: status,
      channel: delivery.channel,
      errorCategory: updateData.errorCategory,
      errorMessage: updateData.errorMessage,
      retryCount: delivery.retryCount,
      providerMessageId: metadata?.providerMessageId,
    }, deliveryId);

    return { success: true };
  } catch (error) {
    deliveryLogger.error('Failed to update delivery status', { error: error instanceof Error ? error.message : String(error), deliveryId });
    return { success: false, error: 'Failed to update delivery status' };
  }
}

// ===== 3. GET DELIVERY STATUS =====

/**
 * Get current delivery record by ID.
 */
export async function getDeliveryStatus(deliveryId: string): Promise<{
  id: string;
  userId: string;
  conversationId: string | null;
  leadId: string | null;
  channel: string;
  provider: string | null;
  providerMessageId: string | null;
  direction: string;
  status: string;
  content: string | null;
  recipientId: string | null;
  recipientName: string | null;
  senderId: string | null;
  templateId: string | null;
  templateName: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  errorMessage: string | null;
  errorCategory: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  deadLettered: boolean;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  try {
    const delivery = await db.messageDelivery.findUnique({
      where: { id: deliveryId },
    });

    return delivery;
  } catch (error) {
    deliveryLogger.error('Failed to get delivery status', { error: error instanceof Error ? error.message : String(error), deliveryId });
    return null;
  }
}

// ===== 4. GET DELIVERIES BY USER =====

/**
 * List deliveries for a user with filters and pagination.
 * Org isolation: always filters by userId.
 */
export async function getDeliveriesByUser(
  userId: string,
  filters?: DeliveryFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  channel: string;
  provider: string | null;
  direction: string;
  status: string;
  recipientId: string | null;
  recipientName: string | null;
  templateName: string | null;
  retryCount: number;
  errorCategory: string | null;
  deadLettered: boolean;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}>> {
  const { skip, take, page, limit } = normalizePagination(pagination);

  const where: Record<string, unknown> = { userId };

  if (filters?.channel) {
    where.channel = filters.channel;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = filters.dateFrom;
    if (filters.dateTo) createdAt.lte = filters.dateTo;
    where.createdAt = createdAt;
  }

  const [deliveries, total] = await Promise.all([
    db.messageDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        channel: true,
        provider: true,
        direction: true,
        status: true,
        recipientId: true,
        recipientName: true,
        templateName: true,
        retryCount: true,
        errorCategory: true,
        deadLettered: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        createdAt: true,
      },
    }),
    db.messageDelivery.count({ where }),
  ]);

  return { data: deliveries, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ===== 5. GET DELIVERIES BY LEAD =====

/**
 * Get all deliveries for a specific lead.
 * Validates that the lead belongs to the user.
 */
export async function getDeliveriesByLead(
  leadId: string,
  userId: string
): Promise<Array<{
  id: string;
  channel: string;
  direction: string;
  status: string;
  recipientId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}>> {
  // Verify lead ownership
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { userId: true },
  });

  if (!lead || lead.userId !== userId) {
    return [];
  }

  try {
    return await db.messageDelivery.findMany({
      where: { leadId, userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        channel: true,
        direction: true,
        status: true,
        recipientId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error('[MessageDelivery] Failed to get deliveries by lead:', error);
    return [];
  }
}

// ===== 6. SCHEDULE RETRY =====

/**
 * Schedule a retry for a failed delivery with exponential backoff.
 * Backoff intervals: 1min, 5min, 15min, 1hr, 6hr
 * Only schedules if:
 *   - retryCount < maxRetries
 *   - error category is retryable (rate_limit, network_error, provider_error, timeout, unknown)
 * Non-retryable errors (auth_failure, recipient_invalid, content_rejected, config_error)
 * will be rejected with a clear error message.
 */
export async function scheduleRetry(deliveryId: string): Promise<{
  success: boolean;
  nextRetryAt?: Date;
  retryCount?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}> {
  try {
    const delivery = await db.messageDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        userId: true,
        status: true,
        retryCount: true,
        maxRetries: true,
        channel: true,
        errorCategory: true,
      },
    });

    if (!delivery) {
      return { success: false, error: 'Delivery record not found' };
    }

    // Only retry failed or bounced deliveries
    if (delivery.status !== 'failed' && delivery.status !== 'bounced') {
      return { success: false, error: `Cannot retry delivery with status: ${delivery.status}` };
    }

    // Check if max retries exceeded
    if (delivery.retryCount >= delivery.maxRetries) {
      return { success: false, error: 'Maximum retry attempts exceeded' };
    }

    // Check if error category is non-retryable
    if (delivery.errorCategory && !isRetryableError(delivery.errorCategory as DeliveryErrorCategory)) {
      return {
        success: false,
        skipped: true,
        reason: `Error category '${delivery.errorCategory}' is non-retryable. Message should be dead-lettered.`,
      };
    }

    // Calculate next retry time with exponential backoff
    const backoffIndex = Math.min(delivery.retryCount, RETRY_BACKOFF_MS.length - 1);
    const backoffMs = RETRY_BACKOFF_MS[backoffIndex];
    const nextRetryAt = new Date(Date.now() + backoffMs);
    const newRetryCount = delivery.retryCount + 1;

    await db.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'queued', // Reset to queued for retry
        retryCount: newRetryCount,
        nextRetryAt,
        lastRetryAt: new Date(),
        failedAt: null,
        errorMessage: null,
      },
    });

    await logDeliveryAudit(delivery.userId, 'delivery_retry_scheduled', {
      deliveryId,
      previousStatus: delivery.status,
      retryCount: newRetryCount,
      maxRetries: delivery.maxRetries,
      nextRetryAt: nextRetryAt.toISOString(),
      backoffMs,
      channel: delivery.channel,
      errorCategory: delivery.errorCategory,
    }, deliveryId);

    return {
      success: true,
      nextRetryAt,
      retryCount: newRetryCount,
    };
  } catch (error) {
    deliveryLogger.error('Failed to schedule retry', { error: error instanceof Error ? error.message : String(error), deliveryId });
    return { success: false, error: 'Failed to schedule retry' };
  }
}

// ===== 7. PROCESS RETRY QUEUE =====

/**
 * Process pending retries that are due.
 * Called by job scheduler at regular intervals.
 *
 * Logic:
 * 1. Find deliveries with status='queued' and nextRetryAt <= now
 * 2. Attempt redelivery via channel dispatch
 * 3. On success → mark as 'sent'
 * 4. On failure with retryable error → schedule next retry
 * 5. On failure with non-retryable error → dead-letter immediately
 * 6. On max retries exhausted → dead-letter
 */
export async function processRetryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  rescheduled: number;
  deadLettered: number;
}> {
  const now = new Date();

  // Find deliveries ready for retry (index-optimized query)
  const pendingRetries = await db.messageDelivery.findMany({
    where: {
      status: 'queued',
      nextRetryAt: { lte: now },
      retryCount: { gt: 0 },
    },
    take: 50, // Process in batches to avoid long-running transactions
    select: {
      id: true,
      userId: true,
      channel: true,
      content: true,
      recipientId: true,
      senderId: true,
      retryCount: true,
      maxRetries: true,
      errorMessage: true,
      errorCategory: true,
    },
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let rescheduled = 0;
  let deadLettered = 0;

  for (const delivery of pendingRetries) {
    processed++;

    try {
      // Attempt redelivery via channel dispatch
      const retryResult = await attemptRedelivery(delivery);

      if (retryResult.success) {
        // Success — mark as sent
        await db.messageDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            nextRetryAt: null,
            errorMessage: null,
            errorCategory: null,
          },
        });
        succeeded++;

        await logDeliveryAudit(delivery.userId, 'delivery_retry_succeeded', {
          deliveryId: delivery.id,
          retryCount: delivery.retryCount,
          channel: delivery.channel,
        }, delivery.id);
      } else {
        // Failure — categorize and decide next step
        const errorCategory = categorizeError(retryResult.error || 'Unknown error', retryResult.httpStatus);

        // Store error info on delivery record
        await db.messageDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'failed',
            failedAt: new Date(),
            errorMessage: (retryResult.error || 'Retry failed').slice(0, MAX_ERROR_LENGTH),
            errorCategory,
          },
        });

        // Decision: retry, dead-letter, or fail?
        if (!isRetryableError(errorCategory)) {
          // Non-retryable error → dead-letter immediately
          const dlResult = await moveToDeadLetter(delivery, errorCategory, retryResult.error);
          if (dlResult.success) {
            deadLettered++;
          } else {
            failed++;
          }
        } else if (delivery.retryCount < delivery.maxRetries) {
          // Retryable error and retries remaining → schedule next retry
          const backoffIndex = Math.min(delivery.retryCount, RETRY_BACKOFF_MS.length - 1);
          const backoffMs = RETRY_BACKOFF_MS[backoffIndex];
          const nextRetryAt = new Date(Date.now() + backoffMs);

          await db.messageDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'queued',
              nextRetryAt,
              lastRetryAt: new Date(),
            },
          });
          rescheduled++;

          await logDeliveryAudit(delivery.userId, 'delivery_retry_rescheduled', {
            deliveryId: delivery.id,
            retryCount: delivery.retryCount,
            errorCategory,
            nextRetryAt: nextRetryAt.toISOString(),
            channel: delivery.channel,
          }, delivery.id);
        } else {
          // Max retries exhausted → dead-letter
          const dlResult = await moveToDeadLetter(delivery, errorCategory, retryResult.error);
          if (dlResult.success) {
            deadLettered++;
          } else {
            failed++;
          }
        }
      }
    } catch (error) {
      deliveryLogger.error(`Error processing retry for delivery ${delivery.id}`, { error: error instanceof Error ? error.message : String(error), deliveryId: delivery.id });
      // Unhandled exceptions in the retry loop — count as failed but don't dead-letter
      // (the delivery is still in 'queued' state and will be retried on next cron run)
      failed++;
    }
  }

  // Log summary of retry queue processing
  if (processed > 0) {
    deliveryLogger.info('Retry queue processed', { processed, succeeded, rescheduled, deadLettered, failed });
  }

  return { processed, succeeded, failed, rescheduled, deadLettered };
}

// ===== 8. GET DELIVERY STATS =====

/**
 * Get aggregate delivery stats per channel for a user.
 * Returns sent, delivered, read, failed counts per channel.
 */
export async function getDeliveryStats(userId: string): Promise<DeliveryStats[]> {
  try {
    // Get all deliveries grouped by channel and status
    const deliveries = await db.messageDelivery.findMany({
      where: { userId },
      select: {
        channel: true,
        status: true,
      },
    });

    // Aggregate by channel
    const channelMap = new Map<string, {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      bounced: number;
      total: number;
    }>();

    for (const d of deliveries) {
      if (!channelMap.has(d.channel)) {
        channelMap.set(d.channel, {
          sent: 0, delivered: 0, read: 0, failed: 0, bounced: 0, total: 0,
        });
      }

      const stats = channelMap.get(d.channel)!;
      stats.total++;

      switch (d.status) {
        case 'sent':
        case 'queued':
        case 'pending':
          stats.sent++;
          break;
        case 'delivered':
          stats.delivered++;
          break;
        case 'read':
          stats.read++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'bounced':
          stats.bounced++;
          break;
      }
    }

    // Build result with rates
    const result: DeliveryStats[] = [];
    const channelEntries = Array.from(channelMap.entries());
    for (const [channel, stats] of channelEntries) {
      result.push({
        channel,
        ...stats,
        deliveryRate: stats.total > 0
          ? Math.round(((stats.delivered + stats.read) / stats.total) * 100)
          : 0,
        readRate: stats.delivered > 0
          ? Math.round((stats.read / stats.delivered) * 100)
          : 0,
      });
    }

    return result;
  } catch (error) {
    console.error('[MessageDelivery] Failed to get delivery stats:', error);
    return [];
  }
}

// ===== 9. MARK AS FAILED =====

/**
 * Mark a delivery as failed with categorized error handling.
 * Logic:
 * 1. Categorize the error
 * 2. Store error category and message on the record
 * 3. If error is non-retryable → dead-letter immediately
 * 4. If retryable and retries remaining → auto-schedule retry
 * 5. If retryable and retries exhausted → dead-letter
 */
export async function markAsFailed(
  deliveryId: string,
  errorMessage: string,
  httpStatus?: number
): Promise<{
  success: boolean;
  retryScheduled?: boolean;
  nextRetryAt?: Date;
  deadLettered?: boolean;
  errorCategory?: DeliveryErrorCategory;
  error?: string;
}> {
  try {
    const delivery = await db.messageDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        userId: true,
        retryCount: true,
        maxRetries: true,
        channel: true,
        recipientId: true,
        recipientName: true,
        content: true,
        createdAt: true,
      },
    });

    if (!delivery) {
      return { success: false, error: 'Delivery record not found' };
    }

    // Categorize the error
    const errorCategory = categorizeError(errorMessage, httpStatus);

    // Update the delivery record with failure info
    await db.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: errorMessage.slice(0, MAX_ERROR_LENGTH),
        errorCategory,
      },
    });

    await logDeliveryAudit(delivery.userId, 'delivery_failed', {
      deliveryId,
      errorMessage: errorMessage.slice(0, 500),
      errorCategory,
      retryCount: delivery.retryCount,
      maxRetries: delivery.maxRetries,
      channel: delivery.channel,
      httpStatus,
    }, deliveryId);

    // Decision: retry, dead-letter, or just mark as failed?
    if (!isRetryableError(errorCategory)) {
      // Non-retryable → dead-letter immediately
      const dlResult = await moveToDeadLetter(
        { ...delivery, id: deliveryId, errorMessage, errorCategory },
        errorCategory,
        errorMessage
      );
      return {
        success: true,
        deadLettered: dlResult.success,
        errorCategory,
      };
    }

    if (delivery.retryCount < delivery.maxRetries) {
      // Retryable and retries remaining → auto-schedule
      const retryResult = await scheduleRetry(deliveryId);
      return {
        success: true,
        retryScheduled: retryResult.success,
        nextRetryAt: retryResult.nextRetryAt,
        errorCategory,
      };
    }

    // Retries exhausted → dead-letter
    const dlResult = await moveToDeadLetter(
      { ...delivery, id: deliveryId, errorMessage, errorCategory },
      errorCategory,
      errorMessage
    );
    return {
      success: true,
      deadLettered: dlResult.success,
      errorCategory,
    };
  } catch (error) {
    deliveryLogger.error('Failed to mark delivery as failed', { error: error instanceof Error ? error.message : String(error), deliveryId });
    return { success: false, error: 'Failed to mark delivery as failed' };
  }
}

// ===== 10. HANDLE BOUNCE =====

/**
 * Handle a bounced message.
 * - Updates delivery status to 'bounced' with errorCategory
 * - Records bounce in EmailBounce table (for email)
 * - Updates lead's emailStatus to 'bounced'
 * - Creates audit log
 * - Dead-letters hard bounces
 */
export async function handleBounce(
  deliveryId: string,
  bounceReason: string
): Promise<{
  success: boolean;
  leadUpdated?: boolean;
  deadLettered?: boolean;
  error?: string;
}> {
  try {
    const delivery = await db.messageDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        userId: true,
        leadId: true,
        channel: true,
        recipientId: true,
        retryCount: true,
        maxRetries: true,
        recipientName: true,
        content: true,
        createdAt: true,
      },
    });

    if (!delivery) {
      return { success: false, error: 'Delivery record not found' };
    }

    // Determine bounce type and set error category
    const bounceType = inferBounceType(bounceReason);
    const errorCategory: DeliveryErrorCategory = bounceType === 'hard' ? 'bounced_hard' : 'bounced_soft';

    // Update delivery status
    await db.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'bounced',
        failedAt: new Date(),
        errorMessage: bounceReason.slice(0, MAX_ERROR_LENGTH),
        errorCategory,
        maxRetries: delivery.retryCount, // Prevent retries for bounces
        nextRetryAt: null,
      },
    });

    // Record bounce in EmailBounce table for email channel
    if (delivery.channel === 'email' && delivery.recipientId) {
      try {
        await db.emailBounce.create({
          data: {
            userId: delivery.userId,
            leadId: delivery.leadId || null,
            email: delivery.recipientId,
            bounceType,
            bounceReason: bounceReason.slice(0, 500),
          },
        });
      } catch (bounceError) {
        console.error('[MessageDelivery] Failed to record email bounce:', bounceError);
      }
    }

    // Update lead status
    let leadUpdated = false;
    if (delivery.leadId) {
      try {
        const updateData: Record<string, unknown> = {};

        if (delivery.channel === 'email') {
          updateData.emailStatus = bounceType === 'hard' ? 'bounced' : 'sent';
        }

        if (bounceType === 'hard') {
          // For hard bounces, consider marking the lead as less active
          updateData.isActive = true; // Don't deactivate, but flag
        }

        await db.lead.update({
          where: { id: delivery.leadId },
          data: updateData,
        });
        leadUpdated = true;
      } catch (leadError) {
        console.error('[MessageDelivery] Failed to update lead on bounce:', leadError);
      }
    }

    // Dead-letter hard bounces
    let deadLettered = false;
    if (bounceType === 'hard') {
      const dlResult = await moveToDeadLetter(
        { ...delivery, id: deliveryId, errorMessage: bounceReason, errorCategory },
        errorCategory,
        bounceReason
      );
      deadLettered = dlResult.success;
    }

    await logDeliveryAudit(delivery.userId, 'delivery_bounced', {
      deliveryId,
      leadId: delivery.leadId,
      channel: delivery.channel,
      bounceType,
      errorCategory,
      bounceReason: bounceReason.slice(0, 200),
      recipientId: delivery.recipientId,
      deadLettered,
    }, deliveryId);

    return { success: true, leadUpdated, deadLettered };
  } catch (error) {
    deliveryLogger.error('Failed to handle bounce', { error: error instanceof Error ? error.message : String(error), deliveryId });
    return { success: false, error: 'Failed to handle bounce' };
  }
}

// ===== 11. DEAD LETTER HANDLING =====

/**
 * Move a delivery to the dead-letter queue.
 * Creates a DeliveryDeadLetter record and marks the original delivery as deadLettered.
 */
async function moveToDeadLetter(
  delivery: {
    id: string;
    userId: string;
    channel: string;
    recipientId: string | null;
    recipientName: string | null;
    content: string | null;
    retryCount: number;
    maxRetries: number;
    errorMessage: string | null;
    errorCategory: string | null;
    createdAt: Date;
  },
  errorCategory: DeliveryErrorCategory,
  failureReason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build failure summary from accumulated errors
    const failureSummary = buildFailureSummary(delivery, failureReason);

    // Create dead-letter record (fire-and-forget, wrapped in try/catch)
    await db.deliveryDeadLetter.create({
      data: {
        deliveryId: delivery.id,
        userId: delivery.userId,
        channel: delivery.channel,
        recipientId: delivery.recipientId,
        recipientName: delivery.recipientName,
        content: delivery.content,
        errorCategory,
        failureSummary,
        retryCount: delivery.retryCount,
        maxRetries: delivery.maxRetries,
        originalCreatedAt: delivery.createdAt,
      },
    });

    // Mark original delivery as dead-lettered
    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        deadLettered: true,
        deadLetterReason: `Max retries (${delivery.maxRetries}) exhausted [${errorCategory}]: ${(failureReason || 'Unknown').slice(0, 500)}`,
        status: 'failed',
        failedAt: delivery.failedAt ? undefined : new Date(),
        nextRetryAt: null,
      },
    });

    await logDeliveryAudit(delivery.userId, 'delivery_dead_lettered', {
      deliveryId: delivery.id,
      channel: delivery.channel,
      errorCategory,
      retryCount: delivery.retryCount,
      maxRetries: delivery.maxRetries,
      failureReason: failureReason.slice(0, 300),
      recipientId: delivery.recipientId,
    }, delivery.id);

    return { success: true };
  } catch (error) {
    deliveryLogger.error(`Failed to move delivery to dead-letter`, { error: error instanceof Error ? error.message : String(error), deliveryId: delivery.id });
    return { success: false, error: 'Failed to create dead-letter record' };
  }
}

/**
 * Build a failure summary string for the dead-letter record.
 */
function buildFailureSummary(
  delivery: {
    errorMessage: string | null;
    errorCategory: string | null;
    retryCount: number;
  },
  latestError: string
): string {
  const parts: string[] = [];
  if (delivery.errorMessage) {
    parts.push(`Last error: ${delivery.errorMessage}`);
  }
  parts.push(`Final attempt: ${latestError}`);
  parts.push(`Error category: ${delivery.errorCategory || 'unknown'}`);
  parts.push(`Total attempts: ${delivery.retryCount + 1}`);
  return parts.join(' | ');
}

// ===== 12. GET DEAD LETTERS =====

/**
 * List dead-lettered deliveries for a user.
 * Supports filtering by channel, error category, and resolution status.
 */
export async function getDeadLetters(
  userId: string,
  filters?: DeadLetterFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  deliveryId: string;
  channel: string;
  recipientId: string | null;
  recipientName: string | null;
  errorCategory: string | null;
  failureSummary: string;
  retryCount: number;
  maxRetries: number;
  deadLetteredAt: Date;
  resolved: boolean;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}>> {
  const { skip, take, page, limit } = normalizePagination(pagination);

  const where: Record<string, unknown> = { userId };

  if (filters?.channel) {
    where.channel = filters.channel;
  }

  if (filters?.errorCategory) {
    where.errorCategory = filters.errorCategory;
  }

  if (filters?.resolved !== undefined) {
    where.resolved = filters.resolved;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const deadLetteredAt: Record<string, Date> = {};
    if (filters.dateFrom) deadLetteredAt.gte = filters.dateFrom;
    if (filters.dateTo) deadLetteredAt.lte = filters.dateTo;
    where.deadLetteredAt = deadLetteredAt;
  }

  const [deadLetters, total] = await Promise.all([
    db.deliveryDeadLetter.findMany({
      where,
      orderBy: { deadLetteredAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        deliveryId: true,
        channel: true,
        recipientId: true,
        recipientName: true,
        errorCategory: true,
        failureSummary: true,
        retryCount: true,
        maxRetries: true,
        deadLetteredAt: true,
        resolved: true,
        resolvedAt: true,
        resolutionNote: true,
      },
    }),
    db.deliveryDeadLetter.count({ where }),
  ]);

  return { data: deadLetters, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ===== 13. RESOLVE DEAD LETTER =====

/**
 * Manually resolve a dead-lettered delivery.
 * Marks it as resolved with a resolution note.
 */
export async function resolveDeadLetter(
  deadLetterId: string,
  userId: string,
  resolutionNote: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Verify ownership
    const deadLetter = await db.deliveryDeadLetter.findUnique({
      where: { id: deadLetterId },
      select: { userId: true, deliveryId: true, resolved: true },
    });

    if (!deadLetter) {
      return { success: false, error: 'Dead letter record not found' };
    }

    if (deadLetter.userId !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (deadLetter.resolved) {
      return { success: false, error: 'Dead letter already resolved' };
    }

    await db.deliveryDeadLetter.update({
      where: { id: deadLetterId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolutionNote: resolutionNote.slice(0, 500),
      },
    });

    // Also update the original delivery record
    await db.messageDelivery.update({
      where: { id: deadLetter.deliveryId },
      data: {
        deadLetterReason: `RESOLVED: ${resolutionNote.slice(0, 300)}`,
      },
    });

    await logDeliveryAudit(userId, 'delivery_dead_letter_resolved', {
      deadLetterId,
      deliveryId: deadLetter.deliveryId,
      resolutionNote: resolutionNote.slice(0, 300),
    }, deadLetter.deliveryId);

    return { success: true };
  } catch (error) {
    deliveryLogger.error('Failed to resolve dead letter', { error: error instanceof Error ? error.message : String(error), deadLetterId });
    return { success: false, error: 'Failed to resolve dead letter' };
  }
}

// ===== INTERNAL: ATTEMPT REDELIVERY =====

/**
 * Attempt to redeliver a message via the appropriate channel dispatch.
 *
 * This does NOT implement actual SMTP/SMS sending (frozen per project rules).
 * Instead, it:
 * 1. Dispatches to channel-specific handler stubs that would contain real API calls
 * 2. Returns structured error results with categorization
 * 3. Channel-specific handlers would be implemented when providers are connected
 */
async function attemptRedelivery(delivery: {
  id: string;
  userId: string;
  channel: string;
  content: string | null;
  recipientId: string | null;
  senderId: string | null;
  retryCount: number;
}): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  try {
    // Dispatch to channel-specific handler
    // Each handler would contain the real API call in production
    switch (delivery.channel) {
      case 'telegram': {
        const result = await redeliverViaTelegram(delivery);
        return result;
      }
      case 'whatsapp': {
        const result = await redeliverViaWhatsApp(delivery);
        return result;
      }
      case 'email': {
        const result = await redeliverViaEmail(delivery);
        return result;
      }
      case 'linkedin':
      case 'instagram':
        // Social channels not yet supported for redelivery
        return {
          success: false,
          error: `Channel '${delivery.channel}' does not support automated redelivery`,
        };
      default:
        return {
          success: false,
          error: `Unknown channel: ${delivery.channel}`,
          httpStatus: 500,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Redelivery error: ${message}`,
    };
  }
}

/**
 * Channel-specific redelivery: Telegram (Bot API).
 * Looks up the user's TelegramConfig and attempts to re-send via the Bot API.
 */
async function redeliverViaTelegram(delivery: {
  id: string;
  userId: string;
  content: string | null;
  recipientId: string | null;
}): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  if (!delivery.recipientId) {
    return {
      success: false,
      error: 'No recipient chat ID',
      httpStatus: 400,
    };
  }

  if (!delivery.content) {
    return {
      success: false,
      error: 'No message content',
      httpStatus: 400,
    };
  }

  // Attempt real delivery via the telegram-service
  try {
    const { sendMessage: sendTelegramMessage } = await import('@/lib/telegram-service');
    const result = await sendTelegramMessage(
      delivery.userId,
      delivery.recipientId,
      delivery.content
    );

    if (result.deliveryId) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Telegram message send returned no delivery ID',
      httpStatus: 500,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Extract HTTP status from TelegramServiceError if available
    let httpStatus = 500;
    if (error && typeof error === 'object' && 'statusCode' in error) {
      httpStatus = (error as { statusCode: number }).statusCode;
    }

    return {
      success: false,
      error: `Telegram redelivery failed: ${message}`,
      httpStatus,
    };
  }
}

/**
 * Channel-specific redelivery: WhatsApp (Meta Cloud API / Twilio).
 * Looks up the user's WhatsappConfig and attempts to re-send.
 */
async function redeliverViaWhatsApp(delivery: {
  id: string;
  userId: string;
  content: string | null;
  recipientId: string | null;
}): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  if (!delivery.recipientId) {
    return {
      success: false,
      error: 'No recipient phone number',
      httpStatus: 400,
    };
  }

  if (!delivery.content) {
    return {
      success: false,
      error: 'No message content',
      httpStatus: 400,
    };
  }

  // Attempt real delivery via the whatsapp-service
  try {
    const { sendMetaMessage } = await import('@/lib/whatsapp-service');
    const result = await sendMetaMessage(
      delivery.userId,
      delivery.recipientId,
      delivery.content
    );

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: result.error || 'WhatsApp message send failed',
      httpStatus: 500,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // If the import itself fails (e.g., no WhatsappConfig), report as config_error
    if (message.includes('not configured') || message.includes('not found')) {
      return {
        success: false,
        error: `WhatsApp not configured for user: ${message}`,
        httpStatus: 404,
      };
    }

    return {
      success: false,
      error: `WhatsApp redelivery failed: ${message}`,
      httpStatus: 500,
    };
  }
}

/**
 * Channel-specific redelivery: Email (Gmail API / SMTP / Resend).
 * Attempts Gmail API first (if the user has a connected Gmail account),
 * then falls back to the SMTP/Resend infrastructure via sendEmail.
 */
async function redeliverViaEmail(delivery: {
  id: string;
  userId: string;
  content: string | null;
  recipientId: string | null;
}): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  if (!delivery.recipientId) {
    return {
      success: false,
      error: 'No recipient email address',
      httpStatus: 400,
    };
  }

  if (!delivery.content) {
    return {
      success: false,
      error: 'No email content',
      httpStatus: 400,
    };
  }

  // Strategy 1: Try Gmail API if the user has a connected Gmail account
  try {
    const emailAccount = await db.emailAccount.findFirst({
      where: { userId: delivery.userId, status: 'active' },
      select: { id: true, gmailEmail: true },
    });

    if (emailAccount) {
      const { sendEmail: sendGmailEmail } = await import('@/lib/gmail-delivery-service');
      const gmailResult = await sendGmailEmail(emailAccount.id, {
        to: delivery.recipientId,
        subject: 'Retry: Message Delivery',
        body: delivery.content,
      });

      if (gmailResult.success) {
        return { success: true };
      }

      // Gmail failed — log and fall through to SMTP/Resend
      deliveryLogger.warn(`Gmail redelivery failed for delivery ${delivery.id}`, { error: gmailResult.error, deliveryId: delivery.id });
    }
  } catch (gmailError) {
    // Gmail service may not be available (missing OAuth, etc.) — fall through
    deliveryLogger.warn(`Gmail redelivery skipped for delivery ${delivery.id}`, { error: gmailError instanceof Error ? gmailError.message : String(gmailError), deliveryId: delivery.id });
  }

  // Strategy 2: Fall back to SMTP/Resend infrastructure
  try {
    const { sendEmail: sendSmtpEmail, isEmailServiceConfigured } = await import('@/lib/email');

    if (!isEmailServiceConfigured()) {
      return {
        success: false,
        error: 'Email provider not connected (Gmail/SMTP/Resend configuration required)',
        httpStatus: 503,
      };
    }

    const emailResult = await sendSmtpEmail({
      to: delivery.recipientId,
      subject: 'Retry: Message Delivery',
      html: delivery.content,
      text: delivery.content,
    });

    if (emailResult.sent) {
      return { success: true };
    }

    return {
      success: false,
      error: emailResult.error || 'Email delivery failed via SMTP/Resend',
      httpStatus: 500,
    };
  } catch (smtpError) {
    const message = smtpError instanceof Error ? smtpError.message : String(smtpError);
    return {
      success: false,
      error: `Email redelivery failed: ${message}`,
      httpStatus: 500,
    };
  }
}

// ===== INTERNAL: INFER BOUNCE TYPE =====

/**
 * Infer bounce type (hard/soft) from the bounce reason text.
 */
function inferBounceType(reason: string): 'hard' | 'soft' {
  const lower = reason.toLowerCase();

  // Hard bounce indicators
  const hardIndicators = [
    'user not found',
    'recipient not found',
    'no such user',
    'invalid recipient',
    'mailbox unavailable',
    'domain not found',
    'permanently failed',
    'permanent failure',
    'address not found',
    'does not exist at',
  ];

  // Soft bounce indicators
  const softIndicators = [
    'mailbox full',
    'quota exceeded',
    'temporarily rejected',
    'try again later',
    'greylisted',
    'deferred',
    'timeout',
    'temporary failure',
    'over quota',
  ];

  for (const indicator of hardIndicators) {
    if (lower.includes(indicator)) {
      return 'hard';
    }
  }

  for (const indicator of softIndicators) {
    if (lower.includes(indicator)) {
      return 'soft';
    }
  }

  // Default to soft bounce (less aggressive)
  return 'soft';
}
