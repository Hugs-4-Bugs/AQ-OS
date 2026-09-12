#!/usr/bin/env python3
"""Fix appendix position and remove remaining placeholder note."""
MD = "/home/z/my-project/Interview docs/ACQUISITIONOS-INTERVIEW-PREP.md"

with open(MD, encoding="utf-8") as f:
    lines = f.read().split("\n")

# 1. Find and remove the misplaced appendix block (starts with "## APPENDIX B")
app_start = next(i for i, l in enumerate(lines) if l.startswith("## APPENDIX B"))
# block ends at the trailing "---" followed by blank before next content; scan for the chunk's end:
# it ends with a line "---" then "" then the next original heading. We inserted: sep + chunk_lines,
# chunk ends with "---" + "" . So find the next line after app_start that starts with "## Quick Reference - Project Summary Card"
app_end = next(i for i in range(app_start + 1, len(lines))
               if lines[i].startswith("## Quick Reference - Project Summary Card"))
# back up over blank/--- lines belonging to the chunk
end = app_end
while end > app_start and (lines[end - 1].strip() == "" or lines[end - 1].strip() == "---"):
    end -= 1
block = lines[app_start:end]
del lines[app_start:end]
print(f"Removed misplaced appendix block ({len(block)} lines) from line {app_start}")

# 2. Remove the remaining Hibernate placeholder note
for i, l in enumerate(lines):
    if l.startswith("*(The remaining Hibernate"):
        del lines[i]
        if i < len(lines) and lines[i].strip() == "":
            del lines[i]
        print(f"Removed Hibernate placeholder at line {i}")
        break

# 3. Find the cheat-sheet heading: "## Quick Reference — Cheat Sheet of All Key Annotations Used"
app_idx = next(i for i, l in enumerate(lines)
               if l.startswith("## Quick Reference") and "Cheat Sheet" in l)
# back up over blank/--- lines before it
while app_idx > 0 and (lines[app_idx - 1].strip() == "" or lines[app_idx - 1].strip() == "---"):
    app_idx -= 1
lines[app_idx:app_idx] = block
print(f"Inserted appendix block before cheat sheet at line {app_idx}")

with open(MD, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"New length: {len(lines)}")
