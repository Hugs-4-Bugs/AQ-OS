#!/bin/bash
# Scoped TypeScript checker — runs tsc per project scope with a heap cap
# to stay under the sandbox's 4GB pod memory limit (full-project tsc OOMs).
# Usage: bash scripts/tsc-scoped.sh <scope>   # scope: app | components | lib
set -u
cd /home/z/my-project
SCOPE="${1:-app}"
LOG="/home/z/my-project/tsc-${SCOPE}.log"
DONE="/home/z/my-project/tsc-${SCOPE}.done"
rm -f "$LOG" "$DONE"
NODE_OPTIONS="--max-old-space-size=1536" setsid npx tsc --noEmit -p "tsconfig.scope-${SCOPE}.json" > "$LOG" 2>&1
echo "EXIT=$?" > "$DONE"
echo "errors: $(grep -c 'error TS' "$LOG" 2>/dev/null)"
tail -3 "$LOG" 2>/dev/null
