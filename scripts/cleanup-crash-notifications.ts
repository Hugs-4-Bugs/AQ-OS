/**
 * One-time cleanup: remove historical crash-noise notifications.
 *
 * The old feedback/crash route put raw exception text into notification
 * titles ("High crash frequency: Cannot read properties of undefined...").
 * The route is now sanitized, and these legacy rows must not remain as the
 * user's production notification experience. Deletes ONLY rows matching the
 * old crash-noise title pattern — no other notification data is touched.
 *
 * Run: npx tsx scripts/cleanup-crash-notifications.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const preview = await db.notification.findMany({
    where: { title: { startsWith: 'High crash frequency:' } },
    select: { id: true, title: true, createdAt: true },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Found ${preview.length} (showing up to 20) crash-noise notifications:`);
  for (const n of preview) console.log(` - [${n.createdAt.toISOString()}] ${n.title}`);

  const result = await db.notification.deleteMany({
    where: { title: { startsWith: 'High crash frequency:' } },
  });
  console.log(`Deleted ${result.count} crash-noise notification rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
