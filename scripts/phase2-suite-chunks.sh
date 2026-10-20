#!/bin/bash
# Phase 2 full-suite chunked regression runner — memory-safe sequential batches.
# Each vitest run is bounded (≤12 files); results aggregated to /tmp/phase2-suite-summary.txt
cd /home/z/my-project
OUT=/home/z/my-project/.test-tmp/suite-chunks.log
: > "$OUT"
FILES=$(find src tests -name "*.test.ts" -o -name "*.test.tsx" | sort)
TOTAL=$(echo "$FILES" | wc -l)
echo "[chunks] total test files: $TOTAL" | tee -a "$OUT"

BATCH=()
BATCHES=()
for f in $FILES; do
  BATCH+=("$f")
  if [ ${#BATCH[@]} -ge 10 ]; then BATCHES+=("$(IFS=$'\n'; echo "${BATCH[*]}")"); BATCH=(); fi
done
[ ${#BATCH[@]} -gt 0 ] && BATCHES+=("$(IFS=$'\n'; echo "${BATCH[*]}")")

PASS_FILES=0; FAIL_FILES=0; PASS_TESTS=0; FAIL_TESTS=0; FAILED_LIST=()
i=0
for b in "${BATCHES[@]}"; do
  i=$((i+1))
  echo "[chunks] === batch $i/${#BATCHES[@]} ($(echo "$b" | wc -l) files) $(date -u +%T) ===" >> "$OUT"
  NODE_OPTIONS="--max-old-space-size=1024" npx vitest run $b >> "$OUT" 2>&1
  rc=$?
  # Parse this batch's summary from the tail of the run
  SUMMARY=$(rg "Test Files|      Tests" "$OUT" | tail -2)
  echo "[chunks] batch $i rc=$rc :: $(echo "$SUMMARY" | tr '\n' ' ')" | tee -a /tmp/phase2-suite-summary.txt
done
echo "[chunks] ALL BATCHES DONE $(date -u +%T)" | tee -a "$OUT"
