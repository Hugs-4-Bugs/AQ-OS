#!/usr/bin/env node
/**
 * db-recovery-profile.cjs — READ-ONLY profiling of SQLite DB files.
 * Used for the 2026-10-22 "lost custom.db" recovery decision.
 *
 * SAFETY:
 *   - Never writes to any DB: every file is FIRST copied to /tmp and the
 *     copy is profiled (originals — including the read-only snapshots in
 *     db-backups/ — are never opened for write).
 *   - Never prints secrets: password hashes / OTP tokens are only reported
 *     as booleans (hasPassword). Emails/plans/credits are non-secret.
 *
 * Prints per file: sha, integrity_check, table counts, plan distribution,
 * the two target accounts (credits/allowance/subscription/ledger stats),
 * and global CreditsLedger recency — everything needed to compare the live
 * DB against backup candidates without touching either.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const TARGET_EMAILS = ['kattyboy785@gmail.com', 'mailtoprabhat72@gmail.com'];

async function q(p, sql) {
  try {
    return await p.$queryRawUnsafe(sql);
  } catch (e) {
    return { __err: String(e.message || e).slice(0, 120) };
  }
}

async function profileFile(file) {
  const abs = path.resolve(file);
  const stat = fs.statSync(abs);
  const sha = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  const tmp = path.join(os.tmpdir(), `profile-${Date.now()}-${path.basename(abs)}`);
  fs.copyFileSync(abs, tmp);
  const p = new PrismaClient({ datasources: { db: { url: 'file:' + tmp } } });
  const out = {
    file: abs,
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    sha256_first12: sha.slice(0, 12),
  };

  const ic = await q(p, 'PRAGMA integrity_check');
  out.integrity = ic.__err ? { error: ic.__err } : (ic[0] && ic[0].integrity_check);

  const tables = [
    'User', 'Lead', 'Subscription', 'CreditsLedger', 'PaymentOrder', 'AuditLog',
    'UserSession', 'LoginHistory', 'WorkflowDefinition', 'WorkflowExecution',
    'DiscoveryJob', 'DailyOutreachUsage', 'CreditAddon', 'Deal', 'LeadActivity',
  ];
  out.counts = {};
  for (const t of tables) {
    const r = await q(p, `SELECT count(*) c FROM "${t}"`);
    out.counts[t] = r.__err ? 'N/A (table absent)' : Number(r[0].c);
  }

  out.planDistribution = await q(
    p,
    'SELECT plan, count(*) c FROM "User" GROUP BY plan ORDER BY c DESC'
  );

  out.accounts = {};
  for (const email of TARGET_EMAILS) {
    const r = await q(
      p,
      `SELECT id, email, plan, credits, "creditsMonthly", "rolloverCredits", ` +
      `(passwordHash IS NOT NULL) hasPassword, emailVerified, isActive, ` +
      `(deletedAt IS NULL) notDeleted, datetime(lastLoginAt) lastLoginAt, ` +
      `datetime(createdAt) createdAt, authProvider ` +
      `FROM "User" WHERE email='${email}'`
    );
    const acct = r.__err ? { error: r.__err } : (r[0] || { notFound: true });
    out.accounts[email] = acct;
    if (acct.id) {
      acct.subscriptions = await q(
        p,
        `SELECT plan, status, "creditsTotal", "creditsUsed", "creditsRemaining", ` +
        `datetime(createdAt) createdAt FROM "Subscription" WHERE userId='${acct.id}' ORDER BY createdAt`
      );
      const led = await q(
        p,
        `SELECT count(*) n, datetime(max(createdAt)) lastEntry, sum(credits) sumCredits ` +
        `FROM "CreditsLedger" WHERE userId='${acct.id}'`
      );
      acct.ledger = led.__err ? { error: led.__err } : led[0];
    }
  }

  const g = await q(
    p,
    'SELECT count(*) n, datetime(max(createdAt)) lastEntry FROM "CreditsLedger"'
  );
  out.ledgerGlobal = g.__err ? { error: g.__err } : g[0];

  await p.$disconnect();
  try { fs.rmSync(tmp); } catch {}
  return out;
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node scripts/db-recovery-profile.cjs <db-file> [...]');
    process.exit(1);
  }
  for (const f of files) {
    console.log('════════ ' + f + ' ════════');
    try {
      const profile = await profileFile(f);
      console.log(JSON.stringify(profile, (k, v) => (typeof v === 'bigint' ? Number(v) : v), 1));
    } catch (e) {
      console.error('PROFILE FAILED for ' + f + ': ' + (e.message || e));
    }
  }
})().catch((e) => {
  console.error('PROFILE RUN FAILED:', e);
  process.exit(1);
});
