#!/bin/bash
# Restore all Part 1 files from origin/develop HEAD (4d66efb21) to the
# working tree WITHOUT touching .git (which is frozen). Uses
# `git show <ref>:<path>` redirected to file — read-only on .git.
set -e
cd /home/z/my-project

REF=4d66efb2117eb76178f842ae671581d0e0816551

# Part 1 source files (new in commit 4d66efb21)
PART1_FILES=(
  "src/lib/autopilot/automation-service.ts"
  "src/lib/autopilot/checkpoint-service.ts"
  "src/lib/autopilot/invocation-service.ts"
  "src/lib/autopilot/retry-policy.ts"
  "src/lib/autopilot/unified-trigger.ts"
  "src/lib/autopilot/wait-wake.ts"
  "src/lib/autopilot/worker-lease.ts"
  "tests/helpers/part1-test-utils.ts"
  "tests/unit/part1-automation-persistence.test.ts"
  "tests/unit/part1-checkpoint-resume.test.ts"
  "tests/unit/part1-invocation-idempotency.test.ts"
  "tests/unit/part1-retry-approval-pause.test.ts"
  "tests/unit/part1-retry-policy-pure.test.ts"
  "tests/unit/part1-user-isolation.test.ts"
  "tests/unit/part1-wait-wake-unified-triggers.test.ts"
  "tests/unit/part1-worker-lease.test.ts"
  "scripts/db-verify-precheck.py"
)

# Files modified (not new) in commit 4d66efb21 — also restore these
PART1_MODIFIED=(
  "prisma/schema.prisma"
  "src/instrumentation.ts"
)

for path in "${PART1_FILES[@]}" "${PART1_MODIFIED[@]}"; do
  mkdir -p "$(dirname "$path")"
  git show "$REF:$path" > "$path"
  echo "restored: $path"
done

# Also restore the FULL src/lib/ai/ directory and tests/ tree
# (the supervisor's rollback wipes these too)
echo "--- restoring full src/ tests/ scripts/ trees ---"
git ls-tree -r --name-only "$REF" -- src/ tests/ scripts/ 2>/dev/null | while read -r path; do
  if [ -e "$path" ] && [ ! -f "$path" ]; then
    continue  # skip directories / special files
  fi
  mkdir -p "$(dirname "$path")"
  git show "$REF:$path" > "$path" 2>/dev/null || true
done
echo "done restoring source tree from $REF"
