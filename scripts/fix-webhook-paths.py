#!/usr/bin/env python3
"""Fix webhook paths (pass 1): lines mentioning only Stripe or only Razorpay,
plus generic /api/gmail/pubsub -> /api/gmail/pubsub/webhook. Print leftovers."""
import os, re

ROOT = "/home/z/my-project/docs/deployment"
GEN_PAY = re.compile(r"/api/payments/webhook(?=([^/]|$))")  # not followed by /
GMAIL = re.compile(r"/api/gmail/pubsub(?=/([^w]|$)|(?=[^/\w])|$)")

def fix_line(line):
    orig = line
    has_stripe = re.search(r"stripe", line, re.I)
    has_razor = re.search(r"razorpay", line, re.I)
    # gmail pubsub generic -> /api/gmail/pubsub/webhook (avoid already-specific)
    line = re.sub(r"/api/gmail/pubsub(?!/webhook)", "/api/gmail/pubsub/webhook", line)
    if GEN_PAY.search(line):
        if has_stripe and not has_razor:
            line = GEN_PAY.sub("/api/payments/webhook/stripe", line)
        elif has_razor and not has_stripe:
            line = GEN_PAY.sub("/api/payments/webhook/razorpay", line)
    return line, (line != orig)

def main():
    leftovers = []
    changed = []
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(dirpath, fn)
            lines = open(path, encoding="utf-8").read().split("\n")
            dirty = False
            for i, line in enumerate(lines):
                if GEN_PAY.search(line) or re.search(r"/api/gmail/pubsub(?!/webhook)", line):
                    new, did = fix_line(line)
                    if GEN_PAY.search(new):  # still generic after rules -> leftover
                        leftovers.append((os.path.relpath(path, ROOT), i + 1, new.strip()))
                    if did:
                        lines[i] = new
                        dirty = True
            if dirty:
                open(path, "w", encoding="utf-8").write("\n".join(lines))
                changed.append(os.path.relpath(path, ROOT))
    print("changed files:")
    for c in changed:
        print("  ", c)
    print(f"\nleftover lines with generic /api/payments/webhook ({len(leftovers)}):")
    for rel, ln, text in leftovers:
        print(f"  {rel}:{ln}: {text[:160]}")

if __name__ == "__main__":
    main()
