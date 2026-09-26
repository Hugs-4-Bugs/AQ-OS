// Revert the E2E test account to its pre-test state:
//  - delete synthetic temp PRO subscription
//  - user plan back to free
//  - delete the test lead(s) + test discovery notifications
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('db/custom.db');
const userId = 'cmuf3wyij0000n3p9dhtqqzjq';

db.prepare("DELETE FROM Subscription WHERE id = 'e2e-discovery-temp'").run();
db.prepare("UPDATE User SET plan='free' WHERE id = ?").run(userId);
const l = db.prepare("DELETE FROM Lead WHERE userId = ? AND id = 'e2e-textio-restored'").run();
const n = db.prepare("DELETE FROM Notification WHERE userId = ? AND type LIKE 'discovery%'").run();
const jobs = db.prepare("DELETE FROM DiscoveryJob WHERE userId = ?").run();
console.log(`reverted: subscription deleted, plan=free, leads removed=${l.changes}, notifications removed=${n.changes}, jobs removed=${jobs.changes}`);
