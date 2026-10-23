// READ-ONLY: full diff of Prisma schema models vs live DB tables.
// Usage: bun scripts/phase18-schema-diff.mjs
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const modelRe = /^model\s+(\w+)\s*\{/gm;
const models = [];
let m;
while ((m = modelRe.exec(schema)) !== null) models.push(m[1]);

// Prisma model name -> expected SQLite table name = exactly the model name (no @@map in this repo for most; collect @@map too)
const mapRe = /^model\s+(\w+)\s*\{[^}]*?@@map\("([^"]+)"\)/gms;
const mapped = new Map();
while ((m = mapRe.exec(schema)) !== null) mapped.set(m[1], m[2]);

const db = new PrismaClient();
const tables = (await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((t) => t.name);

console.log(`schema models: ${models.length}, live tables: ${tables.length}\n`);
const missing = [];
const present = [];
for (const model of models) {
  const table = mapped.get(model) || model;
  if (tables.includes(table)) present.push(model);
  else missing.push(`${model} (table ${table})`);
}
console.log('=== MODELS MISSING FROM LIVE DB ===');
for (const x of missing) console.log('- ' + x);
console.log(`\n(${missing.length} missing, ${present.length} present)`);

// Also reverse: live tables not in schema (informational, first 20)
const schemaTables = new Set(models.map((mm) => mapped.get(mm) || mm));
const extra = tables.filter((t) => !schemaTables.has(t) && !t.startsWith('sqlite_') && t !== '_prisma_migrations');
console.log(`\n=== LIVE TABLES NOT IN SCHEMA (${extra.length}) ===`);
for (const t of extra.slice(0, 25)) console.log('- ' + t);
await db.$disconnect();
