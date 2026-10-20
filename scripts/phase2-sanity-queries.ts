// Sanity check: verify buildSearchQueries deterministic query counts after edits.
// Read-only import check; no DB writes.
import { buildSearchQueries, searchQueryBudget } from '@/lib/lead-discovery-service';

const base = {
  country: undefined as string | undefined,
  city: undefined as string | undefined,
  source: 'ai_search' as const,
  criteria: {
    website: 'any' as const,
    excludeTypes: [] as never[],
    growthSignals: false,
    hiringSignals: false,
  },
};

console.log('== budget table ==');
for (const t of [10, 20, 25, 30, 40, 50, 60, 70, 100, 200, undefined]) {
  console.log(`maxResults=${t} -> budget=${searchQueryBudget(t)}`);
}

console.log('\n== dentist (synonym niche), worldwide, target 200 ==');
const q1 = buildSearchQueries({ ...base, niche: 'dentist', maxResults: 200 });
console.log('count:', q1.length);
q1.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

console.log('\n== dentist, worldwide, target 20 (budget 10) ==');
const q2 = buildSearchQueries({ ...base, niche: 'dentist', maxResults: 20 });
console.log('count:', q2.length);

console.log('\n== pest control (no synonyms), Mumbai, target 70 ==');
const q3 = buildSearchQueries({ ...base, niche: 'pest control', city: 'Mumbai', country: 'India', maxResults: 70 });
console.log('count:', q3.length);
q3.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

console.log('\n== dentist, Mumbai, target 70 (deterministic part; locality appended at runtime) ==');
const q4 = buildSearchQueries({ ...base, niche: 'dentist', city: 'Mumbai', country: 'India', maxResults: 70 });
console.log('count:', q4.length);
