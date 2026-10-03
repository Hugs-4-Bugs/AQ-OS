// Repair: re-position the codemod-inserted checkPlanEntitlement import so it
// sits AFTER the last complete top-of-file import statement (the first pass
// could land inside a multi-line `import { ... }` block).
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const IMPORT_LINE = "import { checkPlanEntitlement } from '@/lib/entitlement-middleware';";

const files = execSync('git diff --name-only', { encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f.startsWith('src/app/api/') && f.endsWith('route.ts'));

let fixed = 0;
const problems = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idx = lines.indexOf(IMPORT_LINE);
  if (idx === -1) continue; // no inserted import (hand-edited files)

  // Remove the inserted line first.
  lines.splice(idx, 1);

  // Find the end of the last complete import statement in the header.
  let lastImportEnd = -1;
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    if (/^import[\s{]/.test(lines[i]) || /^import /.test(lines[i])) {
      // Walk to the end of this (possibly multi-line) import statement.
      let j = i;
      while (j < lines.length && !/;\s*$/.test(lines[j])) j++;
      if (j < lines.length) {
        lastImportEnd = j;
        i = j; // continue scanning after this statement
      }
    }
  }

  if (lastImportEnd === -1) {
    problems.push(`${file}: no complete import statement found`);
    // Restore original position to avoid losing the import.
    lines.splice(idx, 0, IMPORT_LINE);
    fs.writeFileSync(file, lines.join('\n'));
    continue;
  }

  lines.splice(lastImportEnd + 1, 0, IMPORT_LINE);
  fs.writeFileSync(file, lines.join('\n'));
  fixed++;

  // Sanity: previous non-blank line must terminate a statement or be a comment.
  const out = fs.readFileSync(file, 'utf8').split('\n');
  const pos = out.indexOf(IMPORT_LINE);
  let prev = pos - 1;
  while (prev >= 0 && out[prev].trim() === '') prev--;
  if (prev >= 0 && !/;\s*$/.test(out[prev]) && !/^[ \t]*(\/\/|\/\*|\*)/.test(out[prev])) {
    problems.push(`${file}: import still not after a statement terminator -> "${out[prev]}"`);
  }
}

console.log(`repositioned imports: ${fixed}`);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL IMPORTS VALID');
