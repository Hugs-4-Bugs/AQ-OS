#!/usr/bin/env python3
"""Patch the five /api/competitors/[id]/{pricing,seo,reviews,social,website}
routes to enforce competitor ownership (they used withAuth but ignored the
user, delegating to unscoped service lookups)."""
import io, sys

FILES = [
    "src/app/api/competitors/[id]/pricing/route.ts",
    "src/app/api/competitors/[id]/seo/route.ts",
    "src/app/api/competitors/[id]/reviews/route.ts",
    "src/app/api/competitors/[id]/social/route.ts",
    "src/app/api/competitors/[id]/website/route.ts",
]

OLD = """  return withAuth(request, async () => {
    try {
      const { id } = await params;
"""
NEW = """  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // OWNERSHIP: only the competitor's owner may read its intelligence.
      const owned = await db.competitorAnalysis.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
      }
"""

for path in FILES:
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if OLD not in src:
        print(f"SKIP (pattern not found): {path}")
        continue
    patched = src.replace(OLD, NEW, 1)
    # ensure db + NextResponse imports exist
    if "from '@/lib/db'" not in patched:
        patched = patched.replace(
            "import { NextRequest, NextResponse } from 'next/server';",
            "import { NextRequest, NextResponse } from 'next/server';\nimport { db } from '@/lib/db';",
            1,
        )
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(patched)
    print(f"PATCHED: {path}")

print("done")
