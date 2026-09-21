#!/usr/bin/env python3
"""
AcquisitionOS source-corruption repair + scan tool.

The sandbox intermittently drops 1-2 byte sequences from source files
(observed: '[m' and 'm' vanishing after 'const ['), producing syntax
errors that break the Next.js dev compile. This script:
  1. Repairs KNOWN corrupted lines (idempotent string replacements).
  2. Scans every .ts/.tsx under src/ for generic corruption patterns
     and reports any file that still looks broken.
Run multiple times if read-flakiness is suspected.
"""
import os
import re
import sys

ROOT = "/home/z/my-project"

# (file, bad, good) — targeted idempotent repairs
REPAIRS = [
    ("src/components/dashboard/settings-shell.tsx",
     "const eetingSettings, setMeetingSettings] = useState({",
     "const [meetingSettings, setMeetingSettings] = useState({"),
    ("src/components/dashboard/settings-shell.tsx",
     "const eetingSettingsSaving, setMeetingSettingsSaving] = useState(false);",
     "const [meetingSettingsSaving, setMeetingSettingsSaving] = useState(false);"),
    ("src/components/dashboard/settings-shell.tsx",
     "}, eetingSettings]);",
     "}, [meetingSettings]);"),
    ("src/components/feedback/feedback-provider.tsx",
     "const odalOpen, setModalOpen] = useState(false);",
     "const [modalOpen, setModalOpen] = useState(false);"),
]

# Generic corruption heuristics (broken destructuring / dep arrays)
BAD_PATTERNS = [
    re.compile(r"const [A-Za-z_$][A-Za-z0-9_$]*, set[A-Z][A-Za-z0-9_$]*\]"),
    re.compile(r"\}, [A-Za-z_$][A-Za-z0-9_$]*\]\)"),
    re.compile(r"const [A-Za-z_$][A-Za-z0-9_$]*\] = useState"),
]


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    applied = 0
    for rel, bad, good in REPAIRS:
        path = os.path.join(ROOT, rel)
        try:
            content = read(path)
        except FileNotFoundError:
            print(f"SKIP (missing): {rel}")
            continue
        if bad in content:
            content = content.replace(bad, good)
            write(path, content)
            print(f"REPAIRED: {rel} :: {bad[:50]}")
            applied += 1
        elif good in content:
            print(f"OK (already clean): {rel}")
        else:
            print(f"WARN: neither bad nor good found in {rel} — inspect manually")

    # Generic scan (skip node_modules/.next)
    suspects = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "src")):
        for fn in filenames:
            if not (fn.endswith(".ts") or fn.endswith(".tsx")):
                continue
            p = os.path.join(dirpath, fn)
            try:
                content = read(p)
            except Exception:
                continue
            for i, line in enumerate(content.split("\n"), 1):
                for pat in BAD_PATTERNS:
                    if pat.search(line):
                        suspects.append(f"{os.path.relpath(p, ROOT)}:{i}: {line.strip()[:100]}")
                        break

    print("\n--- GENERIC SCAN ---")
    if suspects:
        for s in suspects:
            print("SUSPECT:", s)
        sys.exit(2)
    print("no additional corruption patterns found")
    print(f"\napplied {applied} repairs")


if __name__ == "__main__":
    main()
