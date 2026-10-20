#!/bin/bash
# =============================================================================
# PHASE 0 — Build ONE clean squashed checkpoint commit on top of origin/main.
# SAFETY DESIGN:
#   - Uses a TEMPORARY index (.git/phase0-checkpoint-index) — the real index
#     and the working tree are NEVER touched.
#   - Local branch `main` is never modified (no reset, no checkout, no rebase).
#   - The checkpoint commit is created via plumbing (write-tree + commit-tree)
#     with parent = origin/main, and stored on a NEW side branch only.
#   - No push is performed by this script.
# =============================================================================
set -euo pipefail
cd /home/z/my-project

ORIGIN_MAIN=$(git rev-parse origin/main)
HEAD_BEFORE=$(git rev-parse HEAD)
echo "[prereq] HEAD            = $HEAD_BEFORE"
echo "[prereq] origin/main     = $ORIGIN_MAIN"
echo "[prereq] real-index status digest (before) = $(git status --porcelain | sha256sum | cut -c1-16)"

BRANCH=checkpoint/github-clean-20261020
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "[abort] side branch $BRANCH already exists"; exit 1; fi
if [ -z "$ORIGIN_MAIN" ]; then echo "[abort] no origin/main"; exit 1; fi

TMPIDX=".git/phase0-checkpoint-index"
rm -f "$TMPIDX"
mkdir -p scripts/tmp
export GIT_INDEX_FILE="$PWD/$TMPIDX"

# ---------------------------------------------------------------------------
# 1) Start temp index from CURRENT HEAD tree (current tracked state)
# ---------------------------------------------------------------------------
git read-tree HEAD
echo "[1] temp index seeded from HEAD ($(git ls-files | wc -l) entries)"

# ---------------------------------------------------------------------------
# 2) Remove excluded paths FROM TEMP INDEX ONLY (--cached: no disk changes)
# ---------------------------------------------------------------------------
# generated dependency artifacts + build cache
git rm -r -q --cached -- node_modules .next
# live/dev databases (CODE-ONLY rule) + DB backups (user data)
git rm -r -q --cached -- db-backups
git rm -q --cached -- db/custom.db prisma/db/custom.db backend/test.db
# secret-shaped environment template
git rm -q --cached -- 'upload/env.example (ACQUISITION-OS Latest)'
# tracked runtime logs (temporary runtime artifacts)
git rm -q --cached -- backend.log build-prod.log dev-restart.log dev-watchdog.log \
                      dev.log realtime.log scripts/dev-server.log tsc-app.log \
                      tsc-components.log tsc-lib.log vitest-full.log
# python bytecode caches (all __pycache__ dirs, robust to nesting/spaces)
git ls-files -z | grep -z '__pycache__' | xargs -0 --no-run-if-empty git rm -q --cached --
# runtime tool-output dumps
git rm -r -q --cached -- tool-results
echo "[2] exclusions applied ($(git ls-files | wc -l) entries remain)"

# ---------------------------------------------------------------------------
# 3) Add the Phase 0 verification scripts (legit project scripts)
# ---------------------------------------------------------------------------
git add -- scripts/phase0-secret-scan.cjs \
            scripts/phase0-verify-false-positives.cjs \
            scripts/phase0-create-checkpoint.sh
echo "[3] phase0 scripts added ($(git ls-files | wc -l) entries)"

# ---------------------------------------------------------------------------
# 4) Write tree
# ---------------------------------------------------------------------------
TREE=$(git write-tree)
echo "[4] tree written: $TREE"

# ---------------------------------------------------------------------------
# 5) VERIFICATIONS on the staged manifest (before committing)
# ---------------------------------------------------------------------------
FAIL=0
# 5a. forbidden paths absent
for pat in '^(|.*/)\.env$' '^node_modules/' '^\.next/' '^db-backups/' '^db/custom\.db$' '^prisma/db/custom\.db$' '^backend/test\.db$' '^tool-results/' '__pycache__' '\.log$'; do
  n=$(git ls-files | grep -cE "$pat" || true)
  [ "$n" -eq 0 ] || { echo "[VERIFY-FAIL] pattern $pat matched $n staged files"; FAIL=1; }
done
n=$(git ls-files | grep -cF 'upload/env.example (ACQUISITION-OS Latest)' || true)
[ "$n" -eq 0 ] || { echo "[VERIFY-FAIL] upload env template still staged"; FAIL=1; }

# 5b. Prisma migrations present (incl. profile persistence migration)
git ls-files prisma/migrations/ | sort
echo "[verify] profile migration staged: $(git ls-files prisma/migrations/ | grep -c '20261020000000_profile_sections_persistence') (expect 1)"
echo "[verify] settings-shell.tsx staged: $(git ls-files src/components/dashboard/settings-shell.tsx | wc -l) (expect 1)"
echo "[verify] .gitignore staged: $(git ls-files .gitignore | wc -l) (expect 1)"
echo "[verify] prisma/schema.prisma staged: $(git ls-files prisma/schema.prisma | wc -l) (expect 1)"
echo "[verify] src/ files staged: $(git ls-files src/ | wc -l)"
echo "[verify] scripts/ files staged: $(git ls-files scripts/ | wc -l)"
echo "[verify] .env not staged: $(git ls-files | grep -cx '.env' || echo 0) (expect 0)"

# 5c. no blob >= 100 MiB (and list any >= 50 MiB)
MAXBLOB=$(git ls-tree -r -l "$TREE" | awk -F'\t' '{split($1,a," "); if (a[4]+0 > m) m = a[4]+0} END {print m+0}')
echo "[verify] max blob size = $MAXBLOB bytes ($(( MAXBLOB / 1048576 )) MiB) — limit 104857600"
[ "$MAXBLOB" -lt 104857600 ] || { echo "[VERIFY-FAIL] blob >= 100 MiB staged"; FAIL=1; }
echo "[verify] blobs >= 50 MiB in checkpoint tree:"
git ls-tree -r -l "$TREE" | awk -F'\t' '{split($1,a," "); if (a[4]+0 > 52428800) printf "         %.1f MiB  %s\n", a[4]/1048576, $2}'
echo "        (end of >=50MiB list)"

# 5d. diff vs HEAD: deletions must ALL be in exclusion categories; additions = 3 scripts
git diff-tree -r --name-status --no-renames HEAD "$TREE" > scripts/tmp/phase0-diff-vs-head.txt
DIFFFILE=scripts/tmp/phase0-diff-vs-head.txt
DELETED=$(grep -c '^D' "$DIFFFILE" || true)
ADDED=$(grep -c '^A' "$DIFFFILE" || true)
MODIFIED=$(grep -c '^M' "$DIFFFILE" || true)
echo "[verify] checkpoint-vs-HEAD: D=$DELETED A=$ADDED M=$MODIFIED (expect D=82019+36+23.., A=3, M=0)"
echo "$MODIFIED" | grep -qx '0' || { echo "[VERIFY-FAIL] unexpected modifications vs HEAD: $MODIFIED"; FAIL=1; }
# every deleted path must belong to an exclusion category
BAD_DEL=$(grep '^D' "$DIFFFILE" | cut -f2 | grep -vE '^(node_modules/|\.next/|db-backups/|tool-results/)|__pycache__/|^(db/custom\.db|prisma/db/custom\.db|backend/test\.db|backend\.log|build-prod\.log|dev-restart\.log|dev-watchdog\.log|dev\.log|realtime\.log|scripts/dev-server\.log|tsc-app\.log|tsc-components\.log|tsc-lib\.log|vitest-full\.log|upload/env\.example \(ACQUISITION-OS Latest\))$' || true)
[ -z "$BAD_DEL" ] || { echo "[VERIFY-FAIL] deletion outside exclusion categories:"; echo "$BAD_DEL" | head -20; FAIL=1; }
# additions must be exactly the 3 phase0 scripts
BAD_ADD=$(grep '^A' "$DIFFFILE" | cut -f2 | grep -vE '^scripts/phase0-(secret-scan|verify-false-positives|create-checkpoint)\.(cjs|sh)$' || true)
[ -z "$BAD_ADD" ] || { echo "[VERIFY-FAIL] unexpected additions:"; echo "$BAD_ADD"; FAIL=1; }

[ "$FAIL" -eq 0 ] || { echo "[abort] verification failed — NO commit created"; exit 2; }
echo "[5] ALL VERIFICATIONS PASSED"

# ---------------------------------------------------------------------------
# 6) Create THE single checkpoint commit (parent = origin/main only)
# ---------------------------------------------------------------------------
STAGED_COUNT=$(git ls-files | wc -l)
COMMIT=$(git commit-tree "$TREE" -p "$ORIGIN_MAIN" -F - <<MSG
checkpoint: clean publishable checkpoint of current application state (Phase 0)

Single forward-only squashed checkpoint on top of origin/main (${ORIGIN_MAIN:0:9}).
Tree = current application source, configuration, documentation, migrations,
scripts and legitimate project files, excluding:

- node_modules/            (generated dependency artifacts; incl. blobs >100MiB)
- .next/                   (build cache)
- db/custom.db, prisma/db/custom.db, backend/test.db   (live/dev databases)
- db-backups/              (database backups containing user data)
- upload/env.example (ACQUISITION-OS Latest)  (secret-shaped env template)
- *.log runtime logs, backend __pycache__, tool-results/ (runtime artifacts)

Staged files: ${STAGED_COUNT}
Max blob: ${MAXBLOB} bytes (< 100 MiB hard limit)
Secrets verified absent: no .env staged; no live credential values; no
private keys / token formats. Local history untouched; .env untracked+ignored.

Phase 0 of staged recovery plan. No push performed by build script.
MSG
)
echo "[6] checkpoint commit: $COMMIT (parent $ORIGIN_MAIN)"

# ---------------------------------------------------------------------------
# 7) Preserve on a NEW side branch (forward-only; main untouched)
# ---------------------------------------------------------------------------
unset GIT_INDEX_FILE
git update-ref "refs/heads/$BRANCH" "$COMMIT"
rm -f "$TMPIDX"

echo "[7] side branch $BRANCH -> $COMMIT"
echo "[post] local main still: $(git rev-parse main) (unchanged: $([ "$(git rev-parse main)" = "$HEAD_BEFORE" ] && echo YES || echo NO))"
echo "[post] real-index status digest (after) = $(git status --porcelain | sha256sum | cut -c1-16)"
echo "[post] staged file count = $STAGED_COUNT"
echo "[post] manifest written: scripts/tmp/phase0-checkpoint-manifest.txt"
git ls-tree -r --name-only "$COMMIT" > scripts/tmp/phase0-checkpoint-manifest.txt
echo "DONE. Checkpoint SHA: $COMMIT"
