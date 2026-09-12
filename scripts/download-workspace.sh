#!/usr/bin/env bash
# scripts/download-workspace.sh
# ─────────────────────────────────────────────────────────────────
# Standalone workspace source archive generator.
# Creates a clean .tar.gz of the CURRENT workspace source code
# (git-tracked files only) — NO secrets, NO node_modules, NO .next.
#
# Usage:  bash scripts/download-workspace.sh [output-path]
# Default output: ./acquisitionos-source-<sha>-<date>.tar.gz
#
# This is a download/archive UTILITY, not application source code.
# It does not modify the codebase. Forward-only, no rollback.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE=$(date +%Y%m%d)
OUT="${1:-acquisitionos-source-${SHA}-${DATE}.tar.gz}"

# Security check: refuse to export if .env is tracked (secrets)
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "ABORT: .env is tracked in git — refusing to include secrets." >&2
  echo "Run: git rm --cached .env && restore .gitignore" >&2
  exit 1
fi

echo "Creating source archive: ${OUT}"
echo "  HEAD: $(git rev-parse HEAD 2>/dev/null || echo 'detached')"
echo "  Tracked files: $(git ls-files 2>/dev/null | wc -l)"

# Stream git archive (only git-tracked files, respects .gitignore)
git archive HEAD | gzip -c > "${OUT}"

SIZE=$(du -h "${OUT}" | cut -f1)
echo "✓ Archive created: ${OUT} (${SIZE})"
echo ""
echo "Contents include all git-tracked source (src/, prisma/, package.json, etc.)"
echo "Excluded (gitignored, not source): node_modules/, .next/, .env, .git/"
