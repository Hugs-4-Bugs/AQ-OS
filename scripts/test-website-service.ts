/**
 * Direct verification test for Cytecare + canonicalization unit checks.
 */
import { verifyWebsiteCandidate, canonicalizeWebsiteUrl, websitesMatch, resolveLeadWebsite } from '../src/lib/website-service';

async function main() {
  console.log('=== CANONICALIZATION ===');
  const cases: Array<[unknown, string | null]> = [
    ['https://cytecare.com', 'https://cytecare.com'],
    ['https://www.cytecare.com/', 'https://cytecare.com'],
    [' www.Cytecare.com ', 'https://cytecare.com'],
    ['cytecare.com', 'https://cytecare.com'],
    ['http://cytecare.com:443/', 'https://cytecare.com'],
    ['javascript:alert(1)', null],
    ['not a url', null],
    ['https://cytecare.com/about/team/', 'https://cytecare.com/about/team'],
  ];
  for (const [input, expected] of cases) {
    const got = canonicalizeWebsiteUrl(input);
    console.log(`${String(input).padEnd(36)} → ${got} ${got === expected ? 'OK' : `MISMATCH (expected ${expected})`}`);
  }
  console.log('match www vs apex:', websitesMatch('https://www.cytecare.com/', 'https://cytecare.com'));

  console.log('=== VERIFY CYTECARE (with search corroboration) ===');
  const lead = {
    businessName: 'Cytecare Hospitals',
    niche: 'Hospital',
    city: 'Bangalore',
    country: 'India',
    phone: null as string | null,
    email: null as string | null,
  };
  const v = await verifyWebsiteCandidate(lead, 'https://cytecare.com', [
    { title: 'Cytecare Hospitals | Best Cancer Hospital in Bangalore', snippet: 'Cytecare Hospitals Bangalore - oncology services, appointments and more at cytecare.com' },
    { title: 'Cytecare Hospital Karnataka', snippet: 'Cytecare is a network of cancer hospitals' },
  ]);
  console.log(JSON.stringify(v, null, 2).slice(0, 900));

  console.log('=== VERIFY WITHOUT corroboration (should still probe real content) ===');
  const v2 = await verifyWebsiteCandidate(lead, 'https://zoho.com');
  console.log(JSON.stringify(v2, null, 2).slice(0, 500));
}

main().catch((e) => { console.error(e); process.exit(1); });
