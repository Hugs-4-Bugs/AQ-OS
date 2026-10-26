#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — Step 2/5 verification
 * READ-ONLY elite account check: plan, credits, subscription rows.
 */
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';

function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const u = db
    .prepare(
      "SELECT id, email, name, plan, credits, creditsMonthly, rolloverCredits, role, isActive, authProvider, googleId FROM User WHERE email='mailtoprabhat72@gmail.com'"
    )
    .get();
  if (!u) {
    console.log('ELITE_USER=NOT_FOUND');
    db.close();
    process.exit(1);
  }
  console.log('ELITE_USER=' + JSON.stringify(u));
  const subs = db
    .prepare(
      'SELECT plan, status, creditsTotal, creditsUsed, creditsRemaining, creditsResetAt, currentPeriodEnd FROM Subscription WHERE userId=? ORDER BY createdAt DESC'
    )
    .all(u.id);
  console.log('SUBSCRIPTIONS=' + JSON.stringify(subs));
  db.close();
}

main();
