#!/usr/bin/env node
/* Round-2 schema gap extraction: map row-type object targets to models
   via field overlap with schema.prisma; dump hand-fix samples. */
const fs = require('fs');
const ROOT = '/home/z/my-project';
const schema = fs.readFileSync(`${ROOT}/prisma/schema.prisma`, 'utf8');

// parse schema: model -> Set(fields)
const models = {};
for (const m of schema.matchAll(/^model (\w+) \{([^}]*)\}/gm)) {
  models[m[1]] = new Set(
    [...m[2].matchAll(/^\s{2}(\w+)\s/gm)].map(x => x[1])
  );
}
// distinctive field for disambiguation = fields unique to few models
const fieldOwners = {};
for (const [m, fields] of Object.entries(models))
  for (const f of fields) (fieldOwners[f] ||= []).push(m);

const all = JSON.parse(fs.readFileSync(`${ROOT}/tsc-all.json`, 'utf8'));
const add = {}; // model -> {prop: count}
const bump = (model, prop) => { (add[model] ||= {}); add[model][prop] = (add[model][prop] || 0) + 1; };

const named = t =>
  t.match(/\(Without<(\w+?)(?:Update|Create|Unchecked\w*)Input/) ||
  t.match(/\b(\w+?)(?:WhereInput|WhereUniqueInput|Select|UpdateInput|CreateInput|UncheckedCreateInput|UncheckedUpdateInput|CountAggregateInputType|SumAggregateInputType|AvgAggregateInputType|MinAggregateInputType|MaxAggregateInputType|GroupByOutputType|ScalarWhereInput|OrderByWithRelationInput|OrderByRelationOrderByWithAggregationInput)\b/);

const samples = { TS2304: [], TS2305: [], TS2345: [], TS2322: [], TS2540: [], TS2741: [], TS2352: [], TS2339never: [], TS2339other: [], TS2554: [], TS2344: [], TS2307: [], TS2724: [], TS2571: [] };

for (const e of all) {
  const code = e.code;
  if (code === 'TS2304') { samples.TS2304.push(`${e.file}:${e.line}  ${e.msg.slice(0, 90)}`); continue; }
  if (code === 'TS2305') { samples.TS2305.push(`${e.file}:${e.line}  ${e.msg.slice(0, 110)}`); continue; }
  if (code === 'TS2307') { samples.TS2307.push(`${e.file}:${e.line}  ${e.msg.slice(0, 90)}`); continue; }
  if (['TS2345', 'TS2322', 'TS2540', 'TS2741', 'TS2352', 'TS2554', 'TS2344', 'TS2724'].includes(code)) {
    samples[code]?.push(`${e.file}:${e.line}  ${e.msg.slice(0, 130)}`);
    continue;
  }
  if (!code.startsWith('TS2339')) continue;
  let m = e.msg.match(/Property '([^']+)' does not exist on type '([^']+)'/) ||
          e.msg.match(/(?:and |but )?'([^']+)' does not exist in type '([^']+)'/);
  if (!m) continue;
  const prop = m[1];
  let tgt = m[2];
  if (/PrismaClient|TransactionClient/.test(tgt)) continue;
  if (tgt === 'never') { samples.TS2339never.push(`${e.file}:${e.line}  ${prop}  |  ${e.msg.slice(0, 120)}`); continue; }
  const nm = named(tgt);
  if (nm) { bump(nm[1], prop); continue; }
  // row-object type: match via field overlap
  if (tgt.startsWith('{')) {
    const seen = new Set();
    let best = null, bestScore = 0;
    for (const fm of tgt.matchAll(/(\w+)\s*:/g)) {
      const f = fm[1];
      if (seen.has(f)) continue; seen.add(f);
      for (const owner of fieldOwners[f] || []) {
        const score = seen.size; // later fields boost repeated owners
        if (!best || owner === best) { best = owner; bestScore++; break; }
      }
    }
    if (best) { bump(best, prop); continue; }
  }
  samples.TS2339other.push(`${e.file}:${e.line}  ${prop} on ${tgt.slice(0, 100)}`);
}

console.log('═══ ROUND-2 MODEL FIELD ADDITIONS ═══');
for (const [m, props] of Object.entries(add))
  console.log(`${m}: ${Object.entries(props).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p}(${c})`).join(', ')}`);
for (const [code, arr] of Object.entries(samples)) {
  if (!arr.length) continue;
  console.log(`\n═══ ${code} (${arr.length}) — samples ═══`);
  for (const s of [...new Set(arr)].slice(0, code === 'TS2304' ? 50 : 8)) console.log('  ' + s);
}
