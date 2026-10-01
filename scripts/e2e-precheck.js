// Read-only snapshot check: fixture user state for E2E
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const src = '/home/z/my-project/db/custom.db';
const tmpDir = '/home/z/my-project/.test-tmp';
fs.mkdirSync(tmpDir, { recursive: true });
const snap = path.join(tmpDir, `e2e-precheck-${Date.now()}.db`);
fs.copyFileSync(src, snap);
const db = new DatabaseSync(snap, { readOnly: true });

try {
  const rows = db
    .prepare(
      `SELECT id, email, plan, credits, role, isActive,
              (SELECT COUNT(*) FROM Lead WHERE Lead.userId = User.id) AS leadCount
       FROM User WHERE email LIKE '%qa%' OR email LIKE '%test%' LIMIT 5`
    )
    .all();
  console.log(JSON.stringify(rows, null, 1));

  const plans = db.prepare(`SELECT plan, COUNT(*) AS n FROM User GROUP BY plan`).all();
  console.log('plan distribution:', JSON.stringify(plans));
} finally {
  db.close();
  fs.unlinkSync(snap);
}
