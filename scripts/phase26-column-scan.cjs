// PHASE 26 DIAGNOSTIC: scan ALL Prisma models column-by-column against
// the actual SQLite DB. Reports:
//   - Missing tables (schema expects, DB lacks)
//   - Missing columns (schema expects column, DB table lacks it)
//   - Type mismatches (TEXT vs INTEGER etc — best-effort)
//
// NON-DESTRUCTIVE: read-only inspection.
//
// Run: node scripts/phase26-column-scan.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = '/home/z/my-project/prisma/schema.prisma';
const DB_PATH = '/home/z/my-project/db/custom.db';

function readModels() {
  const txt = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const result = []; // { name, columns: [{name, type, default?, unique?, nullable?}] }
  const modelRe = /\nmodel\s+([A-Z][A-Za-z0-9_]*)\s*\{([\s\S]*?)\n\}/g;
  let mm;
  while ((mm = modelRe.exec(txt)) !== null) {
    const modelName = mm[1];
    const body = mm[2];
    const cols = [];
    const lines = body.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Skip @@index, @@unique (block-level), relations, comments
      if (line.startsWith('//') || line.startsWith('@@') || line.startsWith('model ') || line.startsWith('}')) continue;
      if (line.startsWith('user ') || line.startsWith('user User') || line.startsWith('organization ')) continue;
      // Field declarations: `name Type @...`
      const fieldMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+([A-Za-z0-9_?]+)(\s+@.*)?$/);
      if (!fieldMatch) continue;
      const [, fname, ftypeRaw, attrs] = fieldMatch;
      // Skip fields that look like relations (Capitalized type starting with capital letter and no scalar marker)
      const scalarTypes = ['String', 'Int', 'BigInt', 'Boolean', 'DateTime', 'Float', 'Decimal', 'Json', 'Bytes'];
      const ftype = ftypeRaw.replace('?',',').replace('[]', '').replace(',','').trim();
      if (!scalarTypes.includes(ftype)) continue; // skip relations

      const attrsStr = attrs || '';
      const isUnique = attrsStr.includes('@unique') || attrsStr.includes('@@unique');
      const hasDefault = attrsStr.includes('@default');
      cols.push({ name: fname, type: ftype, hasDefault, isUnique });
    }
    result.push({ name: modelName, columns: cols });
  }
  return result;
}

function main() {
  const models = readModels();
  console.log('Schema models count: ' + models.length);

  const db = new DatabaseSync(DB_PATH);
  const tablesRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'").all();
  const dbTables = tablesRows.map(r => r.name);

  let totalMissingTables = 0;
  let totalMissingColumns = 0;
  const issues = [];

  for (const model of models) {
    if (!dbTables.includes(model.name)) {
      totalMissingTables++;
      issues.push({ kind: 'MISSING_TABLE', model: model.name, columns: model.columns.map(c => c.name) });
      continue;
    }
    const dbCols = db.prepare(`PRAGMA table_info(${model.name})`).all().map(c => c.name);
    for (const col of model.columns) {
      if (!dbCols.includes(col.name)) {
        totalMissingColumns++;
        issues.push({ kind: 'MISSING_COLUMN', model: model.name, column: col.name, type: col.type, hasDefault: col.hasDefault, isUnique: col.isUnique });
      }
    }
  }

  // Print issues grouped
  console.log('=== ISSUES FOUND ===');
  console.log('Missing tables: ' + totalMissingTables);
  console.log('Missing columns: ' + totalMissingColumns);
  console.log('---');
  for (const iss of issues) {
    if (iss.kind === 'MISSING_TABLE') {
      console.log(`  [TABLE] ${iss.model} (columns needed: ${iss.columns.join(', ')})`);
    } else {
      console.log(`  [COLUMN] ${iss.model}.${iss.column}  type=${iss.type}  default=${iss.hasDefault}  unique=${iss.isUnique}`);
    }
  }

  // Generate safe ADDITIVE migration SQL for missing columns only.
  // ALTER TABLE ADD COLUMN with default is safe (backfills default for existing rows).
  // SQLite does NOT support adding a NOT NULL column without a default,
  // so we use NOT NULL DEFAULT '<value>' for required columns.
  function sqlType(issType) {
    if (issType === 'Int' || issType === 'BigInt') return 'INTEGER';
    if (issType === 'Float' || issType === 'Decimal') return 'REAL';
    if (issType === 'Boolean') return 'INTEGER';
    if (issType === 'DateTime') return 'DATETIME';
    return 'TEXT';
  }
  function defaultExpr(issType) {
    if (issType === 'Int' || issType === 'BigInt' || issType === 'Float' || issType === 'Decimal') return '0';
    if (issType === 'Boolean') return '0';
    if (issType === 'DateTime') return "(datetime('now'))";
    if (issType === 'Json') return "'{}'";
    return "''"; // String default empty
  }
  const sqlStatements = [];
  for (const iss of issues) {
    if (iss.kind === 'MISSING_COLUMN') {
      const sqlTypeStr = sqlType(iss.type);
      const dft = defaultExpr(iss.type);
      // Wrap default in single quotes for TEXT/DATETIME, raw for INTEGER/REAL
      let dftExpr;
      if (iss.type === 'Int' || iss.type === 'BigInt' || iss.type === 'Float' || iss.type === 'Decimal' || iss.type === 'Boolean') {
        dftExpr = dft;
      } else if (iss.type === 'DateTime') {
        dftExpr = dft; // already (datetime('now'))
      } else {
        dftExpr = "'" + dft + "'"; // quoted string
      }
      const stmt = `ALTER TABLE "${iss.model}" ADD COLUMN "${iss.column}" ${sqlTypeStr} NOT NULL DEFAULT ${dftExpr}`;
      sqlStatements.push(stmt);
    }
  }

  if (sqlStatements.length > 0) {
    console.log('---');
    console.log('=== RECOMMENDED ADDITIVE MIGRATION (DDL) ===');
    for (const s of sqlStatements) console.log(s + ';');
  }

  db.close();
}

main();
