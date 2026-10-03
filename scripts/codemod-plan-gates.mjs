// Codemod: insert a plan-entitlement gate at the top of every withAuth
// handler in the automation API surface (Plan Eligibility Correction).
//
// For every `return withAuth(request, async (user...) => { try {` in the
// target files this inserts, at the same indentation as `try`:
//   const gate = await checkPlanEntitlement(user.id, user.plan, '<FEATURE>');
//   if (!gate.allowed) return gate.response!;
// and adds the checkPlanEntitlement import after the last top-of-file import.
//
// Idempotent: skips a file/gate when the exact gate line already exists.
// Special cases (withDualAuth routes, webhooks, campaign/parse, meetings
// settings field gate) are handled by hand OUTSIDE this script.
import fs from 'node:fs';

const WORKFLOW_ACCESS = 'workflow_access';
const OUTREACH_SEQUENCES = 'outreach_sequences';

const targets = [
  // workflows/*
  'src/app/api/workflows/[id]/route.ts',
  'src/app/api/workflows/[id]/pause/route.ts',
  'src/app/api/workflows/[id]/resume/route.ts',
  'src/app/api/workflows/[id]/cancel/route.ts',
  'src/app/api/workflows/[id]/duplicate/route.ts',
  'src/app/api/workflows/[id]/execute/route.ts',
  'src/app/api/workflows/ai-generate/route.ts',
  'src/app/api/workflows/trigger/route.ts',
  'src/app/api/workflows/validate/route.ts',
  'src/app/api/workflows/templates/route.ts',
  'src/app/api/workflows/metrics/route.ts',
  'src/app/api/workflows/metrics/timeline/route.ts',
  'src/app/api/workflows/logs/route.ts',
  'src/app/api/workflows/executions/route.ts',
  'src/app/api/workflows/executions/[executionId]/route.ts',
  'src/app/api/workflows/executions/[executionId]/cancel/route.ts',
  'src/app/api/workflows/executions/[executionId]/logs/route.ts',
  'src/app/api/workflows/executions/[executionId]/pause/route.ts',
  'src/app/api/workflows/executions/[executionId]/replay/route.ts',
  'src/app/api/workflows/executions/[executionId]/resume/route.ts',
  'src/app/api/workflows/executions/[executionId]/retry/route.ts',
  'src/app/api/workflows/dead-letter/route.ts',
  'src/app/api/workflows/dead-letter/[executionId]/route.ts',
  // autonomous/*
  'src/app/api/autonomous/campaign/route.ts',
  'src/app/api/autonomous/campaign/list/route.ts',
  'src/app/api/autonomous/campaign/[campaignId]/route.ts',
  'src/app/api/autonomous/classify-reply/route.ts',
  'src/app/api/autonomous/pipeline/move/route.ts',
  'src/app/api/autonomous/research/route.ts',
  'src/app/api/autonomous/send-outreach/route.ts',
  // autonomous-outreach/*
  'src/app/api/autonomous-outreach/dispatch/route.ts',
  'src/app/api/autonomous-outreach/generate/route.ts',
  // outreach autonomous surfaces
  'src/app/api/outreach/autonomous/route.ts',
  'src/app/api/outreach/autonomy-status/route.ts',
  'src/app/api/outreach/batch/route.ts',
  // sdr + meetings autonomy settings
  'src/app/api/sdr/route.ts',
  'src/app/api/settings/autonomy-mode/route.ts',
].map((f) => ({ file: f, feature: WORKFLOW_ACCESS }));

// Sequence automation endpoints — gated by the existing outreach_sequences
// entitlement (pro/elite only per ENTITLEMENTS).
for (const f of [
  'src/app/api/outreach/enroll/route.ts',
  'src/app/api/outreach/execute/route.ts',
]) {
  targets.push({ file: f, feature: OUTREACH_SEQUENCES });
}

const IMPORT_LINE = "import { checkPlanEntitlement } from '@/lib/entitlement-middleware';";
const HANDLER_RE = /(return withAuth\(request, async \(user[^)]*\) => \{\n)([ \t]*)(try \{\n)/g;

let totalGates = 0;
const report = [];

for (const { file, feature } of targets) {
  if (!fs.existsSync(file)) {
    report.push(`MISSING  ${file}`);
    continue;
  }
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  const gateProbe = `checkPlanEntitlement(user.id, user.plan, '${feature}')`;

  // 1) Import after the last top-of-file import line.
  if (!src.includes("@/lib/entitlement-middleware")) {
    const lines = src.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import /.test(lines[i])) lastImport = i;
      else if (lastImport >= 0 && lines[i].trim() !== '' && !/^import /.test(lines[i]) && i > 0 && !lines[i].startsWith('import')) {
        // stop scanning after the import block ends (blank lines allowed)
        if (lines[i].trim() !== '') break;
      }
    }
    if (lastImport === -1) {
      report.push(`NOIMPORT ${file}`);
      continue;
    }
    lines.splice(lastImport + 1, 0, IMPORT_LINE);
    src = lines.join('\n');
  }

  // 2) Gate after every withAuth handler opening (idempotent).
  if (!src.includes(gateProbe)) {
    src = src.replace(HANDLER_RE, (m, head, indent, tryLine) => {
      return (
        head +
        `${indent}const gate = await checkPlanEntitlement(user.id, user.plan, '${feature}');\n` +
        `${indent}if (!gate.allowed) return gate.response!;\n` +
        indent +
        tryLine
      );
    });
  }

  if (src !== before) {
    fs.writeFileSync(file, src);
    const count = (src.match(/checkPlanEntitlement\(user\.id, user\.plan/g) || []).length;
    totalGates += count;
    report.push(`OK(${count})   ${file}`);
  } else {
    report.push(`SKIP     ${file}`);
  }
}

console.log(report.join('\n'));
console.log(`TOTAL gates now present across targets: ${totalGates}`);

// Coverage check: withAuth handlers still without a gate in target files.
const missed = [];
for (const { file } of targets) {
  const src = fs.readFileSync(file, 'utf8');
  const handlers = (src.match(/return withAuth\(request, async \(user/g) || []).length;
  const gates = (src.match(/checkPlanEntitlement\(user\.id, user\.plan/g) || []).length;
  if (handlers > gates) missed.push(`${file}: ${handlers} handlers / ${gates} gates`);
}
console.log(missed.length ? 'COVERAGE GAPS:\n' + missed.join('\n') : 'COVERAGE COMPLETE');
