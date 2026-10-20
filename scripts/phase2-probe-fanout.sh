#!/bin/bash
# Read-only provider probe: do different query phrasings yield DIFFERENT results?
# Purpose: determine whether query fan-out can act as pagination for web_search.
# No DB writes, no code changes.

mkdir -p /tmp/probe-fanout
cd /tmp/probe-fanout

declare -A QUERIES=(
  [q1_base]="dentists in Mumbai"
  [q2_contact]="dentists Mumbai India contact details"
  [q3_best]="best dentists in Mumbai reviews"
  [q4_bandra]="dentists in Bandra Mumbai"
  [q5_andheri]="dentists in Andheri Mumbai"
  [q6_directory]="dentists Mumbai directory list"
  [q7_top50]="top 50 dentists in Mumbai"
  [q8_clinics]="dental clinics in Mumbai"
  [q9_orthodontist]="orthodontists in Mumbai"
  [q10_nums]="dentist phone number Mumbai list"
)

for key in "${!QUERIES[@]}"; do
  z-ai function -n web_search -a "{\"query\": \"${QUERIES[$key]}\", \"num\": 20}" -o "/tmp/probe-fanout/${key}.json" 2>/dev/null | grep -c "completed" > /dev/null
  echo "fetched: $key -> ${QUERIES[$key]}"
done

echo "=== ANALYSIS ==="
bun -e "
const fs = require('fs');
const files = fs.readdirSync('/tmp/probe-fanout').filter(f => f.endsWith('.json'));
const all = {};
const urlToQuery = {};
let total = 0;
for (const f of files) {
  const key = f.replace('.json', '');
  const r = JSON.parse(fs.readFileSync('/tmp/probe-fanout/' + f, 'utf8'));
  const arr = Array.isArray(r) ? r : (r.results || []);
  all[key] = arr.map(x => x.url);
  arr.forEach(x => { urlToQuery[x.url] = urlToQuery[x.url] || []; urlToQuery[x.url].push(key); });
  total += arr.length;
  console.log(key + ': ' + arr.length + ' results');
}
const uniqueUrls = Object.keys(urlToQuery);
console.log('---');
console.log('TOTAL raw results:', total);
console.log('UNIQUE URLs across all queries:', uniqueUrls.length);
// unique by domain (a business may have multiple pages)
const domains = new Set(uniqueUrls.map(u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }));
console.log('UNIQUE domains:', domains.size);
// overlap analysis
const overlap = uniqueUrls.filter(u => urlToQuery[u].length > 1).length;
console.log('URLs returned by 2+ queries (overlap):', overlap);
// per-query new contribution
console.log('--- per-query NEW unique contribution (in order) ---');
const seen = new Set();
const order = ['q1_base','q2_contact','q3_best','q4_bandra','q5_andheri','q6_directory','q7_top50','q8_clinics','q9_orthodontist','q10_nums'];
for (const k of order) {
  if (!all[k]) continue;
  const before = seen.size;
  all[k].forEach(u => seen.add(u));
  console.log(k + ': +' + (seen.size - before) + ' new (' + all[k].length + ' returned, ' + (seen.size - before === all[k].length ? 'ALL new' : 'some overlap') + ')');
}
console.log('CUMULATIVE unique URLs after all 10 queries:', seen.size);
"
