#!/usr/bin/env node
/* Extract (a) fields used on missing Prisma models from source code,
   (b) missing fields on existing models from tsc error messages. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/z/my-project';
const MISSING_MODELS = ['acquisitionCampaign','report','competitorSnapshot','messageTemplate',
  'analyticsPrediction','analyticsInsight','analyticsAnomaly','dashboardShare','analyticsFormula',
  'ragDocument','analyticsBenchmark','analyticsSnapshot'];

// ── (a) fields used per missing model ─────────────────────────────
function extractBalanced(src, startIdx) {
  // src[startIdx] === '{' — return the object literal text
  let depth = 0, i = startIdx, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') inStr = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return src.slice(startIdx, startIdx + 4000);
}

function topKeys(objText) {
  // collect top-level property keys of an object literal (rough but effective)
  const keys = new Set();
  let depth = 0, inStr = null, esc = false, buf = '';
  for (const c of objText) {
    if (esc) { buf += c; esc = false; continue; }
    if (inStr) { buf += c; if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; buf += c; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; buf = ''; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; buf = ''; continue; }
    if (depth === 1 && c === ':') { const k = buf.trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) keys.add(k); buf = ''; continue; }
    if (depth === 1 && (c === ',')) { buf = ''; continue; }
    buf += c;
  }
  return [...keys];
}

const FIELD_OPS = ['findFirst','findMany','findUnique','create','update','upsert','delete','count','aggregate','groupBy'];
const modelFields = {};
for (const model of MISSING_MODELS) {
  const info = { usages: 0, fields: new Set(), orderBySeen: new Set() };
  let out;
  try { out = execSync(`rg -l "db\\.${model}\\.|tx\\.${model}\\." ${ROOT}/src --glob '*.ts' --glob '*.tsx'`, {encoding:'utf8'}); } catch { out=''; }
  const files = out.split('\n').filter(Boolean);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const re = new RegExp(`\\b(?:db|tx)\\.${model}\\.(?:${FIELD_OPS.join('|')})\\s*(?:<[^>]*>)?\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      info.usages++;
      // find first '{' after the '('
      let j = src.indexOf('{', m.index + m[0].length - 1);
      if (j === -1) continue;
      const obj = extractBalanced(src, j);
      // top-level keys of the call arg
      for (const k of topKeys(obj)) {
        if (['where','data','select','include','orderBy','take','skip','distinct','update','create'].includes(k)) {
          // descend one level into that key's object
          const kv = obj.indexOf(k, 1);
          if (kv === -1) continue;
          const brace = obj.indexOf('{', kv);
          if (brace === -1) continue;
          const inner = extractBalanced(obj, brace);
          if (k === 'select' || k === 'include') {
            for (const kk of topKeys(inner)) if (kk !== '...') info.fields.add(kk + ' (sel)');
          } else {
            for (const kk of topKeys(inner)) info.fields.add(kk);
          }
        }
      }
    }
  }
  modelFields[model] = { usages: info.usages, fields: [...info.fields] };
}

// ── (b) missing fields on existing models from errors ─────────────
const all = JSON.parse(fs.readFileSync(`${ROOT}/tsc-all.json`, 'utf8'));
const modelOf = t => {
  let m = t.match(/\(Without<(\w+?)(?:Update|Create|Unchecked\w*)Input/) || t.match(/\b(\w+?)(?:WhereInput|Select|UpdateInput|CreateInput|UncheckedCreateInput|UncheckedUpdateInput|GroupByOutputType|CountAggregateInputType|SumAggregateInputType|AvgAggregateInputType|MinAggregateInputType|MaxAggregateInputType|OrderByRelationOrderByWithAggregationInput|OrderByWithRelationInput|ScalarWhereInput)\b/);
  return m ? (m[1] || m[0]) : null;
};
const missingByModel = {};
for (const e of all) {
  if (!['TS2339','TS2353','TS2561','TS2551'].includes(e.code)) continue;
  let m = e.msg.match(/Property '([^']+)' does not exist on type '([^']+)'/)
       || e.msg.match(/(?:and |but )?'([^']+)' does not exist in type '([^']+)'/);
  if (!m) continue;
  const prop = m[1], tgt = m[2];
  if (/PrismaClient|TransactionClient/.test(tgt)) continue; // model-level, handled above
  const model = modelOf(tgt);
  if (!model || model === 'never') continue;
  (missingByModel[model] ||= {})[prop] ||= `${e.file}:${e.line}`;
}

console.log('════════ MISSING MODELS: field usage from source ════════');
for (const [m, info] of Object.entries(modelFields)) {
  console.log(`\n## ${m}  (call sites: ${info.usages})`);
  console.log(info.fields.length ? '  ' + info.fields.join(', ') : '  (no call-site fields found — inspect manually)');
}
console.log('\n════════ MISSING FIELDS on EXISTING models (from errors) ════════');
for (const [m, props] of Object.entries(missingByModel)) {
  console.log(`\n## ${m}: ${Object.keys(props).join(', ')}`);
}
fs.writeFileSync(`${ROOT}/schema-gap-report.json`, JSON.stringify({ modelFields, missingByModel }, null, 1));
console.log('\nsaved -> schema-gap-report.json');
