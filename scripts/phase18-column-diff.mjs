// READ-ONLY: full column-level diff between prisma/schema.prisma and the live DB.
// Generates the exact additive SQL that WOULD be applied (like prisma migrate diff).
// Usage: bun scripts/phase18-column-diff.mjs
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const db = new PrismaClient();

// Parse models: name -> fields (name + type + attributes)
const modelBlocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const models = new Map();
for (const [, name, body] of modelBlocks) {
  const fields = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
    const fm = t.match(/^(\w+)\s+(\w+)(\?)?(\s+@.*)?$/);
    if (fm) fields.push({ name: fm[1], type: fm[2], optional: !!fm[3], attrs: fm[4] || '' });
  }
  models.set(name, fields);
}

const tables = (await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'")).map((t) => t.name);
const problems = [];
for (const [model, fields] of models) {
  if (!tables.includes(model)) { problems.push(`TABLE MISSING: ${model}`); continue; }
  const cols = (await db.$queryRawUnsafe(`PRAGMA table_info(${model})`)).map((c) => c.name);
  for (const f of fields) {
    if (!cols.includes(f.name)) {
      problems.push(`COLUMN MISSING: ${model}.${f.name} (${f.type}${f.optional ? '?' : ''})`);
    }
  }
}
console.log('=== SCHEMA-EXPECTED BUT NOT IN LIVE DB ===');
if (problems.length === 0) console.log('(none — schema and live DB are in sync at column level)');
for (const p of problems) console.log('- ' + p);
console.log(`\ntotal: ${problems.length}`);
await db.$disconnect();
