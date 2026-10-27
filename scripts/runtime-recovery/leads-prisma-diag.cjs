#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — reproduce the /api/leads Prisma failure standalone
 * to capture the REAL error (the API route swallows it into a generic 500),
 * and diff the Lead table columns against the Prisma schema expectations.
 */
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const DB_PATH = '/home/z/my-project/db/custom.db';
const ELITE_ID = 'cmqrtgnjx0000qfgnsbhzyzxq';

async function main() {
  const db = new PrismaClient();

  // 1. Exact query the route runs.
  try {
    const leads = await db.lead.findMany({
      where: { userId: ELITE_ID },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    console.log('FINDMANY_OK count=' + leads.length);
  } catch (e) {
    console.log('FINDMANY_ERROR: ' + String(e.message).slice(0, 600));
  }

  // 2. Actual Lead table columns.
  const sdb = new DatabaseSync(DB_PATH, { readOnly: true });
  const cols = sdb.prepare('PRAGMA table_info("Lead")').all().map((c) => c.name);
  console.log('LEAD_TABLE_COLUMNS=' + cols.join(','));
  sdb.close();

  // 3. Prisma schema Lead model fields.
  const schema = fs.readFileSync('/home/z/my-project/prisma/schema.prisma', 'utf8');
  const m = schema.match(/model Lead \{([\s\S]*?)\n\}/);
  if (m) {
    const fields = m[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0])
      .filter((f) => f && !f.startsWith('@@'));
    console.log('PRISMA_LEAD_FIELDS=' + fields.join(','));
    const missing = fields.filter((f) => !cols.includes(f));
    console.log('MISSING_IN_DB=' + (missing.join(',') || 'none'));
    const extra = cols.filter((c) => !fields.includes(c));
    console.log('EXTRA_IN_DB=' + (extra.join(',') || 'none'));
  }

  await db.$disconnect();
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
