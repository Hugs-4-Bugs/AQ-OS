// Temporary PRO grant for the E2E discovery test user (reverted after tests).
// Same pattern as the previous auth E2E: synthetic row created for testing
// only, then deleted — never touches real user data.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('db/custom.db');
const userId = 'cmuf3wyij0000n3p9dhtqqzjq';
const action = process.argv[2] || 'grant';

if (action === 'grant') {
  const existing = db.prepare('SELECT id FROM Subscription WHERE userId = ?').get(userId);
  if (!existing) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO Subscription (id, userId, plan, status, currentPeriodStart, currentPeriodEnd, isTrial, billingCycle, creditsTotal, creditsUsed, creditsRemaining, createdAt, updatedAt)
       VALUES ('e2e-discovery-temp', ?, 'pro', 'active', ?, ?, 0, 'monthly', 500, 0, 500, ?, ?)`
    ).run(userId, new Date(now - 86400000).toISOString(), new Date(now + 30 * 86400000).toISOString(), new Date(now).toISOString(), new Date(now).toISOString());
  }
  db.prepare("UPDATE User SET plan='pro' WHERE id = ?").run(userId);
  console.log('PRO granted (temp)');
} else if (action === 'revert') {
  db.prepare("DELETE FROM Subscription WHERE id = 'e2e-discovery-temp'").run();
  db.prepare("UPDATE User SET plan='free' WHERE id = ?").run(userId);
  console.log('PRO reverted, user back to free');
}
