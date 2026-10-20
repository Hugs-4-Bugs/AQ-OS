#!/usr/bin/env bash
# scripts/verify-final-tar.sh
# Byte-level verification of download/AQ-OS-current-workspace.tar.gz
# against the CURRENT workspace. Read-only on the workspace: extracts to a
# temp dir, diffs the full tree, removes the temp dir. No app modification.
set -u
WS=/home/z/my-project
TAR=$WS/download/AQ-OS-current-workspace.tar.gz
TMP=$WS/.verify-tmp

echo "== [1/6] gzip integrity (full stream read)"
if gzip -t "$TAR"; then echo "   OK"; else echo "   FAIL"; exit 1; fi

echo "== [2/6] listing counts"
ALL=$(tar -tzf "$TAR" | wc -l)
FILES=$(tar -tzf "$TAR" | grep -vc '/$')
echo "   tar entries=$ALL  regular files=$FILES"

echo "== [3/6] required paths present in tar"
MISS=0
for p in ./AGENTS.md ./ACQUISITIONOS_CURRENT_STATE.md ./ACQUISITIONOS_CODEBASE_MANIFEST.json \
         ./package.json ./prisma/schema.prisma ./db/custom.db ./.env \
         ./src/lib/phone.ts ./src/app/api/workflows/ai-generate/route.ts \
         ./src/lib/lead-discovery-service.ts ./src/components/dashboard/discover-tab.tsx \
         ./Dockerfile ./docker-compose.prod.yml ./vercel.json ./backend/app/main.py \
         ./src/lib/entitlement-service.ts ./src/lib/workflow-engine.ts; do
  if tar -tzf "$TAR" "$p" >/dev/null 2>&1; then echo "   OK      $p"; else echo "   MISSING $p"; MISS=$((MISS+1)); fi
done
echo "   missing=$MISS"

echo "== [4/6] extract to temp dir"
rm -rf "$TMP"; mkdir -p "$TMP"
if tar -xzf "$TAR" -C "$TMP"; then echo "   extracted OK"; else echo "   EXTRACT FAIL"; rm -rf "$TMP"; exit 1; fi

echo "== [5/6] full-tree byte diff (workspace vs extracted)"
# Excludes: dirs that legitimately drift or are non-source:
#   node_modules/.git/.next = reproducible, not in archive
#   download                = delivery folder (tar holds its 03:03 snapshot)
#   .verify-tmp             = this verification temp dir
DIFFOUT=$(diff -rq --exclude=node_modules --exclude=.git --exclude=.next \
               --exclude=download --exclude=.verify-tmp "$WS" "$TMP" 2>&1)
if [ -z "$DIFFOUT" ]; then
  echo "   TREE-DIFF: CLEAN (every archived file byte-identical to workspace)"
else
  echo "   TREE-DIFF LINES (inspect below):"
  echo "$DIFFOUT"
fi

echo "== [6/6] cleanup + fingerprint"
rm -rf "$TMP"
echo "   temp removed: $([ -d "$TMP" ] && echo NO || echo YES)"
echo "--- SHA256 ---"
sha256sum "$TAR"
echo "--- exact bytes ---"
stat -c '%s' "$TAR"
echo "--- file count ---"
echo "$FILES"
