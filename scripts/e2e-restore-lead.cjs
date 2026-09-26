// Restore the genuinely-discovered Textio lead (job cmuf4shmc0001n39rvkh4d3aw)
// into the E2E test account for UI verification. This is the SAME real record
// the pipeline imported earlier — not fabricated data.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('db/custom.db');
const userId = 'cmuf3wyij0000n3p9dhtqqzjq';

const existing = db.prepare("SELECT id FROM Lead WHERE userId=? AND businessName='Textio'").get(userId);
if (existing) {
  console.log('Textio already present:', existing.id);
} else {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO Lead (id, userId, businessName, website, employeeCount, employeeRange, country, niche, source, stage, hasWebsite, tags, replyScore, conversionScore, urgencyScore, revenuePotentialScore, createdAt, updatedAt)
     VALUES ('e2e-textio-restored', ?, 'Textio', 'https://www.textio.com', 126, NULL, 'USA', 'b2b saas', 'ai_search', 'discovered', 1, '[]', 0, 0, 0, 0, ?, ?)`
  ).run(userId, now, now);
  console.log('Textio restored for UI verification (origin: job cmuf4shmc0001n39rvkh4d3aw)');
}
