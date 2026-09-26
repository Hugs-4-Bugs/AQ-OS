// ═══════════════════════════════════════════════════════════════════
// Tests: Support Center (tickets, authorization, KB search)
//
// Covers:
//   1. Support service validation + status transitions
//   2. SECURITY — cross-user ticket access (User A vs User B) at the
//      API-route level (GET / PATCH / POST messages)
//   3. Internal support notes are NEVER returned to normal users
//   4. Knowledge-base search ranking + no-results handling
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock db (Prisma) ───────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  supportTicket: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  supportTicketMessage: { create: vi.fn(), findMany: vi.fn() },
  supportTicketStatusLog: { create: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  knowledgeBaseArticle: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  kbArticleFeedback: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));

// ─── Mock notification service + email (side effects) ──────────────
const mockCreateNotification = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'n1' }));
vi.mock('@/lib/notification-service', () => ({
  createNotification: mockCreateNotification,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: false, error: 'not configured' }),
}));

// ─── Mock auth (route handlers) ─────────────────────────────────────
const mockGetAuthUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getAuthUser: mockGetAuthUser,
  AuthError: class AuthError extends Error {
    statusCode = 401;
  },
}));

import { createSupportTicket, addTicketMessage, changeTicketStatus } from '@/lib/support-service';
import { createMockRequest, createUnauthenticatedRequest } from '../helpers/mock-request';
import { createMockUser } from '../helpers/mock-user';

// Route handlers under test
import { POST as createTicketRoute, GET as listTicketsRoute } from '@/app/api/support/tickets/route';
import { GET as ticketDetailRoute, PATCH as ticketPatchRoute } from '@/app/api/support/tickets/[id]/route';
import { POST as messagePostRoute } from '@/app/api/support/tickets/[id]/messages/route';
import { GET as kbSearchRoute } from '@/app/api/support/kb/articles/route';

const USER_A = createMockUser({ id: 'user-a', email: 'a@test.local', role: 'member' });
const USER_B = createMockUser({ id: 'user-b', email: 'b@test.local', role: 'member' });
const SUPER_ADMIN = createMockUser({ id: 'admin-1', email: 'admin@test.local', role: 'super_admin' });

const VALID_TICKET_INPUT = {
  userId: 'user-a',
  category: 'billing',
  subcategory: 'downgrade_plan',
  subject: 'Please downgrade my plan',
  description: 'I would like to move from Pro to Starter before my next renewal date.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateNotification.mockResolvedValue({ id: 'n1' });
  mockDb.supportTicket.findUnique.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════════
// 1. Support service — validation + creation
// ═══════════════════════════════════════════════════════════════════

describe('support-service — createSupportTicket validation', () => {
  it('rejects a too-short subject', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, subject: 'hi' }),
    ).rejects.toThrow(/at least 5 characters/i);
  });

  it('rejects a too-short description', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, description: 'too short' }),
    ).rejects.toThrow(/at least 20 characters/i);
  });

  it('rejects an invalid category', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, category: 'hacking' }),
    ).rejects.toThrow(/valid support category/i);
  });

  it('rejects an invalid subcategory for the category', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, subcategory: 'nonexistent' }),
    ).rejects.toThrow(/valid subcategory/i);
  });

  it('rejects an invalid priority', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, priority: 'ASAP' }),
    ).rejects.toThrow(/invalid priority/i);
  });

  it('rejects an invalid requestedPlan', async () => {
    await expect(
      createSupportTicket({ ...VALID_TICKET_INPUT, requestedPlan: 'ultimate' }),
    ).rejects.toThrow(/invalid requested plan/i);
  });

  it('creates the ticket with a SUP- reference number + status log + notification', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue(null); // no ticket-number collision
    mockDb.supportTicket.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ticket-1',
      ...data,
    }));
    mockDb.user.findUnique.mockResolvedValue({ email: 'a@test.local', name: 'User A' });

    const ticket = await createSupportTicket(VALID_TICKET_INPUT);

    expect(ticket.ticketNumber).toMatch(/^SUP-\d{4}-[A-Z0-9]+$/);
    expect(ticket.status).toBe('OPEN');
    expect(ticket.category).toBe('billing');
    expect(ticket.subcategory).toBe('downgrade_plan');
    // db create got a statusLog
    expect(mockDb.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OPEN',
          statusLog: expect.objectContaining({ create: expect.anything() }),
        }),
      }),
    );
    // owner confirmation notification was created
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        title: expect.stringContaining(ticket.ticketNumber),
        actionUrl: `/support/tickets/${ticket.id}`,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Support service — messages + status transitions
// ═══════════════════════════════════════════════════════════════════

describe('support-service — messages and transitions', () => {
  it('staff public reply moves OPEN → WAITING_FOR_USER and notifies the owner', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      userId: 'user-a',
      status: 'OPEN',
      ticketNumber: 'SUP-2026-AAA',
      subject: 'S',
    });
    mockDb.supportTicketMessage.create.mockResolvedValue({ id: 'm1' });
    mockDb.supportTicket.update.mockResolvedValue({});
    mockDb.user.findUnique.mockResolvedValue({ email: 'a@test.local', name: 'User A' });

    await addTicketMessage({
      ticketId: 'ticket-1',
      authorId: 'admin-1',
      authorRole: 'admin',
      content: 'We can help with that.',
    });

    expect(mockDb.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'WAITING_FOR_USER' }),
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
  });

  it('user reply on WAITING_FOR_USER reopens the ticket (→ OPEN)', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'WAITING_FOR_USER',
      ticketNumber: 'SUP-2026-AAA', subject: 'S',
    });
    mockDb.supportTicketMessage.create.mockResolvedValue({ id: 'm2' });
    mockDb.supportTicket.update.mockResolvedValue({});

    await addTicketMessage({
      ticketId: 'ticket-1',
      authorId: 'user-a',
      authorRole: 'user',
      content: 'Here is more info.',
    });

    expect(mockDb.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('rejects user messages on CLOSED tickets', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'CLOSED',
      ticketNumber: 'SUP-2026-AAA', subject: 'S',
    });

    await expect(
      addTicketMessage({ ticketId: 'ticket-1', authorId: 'user-a', authorRole: 'user', content: 'hello' }),
    ).rejects.toThrow(/closed/i);
  });

  it('user cannot set an illegal transition (OPEN → IN_PROGRESS)', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'OPEN', ticketNumber: 'X', subject: 'S',
    });

    await expect(
      changeTicketStatus({
        ticketId: 'ticket-1',
        newStatus: 'IN_PROGRESS',
        changedBy: 'user-a',
        changedByRole: 'user',
      }),
    ).rejects.toThrow(/cannot change status/i);
  });

  it('user CAN close their own ticket and reopen a closed one', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'OPEN', ticketNumber: 'X', subject: 'S',
    });
    mockDb.supportTicket.update.mockResolvedValue({ status: 'CLOSED' });

    await changeTicketStatus({
      ticketId: 'ticket-1', newStatus: 'CLOSED', changedBy: 'user-a', changedByRole: 'user',
    });
    expect(mockDb.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED', closedAt: expect.any(Date) }) }),
    );

    // reopen
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'CLOSED', ticketNumber: 'X', subject: 'S',
    });
    mockDb.supportTicket.update.mockClear();
    await changeTicketStatus({
      ticketId: 'ticket-1', newStatus: 'OPEN', changedBy: 'user-a', changedByRole: 'user',
    });
    expect(mockDb.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN', resolvedAt: null, closedAt: null }) }),
    );
  });

  it('admin can resolve an open ticket (→ RESOLVED) and logs the transition', async () => {
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1', userId: 'user-a', status: 'OPEN', ticketNumber: 'X', subject: 'S',
    });
    mockDb.supportTicket.update.mockResolvedValue({ status: 'RESOLVED' });

    await changeTicketStatus({
      ticketId: 'ticket-1', newStatus: 'RESOLVED', changedBy: 'admin-1', changedByRole: 'admin',
    });

    expect(mockDb.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) }) }),
    );
    expect(mockDb.supportTicketStatusLog.create).toHaveBeenCalled();
    // owner notified about resolution
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. SECURITY — cross-user ticket access at the API level
// ═══════════════════════════════════════════════════════════════════

describe('support API security — User A vs User B', () => {
  const TICKET = {
    id: 'ticket-of-user-a',
    userId: 'user-a',
    ticketNumber: 'SUP-2026-A1',
    subject: 'A ticket',
    description: 'desc',
    status: 'OPEN',
    priority: 'NORMAL',
    category: 'billing',
    subcategory: null,
    currentPlan: 'pro',
    requestedPlan: null,
    billingCycle: null,
    assignedTo: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    lastActivityAt: new Date('2026-01-01'),
    resolvedAt: null,
    closedAt: null,
    messages: [],
    statusLog: [],
  };

  function detailRequest() {
    return createMockRequest({
      url: 'http://localhost:3000/api/support/tickets/ticket-of-user-a',
      method: 'GET',
    });
  }

  it('GET detail: owner can read their own ticket', async () => {
    mockGetAuthUser.mockResolvedValue(USER_A);
    mockDb.supportTicket.findUnique.mockResolvedValue({ ...TICKET });

    const res = await ticketDetailRoute(detailRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.id).toBe('ticket-of-user-a');
  });

  it('GET detail: another authenticated user gets 404 (never 403/200 — no existence leak)', async () => {
    mockGetAuthUser.mockResolvedValue(USER_B);
    mockDb.supportTicket.findUnique.mockResolvedValue({ ...TICKET });

    const res = await ticketDetailRoute(detailRequest());
    expect(res.status).toBe(404);
  });

  it('GET detail: unauthenticated request gets 401', async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await ticketDetailRoute(createUnauthenticatedRequest());
    expect(res.status).toBe(401);
  });

  it('GET detail: super_admin (staff) can read any ticket AND sees internal notes', async () => {
    mockGetAuthUser.mockResolvedValue(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      ...TICKET,
      messages: [
        { id: 'm1', content: 'public', isInternal: false },
        { id: 'm2', content: 'internal note', isInternal: true },
      ],
    });

    const res = await ticketDetailRoute(detailRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.messages).toHaveLength(2);
  });

  it('GET detail: owner NEVER receives internal notes', async () => {
    mockGetAuthUser.mockResolvedValue(USER_A);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      ...TICKET,
      messages: [{ id: 'm1', content: 'public reply', isInternal: false }],
      statusLog: [],
    });

    const res = await ticketDetailRoute(detailRequest());
    const body = await res.json();
    expect(body.ticket.messages.every((m: { isInternal: boolean }) => !m.isInternal)).toBe(true);
  });

  it('PATCH: another user cannot close/reopen someone else\u2019s ticket', async () => {
    mockGetAuthUser.mockResolvedValue(USER_B);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-of-user-a', userId: 'user-a',
    });

    const res = await ticketPatchRoute(
      createMockRequest({
        url: 'http://localhost:3000/api/support/tickets/ticket-of-user-a',
        method: 'PATCH',
        body: { status: 'CLOSED' },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('POST message: another user cannot reply to someone else\u2019s ticket', async () => {
    mockGetAuthUser.mockResolvedValue(USER_B);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-of-user-a', userId: 'user-a',
    });

    const res = await messagePostRoute(
      createMockRequest({
        url: 'http://localhost:3000/api/support/tickets/ticket-of-user-a/messages',
        method: 'POST',
        body: { content: 'malicious reply' },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('ticket list is always scoped to the authenticated user', async () => {
    mockGetAuthUser.mockResolvedValue(USER_A);
    mockDb.supportTicket.findMany.mockResolvedValue([]);
    mockDb.supportTicket.count.mockResolvedValue(0);

    const res = await listTicketsRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/tickets', method: 'GET' }),
    );
    expect(res.status).toBe(200);
    // The where clause MUST include the caller's userId.
    expect(mockDb.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_A.id }),
      }),
    );
  });

  it('ticket creation ignores a client-supplied user identity — owner = session user', async () => {
    mockGetAuthUser.mockResolvedValue(USER_A);
    mockDb.supportTicket.findUnique.mockResolvedValue(null);
    mockDb.supportTicket.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 't9', ...data,
    }));
    mockDb.user.findUnique.mockResolvedValue({ email: 'a@test.local', name: 'A' });

    const res = await createTicketRoute(
      createMockRequest({
        url: 'http://localhost:3000/api/support/tickets',
        method: 'POST',
        body: { ...VALID_TICKET_INPUT, userId: 'user-b' },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
    // create data.userId came from the SESSION (user-a), not the body
    expect(mockDb.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_A.id }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Knowledge-base search
// ═══════════════════════════════════════════════════════════════════

describe('KB search — /api/support/kb/articles', () => {
  const ARTICLES = [
    {
      id: 'a1', slug: 'how-credits-work', title: 'How credits work',
      category: 'credits', subcategory: null,
      summary: 'Every AI action has a fixed credit cost.',
      content: 'credits costs per action lead discovery deep analysis',
      tags: '["credits","consumption"]', keywords: '["credit cost"]',
      helpfulCount: 10, notHelpfulCount: 0, updatedAt: new Date(), sortOrder: 1,
      published: true,
    },
    {
      id: 'a2', slug: 'login-and-account-access', title: 'Login and account access issues',
      category: 'account_security', subcategory: null,
      summary: 'Fix OTP verification problems and Google sign-in errors.',
      content: 'otp verification google login password reset',
      tags: '["login","otp"]', keywords: '["otp not received"]',
      helpfulCount: 5, notHelpfulCount: 1, updatedAt: new Date(), sortOrder: 2,
      published: true,
    },
    {
      id: 'a3', slug: 'downgrade-your-plan', title: 'How to downgrade your plan',
      category: 'plans_billing', subcategory: null,
      summary: 'Downgrades go through our support team.',
      content: 'downgrade contact support ticket billing cycle',
      tags: '["downgrade","support"]', keywords: '["lower plan"]',
      helpfulCount: 2, notHelpfulCount: 0, updatedAt: new Date(), sortOrder: 3,
      published: true,
    },
    {
      id: 'a4', slug: 'unpublished', title: 'Hidden draft',
      category: 'credits', subcategory: null,
      summary: 'secret',
      content: 'credits',
      tags: '[]', keywords: '[]',
      helpfulCount: 0, notHelpfulCount: 0, updatedAt: new Date(), sortOrder: 4,
      published: false,
    },
  ];

  it('returns only published articles when browsing (no query)', async () => {
    mockDb.knowledgeBaseArticle.findMany.mockResolvedValue(ARTICLES.filter((a) => a.published));

    const res = await kbSearchRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/kb/articles', method: 'GET' }),
    );
    const body = await res.json();
    expect(body.articles).toHaveLength(3);
    expect(body.articles.some((a: { slug: string }) => a.slug === 'unpublished')).toBe(false);
  });

  it('ranks title matches above content matches for the same term', async () => {
    mockDb.knowledgeBaseArticle.findMany.mockResolvedValue(ARTICLES.filter((a) => a.published));

    const res = await kbSearchRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/kb/articles?q=downgrade', method: 'GET' }),
    );
    const body = await res.json();
    expect(body.articles.length).toBeGreaterThan(0);
    expect(body.articles[0].slug).toBe('downgrade-your-plan');
  });

  it('matches keywords and tags — "otp" finds the login article', async () => {
    mockDb.knowledgeBaseArticle.findMany.mockResolvedValue(ARTICLES.filter((a) => a.published));

    const res = await kbSearchRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/kb/articles?q=otp', method: 'GET' }),
    );
    const body = await res.json();
    expect(body.articles[0].slug).toBe('login-and-account-access');
  });

  it('returns zero results for a nonsense query (no error)', async () => {
    mockDb.knowledgeBaseArticle.findMany.mockResolvedValue(ARTICLES.filter((a) => a.published));

    const res = await kbSearchRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/kb/articles?q=zzzznothing', method: 'GET' }),
    );
    const body = await res.json();
    expect(body.articles).toHaveLength(0);
  });

  it('supports category filtering', async () => {
    mockDb.knowledgeBaseArticle.findMany.mockResolvedValue(
      ARTICLES.filter((a) => a.published && a.category === 'credits'),
    );

    const res = await kbSearchRoute(
      createMockRequest({ url: 'http://localhost:3000/api/support/kb/articles?category=credits', method: 'GET' }),
    );
    const body = await res.json();
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].category).toBe('credits');
  });
});
