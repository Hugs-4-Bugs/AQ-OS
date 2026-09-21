#!/usr/bin/env python3
"""Phase 1 read-only audit: byte-level tree comparison.
Workspace HEAD tree vs GitHub Hugs-4-Bugs/AcquisitionOS main tree.
Pure analysis of git ls-tree dumps — no workspace modification."""
import sys
from collections import defaultdict

def load(path):
    entries = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line:
                continue
            meta, p = line.split('\t', 1)
            mode, otype, sha = meta.split()
            entries[p] = (mode, otype, sha)
    return entries

ws = load('/tmp/ws_tree.txt')
gh = load('/tmp/gh_tree.txt')

ws_paths = set(ws)
gh_paths = set(gh)

missing = sorted(gh_paths - ws_paths)   # on GitHub, absent in workspace HEAD
extra   = sorted(ws_paths - gh_paths)   # in workspace HEAD, absent on GitHub
common  = ws_paths & gh_paths

modified_mode  = []
modified_blob  = []
for p in sorted(common):
    wm, wt, wsha = ws[p]
    gm, gt, gsha = gh[p]
    if wsha != gsha:
        modified_blob.append(p)
    elif wm != gm:
        modified_mode.append(p)

print(f"WORKSPACE HEAD tree files: {len(ws)}")
print(f"GITHUB main tree files:    {len(gh)}")
print(f"common paths:              {len(common)}")
print(f"MISSING (GH has, WS not):  {len(missing)}")
print(f"EXTRA (WS has, GH not):    {len(extra)}")
print(f"CONTENT-DIFFERENT blobs:   {len(modified_blob)}")
print(f"MODE-only different:       {len(modified_mode)}")
print()

def dir_of(p):
    return p.rsplit('/', 1)[0] if '/' in p else '<root>'

def summarize(items, label, limit=200):
    print(f"--- {label} ({len(items)}) ---")
    bydir = defaultdict(int)
    for p in items:
        bydir[dir_of(p)] += 1
    for d in sorted(bydir, key=lambda d: (-bydir[d], d))[:30]:
        print(f"  {bydir[d]:4d}  {d}/")
    if len(items) <= limit:
        for p in items:
            print(f"    {p}")
    else:
        print(f"  [showing directory summary; {len(items)} paths total — full list too long]")
    print()

summarize(missing, "MISSING from workspace (GitHub has them)")
summarize(extra, "EXTRA in workspace (GitHub does not have them)")
summarize(modified_blob, "CONTENT-DIFFERENT (byte-level blob SHA mismatch)")
if modified_mode:
    summarize(modified_mode, "MODE-different (same content)")

# identical count
identical = len(common) - len(modified_blob) - len(modified_mode)
print(f"BYTE-IDENTICAL common files: {identical}/{len(common)}")
