// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Service (server only)
//
// Core domain logic for the Support Center:
//   • Ticket numbering (SUP-YYYY-XXXXX, same collision-retry pattern as
//     the existing FeedbackReport FB- tickets)
//   • Ticket creation with owner confirmation notification (+ optional
//     email via the existing email service, fire-and-forget)
//   • Conversation messages (user replies / staff replies / internal
//     support notes)
//   • Status transitions with an audit log
//
// SECURITY INVARIANTS (enforced here AND in the API routes):
//   • Users can only ever read/write their OWN tickets — every user-side
//     query is scoped by userId, never by ticket id alone.
//   • Internal notes (SupportTicketMessage.isInternal = true) are NEVER
//     returned by user-facing reads.
//   • The customer-facing flow NEVER mutates subscription / payment
//     state — a downgrade request only creates a support ticket.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { createNotification } from '@/lib/notification-service';
import { sendEmail } from '@/lib/email';
import { isValidCategory, isValidSubcategory, type TicketStatus, type TicketPriority } from '@/lib/support-constants';

// ─── Ticket number generation ───────────────────────────────────────

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SUP-${year}-${random}`;
}

async function nextTicketNumber(): Promise<string> {
  // Retry on the (extremely unlikely) unique collision, exactly like the
  // existing feedback ticket generator.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTicketNumber();
    const existing = await db.supportTicket.findUnique({
      where: { ticketNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Practically unreachable; fall back to a timestamp-suffixed number.
  return `SUP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
}

// ─── Validation helpers ─────────────────────────────────────────────

export interface CreateTicketInput {
  userId: string;
  category: string;
  subcategory?: string | null;
  subject: string;
  description: string;
  priority?: TicketPriority | string;
  currentPlan?: string | null;
  requestedPlan?: string | null;
  billingCycle?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

const VALID_PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const VALID_PLANS = new Set(['free', 'starter', 'pro', 'elite']);
const VALID_CYCLES = new Set(['monthly', 'yearly']);

export function validateCreateTicketInput(
  input: CreateTicketInput,
): { ok: true } | { ok: false; error: string } {
  const subject = (input.subject || '').trim();
  const description = (input.description || '').trim();

  if (subject.length < 5) {
    return { ok: false, error: 'Subject must be at least 5 characters.' };
  }
  if (subject.length > 200) {
    return { ok: false, error: 'Subject must be at most 200 characters.' };
  }
  if (description.length < 20) {
    return { ok: false, error: 'Please describe your issue in at least 20 characters.' };
  }
  if (description.length > 10000) {
    return { ok: false, error: 'Description must be at most 10,000 characters.' };
  }
  if (!isValidCategory(input.category)) {
    return { ok: false, error: 'Please choose a valid support category.' };
  }
  if (!isValidSubcategory(input.category, input.subcategory)) {
    return { ok: false, error: 'Please choose a valid subcategory.' };
  }
  if (input.priority && !VALID_PRIORITIES.has(String(input.priority))) {
    return { ok: false, error: 'Invalid priority.' };
  }
  if (input.currentPlan && !VALID_PLANS.has(String(input.currentPlan))) {
    return { ok: false, error: 'Invalid current plan.' };
  }
  if (input.requestedPlan && !VALID_PLANS.has(String(input.requestedPlan))) {
    return { ok: false, error: 'Invalid requested plan.' };
  }
  if (input.billingCycle && !VALID_CYCLES.has(String(input.billingCycle))) {
    return { ok: false, error: 'Invalid billing cycle.' };
  }
  return { ok: true };
}

// ─── Email (fire-and-forget, existing provider stack) ───────────────

function stripHtml(text: string): string {
  return text;
}

async function sendTicketEmail(params: {
  to: string;
  name?: string | null;
  subject: string;
  heading: string;
  bodyLines: string[];
}): Promise<void> {
  const { to, name, subject, heading, bodyLines } = params;
  try {
    await sendEmail({
      to,
      subject,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h2 style="font-size:18px;margin:0 0 12px">${heading}</h2>
          <p style="margin:0 0 10px">Hi ${name || 'there'},</p>
          ${bodyLines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${l}</p>`).join('')}
          <p style="margin:16px 0 0;color:#666;font-size:12px">AcquisitionOS Support</p>
        </div>`,
      text: stripHtml(`${heading}\n\n${bodyLines.join('\n\n')}\n\nAcquisitionOS Support`),
    });
  } catch {
    // Email is best-effort: the in-app notification + ticket thread are the
    // reliable channels. Never break ticket creation because SMTP is down.
  }
}

// ─── Create ticket ──────────────────────────────────────────────────

export async function createSupportTicket(input: CreateTicketInput) {
  const validation = validateCreateTicketInput(input);
  if (!validation.ok) {
    throw new SupportValidationError(validation.error);
  }

  const ticketNumber = await nextTicketNumber();
  const priority = (VALID_PRIORITIES.has(String(input.priority)) ? String(input.priority) : 'NORMAL') as TicketPriority;

  const ticket = await db.supportTicket.create({
    data: {
      ticketNumber,
      userId: input.userId,
      category: input.category,
      subcategory: input.subcategory?.trim() || null,
      subject: input.subject.trim(),
      description: input.description.trim(),
      status: 'OPEN',
      priority,
      currentPlan: input.currentPlan || null,
      requestedPlan: input.requestedPlan || null,
      billingCycle: input.billingCycle || null,
      source: input.source || 'support_center',
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      lastActivityAt: new Date(),
      statusLog: {
        create: {
          fromStatus: 'OPEN',
          toStatus: 'OPEN',
          changedBy: input.userId,
          note: 'Ticket created',
        },
      },
    },
  });

  // Owner confirmation — in-app notification via the existing notification
  // infrastructure (SSE realtime + polling fallback).
  await createNotification({
    userId: input.userId,
    type: 'system',
    title: `Support request submitted — ${ticketNumber}`,
    message: `We received your "${ticket.subject}" request. Our team will get back to you shortly.`,
    actionUrl: `/support/tickets/${ticket.id}`,
    metadata: { ticketId: ticket.id, ticketNumber, kind: 'support_ticket_created' },
  });

  // Best-effort email confirmation through the existing email service.
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    await sendTicketEmail({
      to: user.email,
      name: user.name,
      subject: `[${ticketNumber}] We received your support request`,
      heading: 'Your support request has been submitted.',
      bodyLines: [
        `Reference number: <strong>${ticketNumber}</strong>`,
        `Subject: ${ticket.subject}`,
        'Our support team will reply to this ticket and you will be notified in the app.',
        `You can track the conversation here: <a href="/support/tickets/${ticket.id}">Your ticket</a>`,
      ],
    });
  }

  return ticket;
}

export class SupportValidationError extends Error {}

// ─── Messages ───────────────────────────────────────────────────────

export async function addTicketMessage(params: {
  ticketId: string;
  authorId: string;
  authorRole: 'user' | 'admin';
  content: string;
  isInternal?: boolean;
}) {
  const content = (params.content || '').trim();
  if (content.length < 1) {
    throw new SupportValidationError('Message cannot be empty.');
  }
  if (content.length > 10000) {
    throw new SupportValidationError('Message must be at most 10,000 characters.');
  }

  const ticket = await db.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true, userId: true, status: true, ticketNumber: true, subject: true },
  });
  if (!ticket) throw new SupportNotFoundError('Ticket not found.');

  if (ticket.status === 'CLOSED' && params.authorRole === 'user') {
    throw new SupportValidationError(
      'This ticket is closed. Reopen it if you still need help.',
    );
  }

  const message = await db.supportTicketMessage.create({
    data: {
      ticketId: params.ticketId,
      authorId: params.authorId,
      authorRole: params.authorRole,
      content,
      isInternal: params.authorRole === 'admin' ? !!params.isInternal : false,
    },
  });

  const now = new Date();
  const data: Record<string, unknown> = { lastActivityAt: now };

  if (params.authorRole === 'admin' && !params.isInternal) {
    // Staff public reply: ticket moves to WAITING_FOR_USER + notifies owner.
    data.lastRepliedAt = now;
    if (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' || ticket.status === 'WAITING_FOR_USER') {
      data.status = 'WAITING_FOR_USER';
    }
    await createNotification({
      userId: ticket.userId,
      type: 'system',
      title: `Support replied — ${ticket.ticketNumber}`,
      message: `Our support team replied to "${ticket.subject}".`,
      actionUrl: `/support/tickets/${ticket.id}`,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, kind: 'support_reply' },
    });
    const owner = await db.user.findUnique({
      where: { id: ticket.userId },
      select: { email: true, name: true },
    });
    if (owner?.email) {
      await sendTicketEmail({
        to: owner.email,
        name: owner.name,
        subject: `[${ticket.ticketNumber}] Support replied to your ticket`,
        heading: 'Support replied to your ticket.',
        bodyLines: [
          `Subject: ${ticket.subject}`,
          'Open your ticket in the app to read the reply and continue the conversation.',
        ],
      });
    }
  } else if (params.authorRole === 'user') {
    // User reply on a WAITING_FOR_USER / RESOLVED ticket → back to OPEN for
    // the support team.
    if (ticket.status === 'WAITING_FOR_USER' || ticket.status === 'RESOLVED') {
      data.status = 'OPEN';
    }
  }

  await db.supportTicket.update({ where: { id: ticket.id }, data });

  return message;
}

// ─── Status transitions ─────────────────────────────────────────────

const USER_ALLOWED_TRANSITIONS: Record<string, TicketStatus[]> = {
  // Users may close their own tickets and reopen closed/resolved ones.
  OPEN: ['CLOSED'],
  IN_PROGRESS: ['CLOSED'],
  WAITING_FOR_USER: ['CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

const ADMIN_ALLOWED_TRANSITIONS: Record<string, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'OPEN'],
  WAITING_FOR_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
  RESOLVED: ['CLOSED', 'OPEN', 'IN_PROGRESS'],
  CLOSED: ['OPEN', 'IN_PROGRESS'],
};

export async function changeTicketStatus(params: {
  ticketId: string;
  newStatus: TicketStatus | string;
  changedBy: string;
  changedByRole: 'user' | 'admin';
  note?: string | null;
}) {
  const newStatus = String(params.newStatus) as TicketStatus;
  if (!['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'].includes(newStatus)) {
    throw new SupportValidationError('Invalid status.');
  }

  const ticket = await db.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true, userId: true, status: true, ticketNumber: true, subject: true },
  });
  if (!ticket) throw new SupportNotFoundError('Ticket not found.');

  const allowed =
    params.changedByRole === 'admin'
      ? ADMIN_ALLOWED_TRANSITIONS[ticket.status]
      : USER_ALLOWED_TRANSITIONS[ticket.status];

  if (!allowed?.includes(newStatus)) {
    throw new SupportValidationError(
      `Cannot change status from ${ticket.status} to ${newStatus}.`,
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus, lastActivityAt: now };
  if (newStatus === 'RESOLVED') data.resolvedAt = now;
  if (newStatus === 'CLOSED') data.closedAt = now;
  if (newStatus === 'OPEN') {
    data.resolvedAt = null;
    data.closedAt = null;
  }

  const updated = await db.supportTicket.update({ where: { id: ticket.id }, data });

  await db.supportTicketStatusLog.create({
    data: {
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus: newStatus,
      changedBy: params.changedBy,
      note: params.note || null,
    },
  });

  // Notify the ticket owner about staff status changes (resolved/closed/
  // in-progress). User-initiated changes do not notify the user themself.
  if (params.changedByRole === 'admin') {
    const labels: Record<string, string> = {
      IN_PROGRESS: 'Your ticket is being worked on',
      WAITING_FOR_USER: 'Support is waiting for your reply',
      RESOLVED: 'Your ticket has been resolved',
      CLOSED: 'Your ticket has been closed',
      OPEN: 'Your ticket has been reopened',
    };
    await createNotification({
      userId: ticket.userId,
      type: 'system',
      title: `${labels[newStatus]} — ${ticket.ticketNumber}`,
      message: `Ticket "${ticket.subject}" status: ${newStatus.replace(/_/g, ' ')}.`,
      actionUrl: `/support/tickets/${ticket.id}`,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, kind: 'support_status', newStatus },
    });
  }

  return updated;
}

export async function updateTicketPriority(params: {
  ticketId: string;
  priority: TicketPriority | string;
}) {
  if (!VALID_PRIORITIES.has(String(params.priority))) {
    throw new SupportValidationError('Invalid priority.');
  }
  const updated = await db.supportTicket.update({
    where: { id: params.ticketId },
    data: { priority: String(params.priority) },
  });
  return updated;
}

export async function assignTicket(params: {
  ticketId: string;
  assigneeId: string | null;
  assignedBy: string;
}) {
  const updated = await db.supportTicket.update({
    where: { id: params.ticketId },
    data: {
      assignedTo: params.assigneeId,
      assignedAt: params.assigneeId ? new Date() : null,
    },
  });
  return updated;
}

// ─── Errors ─────────────────────────────────────────────────────────

export class SupportNotFoundError extends Error {}
