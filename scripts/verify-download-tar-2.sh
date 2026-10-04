#!/usr/bin/env bash
# scripts/verify-download-tar-2.sh
# Full verification of the single-file workspace archive against the
# CURRENT LIVE WORKSPACE. Read-only on the workspace: extracts to a temp
# dir, diffs the full tree, removes the temp dir. No app modification.
#
# Usage: bash scripts/verify-download-tar-2.sh <path-to-archive.tar.gz>
set -u
WS=/home/z/my-project
TAR=${1:?usage: verify-download-tar-2.sh <archive.tar.gz>}
TMP=$WS/.verify-tmp

# Baseline of the latest implementation session (audit AUDIT-IMPLEMENT-1,
# committed 51fdcff + 153758b). Every file changed by that session MUST be
# inside the archive.
BASE=f0ee0a2f222b18b2b544b5192ba16746597f21c0

echo "== [0/7] target"
echo "   $TAR"
[ -f "$TAR" ] || { echo "   MISSING"; exit 1; }

echo "== [1/7] gzip integrity (full stream read)"
if gzip -t "$TAR"; then echo "   OK"; else echo "   FAIL"; exit 1; fi

rm -rf "$TMP"; mkdir -p "$TMP"

echo "== [2/7] listing counts"
tar -tzf "$TAR" > "$TMP/listing.txt"
ALL=$(wc -l < "$TMP/listing.txt")
FILES=$(grep -vc '/$' "$TMP/listing.txt")
echo "   tar entries=$ALL  regular files=$FILES"

echo "== [3/7] required paths present"
MISS=0
for p in \
  ./AGENTS.md ./ACQUISITIONOS_CURRENT_STATE.md ./ACQUISITIONOS_CODEBASE_MANIFEST.json \
  ./package.json ./package-lock.json ./prisma/schema.prisma \
  ./db/custom.db ./.env ./Dockerfile ./docker-compose.prod.yml ./vercel.json \
  ./backend/app/main.py \
  ./src/lib/phone.ts ./src/lib/lead-discovery-service.ts \
  ./src/lib/entitlement-service.ts ./src/lib/workflow-engine.ts \
  ./src/lib/credit-service.ts ./src/lib/personal-context.ts \
  ./src/components/dashboard/discover-tab.tsx ./src/components/dashboard/settings-shell.tsx \
  ./src/app/api/workflows/ai-generate/route.ts \
  './src/app/api/business-profiles/[id]/route.ts' \
  ./src/app/api/business-profiles/route.ts \
  ./src/app/api/cron/workflow-scheduler/route.ts \
  ./src/lib/assistant-conversation-store.ts ./src/lib/discovery-resume.ts \
  ./src/components/dashboard/business-profile-settings.tsx \
  ./tests/unit/workflow-schedule-timezone.test.ts \
  ./tests/integration/business-profiles.test.ts ; do
  if grep -qF -- "$p" "$TMP/listing.txt"; then echo "   OK      $p"; else echo "   MISSING $p"; MISS=$((MISS+1)); fi
done
echo "   missing=$MISS"

echo "== [4/7] latest-session changed files (git $BASE..HEAD) present"
CHG=$(git -C "$WS" diff --name-status "$BASE"..HEAD | awk '$1!="D"{print $2}')
CNT=0; CMISS=0; CNT_OK=0
for f in $CHG; do
  CNT=$((CNT+1))
  if grep -qF -- "./$f" "$TMP/listing.txt"; then CNT_OK=$((CNT_OK+1)); else echo "   MISSING $f"; CMISS=$((CMISS+1)); fi
done
echo "   checked=$CNT  missing=$CMISS"

echo "== [5/7] extract to temp dir"
mkdir -p "$TMP/root"
if tar -xzf "$TAR" -C "$TMP/root"; then echo "   extracted OK"; else echo "   EXTRACT FAIL"; rm -rf "$TMP"; exit 1; fi

echo "== [6/7] full-tree byte diff (workspace vs extracted)"
# Excludes: node_modules/.git/.next (reproducible, not in archive),
# .verify-tmp (this temp dir), and the archive artifacts themselves
# (they are delivery outputs, not source).
DIFFOUT=$(diff -rq --exclude=node_modules --exclude=.git --exclude=.next \
               --exclude=.verify-tmp \
               --exclude=AQ-OS-current-workspace.tar.gz \
               --exclude=.tmp-AQ-OS-package.tar.gz \
               "$WS" "$TMP/root" 2>&1)
if [ -z "$DIFFOUT" ]; then
  echo "   TREE-DIFF: CLEAN (every archived file byte-identical to workspace)"
else
  echo "   TREE-DIFF LINES (inspect below):"
  echo "$DIFFOUT"
fi

echo "== [7/7] cleanup + fingerprint"
rm -rf "$TMP"
echo "   temp removed: $([ -d "$TMP" ] && echo NO || echo YES)"
echo "--- SHA256 ---"
sha256sum "$TAR"
echo "--- exact bytes ---"
stat -c '%s' "$TAR"
echo "--- file count ---"
echo "$FILES"
