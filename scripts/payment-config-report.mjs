#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Provider Configuration Report (CLI)
//
// FINAL PAYMENT ACTIVATION ARCHITECTURE (Sep 2026) — requirement #19.
// Prints CONFIGURED/MISSING for every payment provider credential and
// per-plan provider ID mapping.
//
//   node scripts/payment-config-report.mjs
//
// SAFETY:
//   • NEVER prints secret/ID VALUES — only variable names and status.
//   • Read-only: loads .env (if present) into a local copy of the
//     environment for checking; does not modify any file.
//   • The canonical implementation of this report lives in
//     src/lib/payment-config-validator.ts (used by the admin API
//     endpoint /api/payments/config-status and the unit tests). This
//     CLI mirrors the same env-name conventions for offline use.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load .env (names only go into the check env; values never printed) ──
const env = { ...process.env };
try {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (env[m[1]] === undefined) {
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      env[m[1]] = v;
    }
  }
} catch {
  // No .env file — rely on the real process environment only.
}

const mark = (ok) => (ok ? 'CONFIGURED' : 'MISSING');

function check(name) {
  const v = env[name];
  return typeof v === 'string' && v.trim() !== '';
}

function checkId(name, prefix) {
  const v = env[name];
  if (typeof v !== 'string' || v.trim() === '') return false;
  return v.startsWith(prefix);
}

const PLANS = ['STARTER', 'PRO', 'ELITE'];
const CYCLES = ['MONTHLY', 'YEARLY'];

console.log('');
console.log('AcquisitionOS — Payment Provider Configuration Report');
console.log('Secret values are NEVER printed. Status only.');
console.log('');

console.log('Stripe:');
console.log(`  SECRET_KEY                 ${mark(check('STRIPE_SECRET_KEY'))}`);
console.log(`  WEBHOOK_SECRET             ${mark(check('STRIPE_WEBHOOK_SECRET'))}`);
console.log(`  PUBLISHABLE_KEY            ${mark(check('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'))}`);
console.log('');
for (const plan of PLANS) {
  for (const cycle of CYCLES) {
    const canonical = `STRIPE_PRICE_${plan}_${cycle}_ID`;
    let ok = checkId(canonical, 'price_');
    let via = canonical;
    if (!ok) {
      // Legacy aliases (same order as resolvePlanPriceId).
      const aliases = [
        `STRIPE_${plan}_${cycle}_PRICE_ID`,
        `STRIPE_PRICE_ID_${plan}_${cycle}`,
        `STRIPE_PRICE_${plan}_${cycle}`,
      ];
      for (const a of aliases) {
        if (checkId(a, 'price_')) {
          ok = true;
          via = `${a} (legacy alias)`;
          break;
        }
      }
    }
    console.log(`  ${(plan + ' ' + cycle).toLowerCase().padEnd(26)} ${mark(ok)}${ok ? `  via ${via}` : `  (set ${canonical})`}`);
  }
}
console.log('');
console.log('  Credit packs (existing products must stay functional):');
for (const n of ['100', '500', '1000']) {
  const name = `STRIPE_PRICE_CREDITS_${n}_ID`;
  console.log(`    ${`${n} credits`.padEnd(22)} ${mark(checkId(name, 'price_'))}  (set ${name})`);
}

console.log('');
console.log('Razorpay:');
console.log(`  KEY_ID                     ${mark(check('RAZORPAY_KEY_ID'))}`);
console.log(`  KEY_SECRET                 ${mark(check('RAZORPAY_KEY_SECRET'))}`);
console.log(`  WEBHOOK_SECRET             ${mark(check('RAZORPAY_WEBHOOK_SECRET'))}`);
console.log('');
for (const plan of PLANS) {
  for (const cycle of CYCLES) {
    const name = `RAZORPAY_PLAN_${plan}_${cycle}`;
    console.log(`  ${(plan + ' ' + cycle).toLowerCase().padEnd(26)} ${mark(checkId(name, 'plan_'))}  (set ${name})`);
  }
}

// ── Summary ──
const stripeCreds = check('STRIPE_SECRET_KEY');
const rzpCreds = check('RAZORPAY_KEY_ID') && check('RAZORPAY_KEY_SECRET');
const rzpRecurring = PLANS.every((p) => CYCLES.every((c) => checkId(`RAZORPAY_PLAN_${p}_${c}`, 'plan_')));

console.log('');
console.log('Summary:');
console.log(`  Paid plans in application : Starter / Pro / Elite = ACTIVE (no config needed for plan status)`);
console.log(`  Stripe checkout ready     : ${stripeCreds ? 'YES (per-plan readiness above)' : 'NO — set STRIPE_SECRET_KEY + per-plan Price IDs'}`);
console.log(`  Razorpay checkout ready   : ${rzpCreds ? 'YES (one-time orders; recurring needs Plan IDs)' : 'NO — set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET'}`);
console.log(`  Razorpay recurring (all 6): ${rzpRecurring ? 'YES' : 'NO — set the six RAZORPAY_PLAN_* IDs above'}`);
console.log('');
console.log('After the required env vars are supplied, no further source-code');
console.log('change is needed — checkout activates automatically.');
console.log('');
