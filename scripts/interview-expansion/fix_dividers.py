#!/usr/bin/env python3
"""Move Cat 8 / Cat 14 expansion content to before their section dividers."""
MD = "/home/z/my-project/Interview docs/ACQUISITIONOS-INTERVIEW-PREP.md"

with open(MD, encoding="utf-8") as f:
    lines = f.read().split("\n")

def move_block_after_divider(divider_prefix, next_heading_prefix):
    """Find divider line; the block between divider and next_heading (if it starts with ### Q) moves before divider."""
    d_idx = next(i for i, l in enumerate(lines) if l.startswith(divider_prefix))
    # find next heading after divider
    n_idx = next(i for i in range(d_idx + 1, len(lines)) if lines[i].startswith(next_heading_prefix))
    # check if block between contains Q headings (misplaced chunk)
    has_q = any(lines[j].startswith("### Q") for j in range(d_idx + 1, n_idx))
    if not has_q:
        print(f"No misplaced block after divider '{divider_prefix[:40]}...'")
        return
    block = lines[d_idx + 1:n_idx]
    # remove trailing/leading blank lines from block edges
    while block and block[0].strip() == "":
        block.pop(0)
    while block and block[-1].strip() == "":
        block.pop()
    del lines[d_idx + 1:n_idx]
    # insert before divider, with separator
    sep = [""] if (d_idx > 0 and lines[d_idx - 1].strip() != "") else []
    lines[d_idx:d_idx] = sep + block + [""]
    print(f"Moved {len(block)} lines before divider at {d_idx}")

# Cat 8: divider "# Category 9, 10, 11, 12, 13 & 14" followed by Q8-2..Q8-10 then "## CATEGORY 9"
move_block_after_divider("# Category 9, 10, 11, 12, 13 & 14", "## CATEGORY 9")
# Cat 14: divider "# End Matter" followed by Q14-3..Q14-10 then "## APPENDIX B"
move_block_after_divider("# End Matter", "## APPENDIX B")

with open(MD, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"New length: {len(lines)}")
