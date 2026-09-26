// Quick DB inspection for admin dashboard planning (read-only)
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const totalUsers = await db.user.count();
  const byRole = await db.user.groupBy({ by: ['role'], _count: { role: true } });
  const byPlan = await db.user.groupBy({ by: ['plan'], _count: { plan: true } });
  const superAdmins = await db.user.findMany({
    where: { role: 'super_admin' },
    select: { id: true, email: true, isActive: true },
    take: 10,
  });
  const counts = {
    leads: await db.lead.count(),
    workflows: await db.workflowDefinition.count(),
    workflowExecutions: await db.workflowExecution.count(),
    subscriptions: await db.subscription.count(),
    notifications: await db.notification.count(),
    auditLogs: await db.auditLog.count(),
    feedback: await db.feedbackReport.count().catch(() => -1),
    paymentOrders: await db.paymentOrder.count(),
    outreachMessages: await db.outreachMessage.count(),
  };
  console.log(JSON.stringify({ totalUsers, byRole, byPlan, superAdmins, counts }, null, 2));
}

main()
  .catch((e) => { console.error('ERR:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
