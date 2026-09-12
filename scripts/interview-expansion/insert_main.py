#!/usr/bin/env python3
"""Insert expansion chunks into the AcquisitionOS interview prep MD."""
import re, sys

BASE = "/home/z/my-project/Interview docs"
MD = f"{BASE}/ACQUISITIONOS-INTERVIEW-PREP.md"
CHUNKS = "/home/z/my-project/scripts/interview-expansion"

with open(MD, encoding="utf-8") as f:
    lines = f.read().split("\n")

def read_chunk(name):
    with open(f"{CHUNKS}/{name}", encoding="utf-8") as f:
        content = f.read()
    return content.split("\n")

def find_line(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    return -1

# ---- 1. Remove the two placeholder notes ("*(The remaining ~22 Spring Boot questions..." etc.)
placeholders = [i for i, l in enumerate(lines) if l.startswith("*(The remaining ~") ]
for i in reversed(placeholders):
    # remove the placeholder line and one following blank line if present
    del lines[i]
    if i < len(lines) and lines[i].strip() == "":
        del lines[i]
print(f"Removed {len(placeholders)} placeholder notes")

# ---- 2. Category chunks: insert at end of each category section
CAT_CHUNKS = {
    "## CATEGORY 2": "chunk-cat2.md",
    "## CATEGORY 3": "chunk-cat3.md",
    "## CATEGORY 4": "chunk-cat4.md",
    "## CATEGORY 5": "chunk-cat5.md",
    "## CATEGORY 6": "chunk-cat6.md",
    "## CATEGORY 7": "chunk-cat7.md",
    "## CATEGORY 8": "chunk-cat8.md",
    "## CATEGORY 9": "chunk-cat9.md",
    "## CATEGORY 10": "chunk-cat10.md",
    "## CATEGORY 11": "chunk-cat11.md",
    "## CATEGORY 12": "chunk-cat12.md",
    "## CATEGORY 13": "chunk-cat13.md",
    "## CATEGORY 14": "chunk-cat14.md",
}

# process categories from LAST to FIRST so earlier insertions don't shift later line numbers
cat_starts = []
for i, l in enumerate(lines):
    for cat in CAT_CHUNKS:
        if l.startswith(cat + " "):
            cat_starts.append((i, cat))
            break

cat_starts.sort(key=lambda t: -t[0])

insertions = []  # (index, chunk_name)
for start, cat in cat_starts:
    # find next line starting with "## " after this category heading
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    insertions.append((end, CAT_CHUNKS[cat]))

# ---- 3. Front matter chunk: insert right before the "# Category 1 & 2" divider line
idx = find_line(lambda l: l.startswith("# Category 1 & 2"))
if idx == -1:
    idx = find_line(lambda l: l.startswith("## CATEGORY 1"))
# back up over preceding "---" and blank lines
while idx > 0 and (lines[idx - 1].strip() == "" or lines[idx - 1].strip() == "---"):
    idx -= 1
insertions.append((idx, "chunk-frontmatter.md"))

# ---- 4. Appendix: insert before "## Quick Reference — Cheat Sheet"
idx = find_line(lambda l: l.startswith("## Quick Reference"))
insertions.append((idx, "chunk-appendix.md"))

# ---- apply insertions from bottom to top
insertions.sort(key=lambda t: -t[0])
total = 0
for idx, chunk in insertions:
    chunk_lines = read_chunk(chunk)
    # ensure a blank line separator before insertion
    sep = [""] if (idx > 0 and lines[idx - 1].strip() != "") else []
    lines[idx:idx] = sep + chunk_lines
    total += len(chunk_lines)
    print(f"Inserted {chunk} at line {idx} ({len(chunk_lines)} lines)")

with open(MD, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Total lines added: {total}; new file length: {len(lines)}")
