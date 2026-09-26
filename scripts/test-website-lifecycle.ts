/**
 * Multi-case website lifecycle regression (§19):
 *  1. Lead with valid existing website → re-verified, no churn
 *  2. Lead without discoverable website → NOT_FOUND_AFTER_RESEARCH
 *  3. Lead with invalid website → INVALID detected (no false claims)
 *  4. Stale research marking when a website gets discovered
 * All scratch data is cleaned up; production rows untouched.
 */
import { PrismaClient } from '@prisma/client';
import { resolveLeadWebsite, effectiveWebsiteStatus } from '../src/lib/website-service';

const db = new PrismaClient();
const OWNER_ID = 'cmqrtgnjx0000qfgnsbhzyzxq'; // mailtoprabhat72@gmail.com
let pass = 0, fail = 0;
function check(desc: string, ok: boolean) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${desc}`);
  ok ? pass++ : fail++;
}

async function main() {
  // ── Case 1: existing valid website lead ──
  console.log('=== CASE 1: existing valid website (re-verify, no churn) ===');
  const withSite = await db.lead.findFirst({
    where: { userId: OWNER_ID, website: { not: null }, isActive: true },
    select: { id: true, businessName: true, website: true },
  });
  if (withSite) {
    const full = await db.lead.findUnique({ where: { id: withSite.id } });
    const before = full!.website;
    const res = await resolveLeadWebsite(full!, { persist: false });
    check(`"${withSite.businessName}" → VERIFIED (status=${res.status})`, res.status === 'VERIFIED');
    check('URL unchanged (no discovery churn)', res.website === before && !res.changed);
    check('homepage text actually fetched', !!res.homepageTitle || !!res.homepageText);
  } else {
    check('no lead with website available for test', false);
  }

  // ── Case 2: NOT_FOUND_AFTER_RESEARCH (gibberish company, persist:false) ──
  console.log('=== CASE 2: genuinely undiscoverable → NOT_FOUND_AFTER_RESEARCH ===');
  const res2 = await resolveLeadWebsite(
    {
      id: 'scratch-nonexistent',
      businessName: 'Zzyzx Quxblox Mechanical Grommets LLP',
      niche: 'Grommet Manufacturing',
      city: 'Nonexistentville',
      country: 'Atlantis',
      phone: null,
      email: null,
      website: null,
      hasWebsite: false,
      websiteStatus: 'UNKNOWN',
    },
    { persist: false }
  );
  check(`status = NOT_FOUND_AFTER_RESEARCH (got ${res2.status})`, res2.status === 'NOT_FOUND_AFTER_RESEARCH');
  check('attempts recorded (research actually ran)', res2.attempts >= 2);
  check('no website invented', res2.website === null);
  check('evidence explains the research', res2.evidence.length >= 2);

  // ── Case 3: invalid stored website ──
  console.log('=== CASE 3: invalid website → detected, rediscovery attempted ===');
  const res3 = await resolveLeadWebsite(
    {
      id: 'scratch-invalid',
      businessName: 'Zzyzx Quxblox Mechanical Grommets LLP',
      niche: 'Grommet Manufacturing',
      city: null,
      country: null,
      phone: null,
      email: null,
      website: 'https://this-domain-dead-xyz-98765.com',
      hasWebsite: true,
      websiteStatus: 'VERIFIED',
    },
    { persist: false }
  );
  check(`invalid URL detected → ${res3.status}`, res3.status === 'INVALID' || res3.status === 'NOT_FOUND_AFTER_RESEARCH');
  check('dead URL preserved (never silently deleted)', res3.website === 'https://this-domain-dead-xyz-98765.com');
  check('evidence mentions the failure', res3.evidence.some((e) => /dead|unreachable|could not be verified|candidate/i.test(e)));

  // ── Case 4: stale research marking (real discovery → VERIFIED) ──
  console.log('=== CASE 4: website discovered → old analysis marked STALE ===');
  const scratch = await db.lead.create({
    data: {
      userId: OWNER_ID,
      businessName: 'Zoho Corporation',
      niche: 'Software',
      country: 'India',
      city: 'Chennai',
      source: 'test_scratch',
      website: null,
      hasWebsite: false,
      websiteStatus: 'UNKNOWN',
      isActive: true,
    },
  });
  const fakeAnalysis = await db.leadAnalysis.create({
    data: {
      leadId: scratch.id,
      replyScore: 10,
      isStale: false,
      staleReason: null,
    },
  });
  const full4 = await db.lead.findUnique({ where: { id: scratch.id } });
  const res4 = await resolveLeadWebsite(full4!, { persist: true });
  check(`Zoho website discovered → VERIFIED (got ${res4.status}, url=${res4.website})`, res4.status === 'VERIFIED' && !!res4.website && /zoho\.com/.test(res4.website));
  check('discoveredNow = true', res4.discoveredNow);
  const analysisAfter = await db.leadAnalysis.findUnique({ where: { leadId: scratch.id } });
  check('old analysis marked isStale=true', analysisAfter?.isStale === true);
  check('staleReason explains the website discovery', !!analysisAfter?.staleReason && /website/i.test(analysisAfter.staleReason));
  const leadAfter = await db.lead.findUnique({ where: { id: scratch.id } });
  check('lead persisted with website+VERIFIED', !!leadAfter?.website && leadAfter.websiteStatus === 'VERIFIED' && leadAfter.hasWebsite);
  check('effectiveWebsiteStatus helper consistent', effectiveWebsiteStatus(leadAfter!) === 'VERIFIED');

  // cleanup scratch
  await db.leadAnalysis.delete({ where: { id: fakeAnalysis.id } });
  await db.lead.delete({ where: { id: scratch.id } });
  console.log('  (scratch lead + analysis deleted)');

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
