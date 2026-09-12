/**
 * Standalone API Key Expiration Cron Runner
 * Bypasses the web server — runs directly against the database via Prisma.
 * Usage: bun run cron-expire-api-keys.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db',
    },
  },
});

async function main() {
  const startTime = Date.now();

  try {
    const now = new Date();

    // Find all active keys that have expired
    const expiredKeys = await db.apiKey.findMany({
      where: {
        status: 'active',
        isActive: true,
        expiresAt: { not: null, lt: now },
      },
      select: { id: true, userId: true, name: true, keyPrefix: true },
    });

    let expired = 0;
    let errors = 0;

    for (const key of expiredKeys) {
      try {
        await db.apiKey.update({
          where: { id: key.id },
          data: { status: 'expired', isActive: false },
        });

        await db.auditLog.create({
          data: {
            userId: key.userId,
            action: 'api_key_expired',
            details: `API key "${key.name}" (${key.keyPrefix}) expired automatically [standalone cron]`,
            resource: 'api_key',
            resourceId: key.id,
          },
        });

        expired++;
      } catch {
        errors++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(JSON.stringify({
      success: true,
      source: 'standalone-cron',
      expired,
      errors,
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
    }));

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(JSON.stringify({
      success: false,
      source: 'standalone-cron',
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
