#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — diagnose /api/leads HTTP 500.
 * Prints the full error body + ownership counts for workflow/autopilot tables.
 * Read-only with respect to user data.
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const DB_PATH = '/home/z/my-project/db/custom.db';

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function main() {
  const env = readEnv();
  const sdb = new DatabaseSync(DB_PATH, { readOnly: true });
  const elite = sdb.prepare("SELECT id, email, role, plan FROM User WHERE email='mailtoprabhat72@gmail.com'").get();
  const token = jwt.sign(
    { sub: elite.id, email: elite.email, role: elite.role, plan: elite.plan, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: 900, issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );

  // 1. Full error body from /api/leads
  const res = await fetch(BASE + '/api/leads', {
    headers: { Cookie: 'access_token=' + token },
    signal: AbortSignal.timeout(30000),
  });
  console.log('GET /api/leads -> HTTP ' + res.status);
  const text = await res.text();
  console.log('BODY: ' + text.slice(0, 1200));

  // 2. Ownership distribution of workflow-ish tables
  for (const t of ['AutopilotWorkflow', 'WorkflowExecution', 'Workflow', 'Lead']) {
    try {
      const rows = sdb.prepare(`SELECT userId, COUNT(*) c FROM "${t}" GROUP BY userId ORDER BY c DESC LIMIT 5`).all();
      console.log('OWNERSHIP ' + t + '=' + JSON.stringify(rows));
    } catch (e) {
      console.log('OWNERSHIP ' + t + '=ERROR ' + e.message);
    }
  }
  sdb.close();
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
