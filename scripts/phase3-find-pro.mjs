// Phase 3 probe — find users with active pro/elite subscriptions (read-only).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const users = await db.user.findMany({
  where: { isActive: true, deletedAt: null },
  select: {
    id: true, email: true, role: true,
    subscriptions: { where: { status: { in: ['active', 'trialing'] } }, select: { plan: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    _count: { select: { workflowDefinitions: true } },
  },
  take: 60,
  orderBy: { createdAt: 'desc' },
});
const withPlan = users.filter(u => u.subscriptions.length > 0);
console.log(JSON.stringify(withPlan, null, 2));
await db.$disconnect();
