#!/bin/bash
# Read-only probe: validate NEW phrasings + more localities add unique results
# beyond the existing 10-query set (52 unique URLs baseline from prior probe).
mkdir -p /tmp/probe-fanout2
cd /tmp/probe-fanout2

declare -A QUERIES=(
  [n1_top10]="top 10 dentists in Mumbai"
  [n2_specialists]="dental specialists in Mumbai"
  [n3_leading]="leading dental companies in Mumbai"
  [n4_affordable]="affordable dentists in Mumbai"
  [n5_near]="dentist services near Mumbai"
  [n6_dadar]="dentists in Dadar Mumbai"
  [n7_powai]="dentists in Powai Mumbai"
  [n8_colaba]="dentists in Colaba Mumbai"
  [n9_juhu]="dentists in Juhu Mumbai"
)

for key in "${!QUERIES[@]}"; do
  z-ai function -n web_search -a "{\"query\": \"${QUERIES[$key]}\", \"num\": 20}" -o "/tmp/probe-fanout2/${key}.json" 2>/dev/null > /dev/null
  echo "fetched: $key -> ${QUERIES[$key]}"
done

echo "=== ANALYSIS vs prior 52-URL baseline ==="
bun -e "
const fs = require('fs');
// prior baseline URLs (10 existing queries)
const prior = new Set();
for (const f of fs.readdirSync('/tmp/probe-fanout')) {
  if (!f.endsWith('.json')) continue;
  const r = JSON.parse(fs.readFileSync('/tmp/probe-fanout/' + f, 'utf8'));
  const arr = Array.isArray(r) ? r : (r.results || []);
  arr.forEach(x => prior.add(x.url));
}
console.log('baseline unique URLs (existing 10 queries):', prior.size);
let allNew = new Set();
for (const f of fs.readdirSync('/tmp/probe-fanout2')) {
  if (!f.endsWith('.json')) continue;
  const key = f.replace('.json', '');
  const r = JSON.parse(fs.readFileSync('/tmp/probe-fanout2/' + f, 'utf8'));
  const arr = Array.isArray(r) ? r : (r.results || []);
  const newUrls = arr.filter(x => !prior.has(x.url));
  newUrls.forEach(x => allNew.add(x.url));
  console.log(key + ': ' + arr.length + ' results, ' + newUrls.length + ' NEW unique (not in baseline)');
}
console.log('---');
console.log('TOTAL NEW unique URLs from 9 additional queries:', allNew.size);
console.log('COMBINED unique URLs (19 queries):', prior.size + allNew.size);
const domains = new Set([...prior, ...allNew].map(u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }));
console.log('COMBINED unique domains:', domains.size);
"
