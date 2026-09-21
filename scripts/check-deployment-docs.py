#!/usr/bin/env python3
"""Validate docs/deployment handbook: file inventory + relative link check + secret scan."""
import os, re, sys
from urllib.parse import urlparse

ROOT = "/home/z/my-project/docs/deployment"
EXPECTED = {
    "README.md", "00-prerequisites.md", "01-architecture.md",
    "02-environment-variables-and-secrets.md", "03-docker.md",
    "04-database-production.md", "05-cicd.md", "06-dns-and-domains.md",
}
CLOUDS = ["gcp", "aws", "azure", "cloudflare"]
CLOUD_FILES = {
    "README.md", "architecture.md", "prerequisites.md", "manual-deployment.md",
    "terraform.md", "networking.md", "database.md", "secrets.md", "frontend.md",
    "backend.md", "dns-ssl.md", "cicd.md", "monitoring.md", "backups.md",
    "security.md", "scaling.md", "rollback.md", "troubleshooting.md",
}

# Secret patterns: never allow real-looking credentials in docs
SECRET_PATTERNS = [
    (r"rodvowtaifcfjmue", "user-provided Gmail app password"),
    (r"mailtoprabhat72@gmail\.com", "user's real Gmail address"),
    (r"AKIA[0-9A-Z]{16}", "AWS access key"),
    (r"GOCSPX-[A-Za-z0-9_\-]{10,}", "Google OAuth client secret"),
    (r"sk-[A-Za-z0-9]{20,}", "OpenAI-style key"),
    (r"whsec_[A-Za-z0-9]{10,}", "Stripe webhook secret"),
    (r"re_[A-Za-z0-9]{20,}", "Resend API key"),
    (r"rzp_(live|test)_[A-Za-z0-9]{10,}", "Razorpay key"),
    (r"(?:password|passwd|pwd)\s*[:=]\s*'[^']{8,}'", "hardcoded password assignment"),
    (r"[A-Za-z0-9+/]{40,}={0,2}\s*(?:$|\n)", "possible base64 blob (check manually)"),
]

def md_links(text):
    for m in re.finditer(r"\[[^\]]*\]\(([^)\s]+)[^)]*\)", text):
        yield m.group(1)

def main():
    broken, warn, secret_hits, files_seen = [], [], [], []
    fix_candidates = []
    for dirpath, dirnames, filenames in sorted(os.walk(ROOT)):
        rel = os.path.relpath(dirpath, ROOT)
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(dirpath, fn)
            relpath = os.path.relpath(path, ROOT)
            files_seen.append(relpath)
            text = open(path, encoding="utf-8").read()
            # inventory check
            folder = rel if rel != "." else ""
            if folder == "" and fn not in EXPECTED:
                warn.append(f"unexpected root file: {relpath}")
            if folder in CLOUDS and fn not in CLOUD_FILES:
                warn.append(f"unexpected file in {folder}: {fn}")
            # links
            for link in md_links(text):
                if link.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                target = urlparse(link).path
                if not target:
                    continue
                resolved = os.path.normpath(os.path.join(dirpath, target))
                if not os.path.exists(resolved):
                    broken.append(f"{relpath} -> {link}")
                    # fix candidate: ../../<common doc> from a cloud folder
                    m = re.match(r"^\.\./\.\./((?:0[0-6]-[^/]+|README)\.md)$", target)
                    if m and folder in CLOUDS and os.path.exists(os.path.join(ROOT, m.group(1))):
                        fix_candidates.append((path, link, f"../{m.group(1)}"))
            # secrets
            for pat, label in SECRET_PATTERNS:
                for mm in re.finditer(pat, text):
                    snippet = text[max(0, mm.start()-30):mm.end()+30].replace("\n", " ")
                    secret_hits.append(f"{relpath}: {label}: ...{snippet}...")

    # inventory completeness
    missing = []
    root_files = set(os.listdir(ROOT))
    for f in EXPECTED:
        if f not in root_files:
            missing.append(f"root/{f}")
    for c in CLOUDS:
        have = set(os.listdir(os.path.join(ROOT, c))) if os.path.isdir(os.path.join(ROOT, c)) else set()
        for f in CLOUD_FILES:
            if f not in have:
                missing.append(f"{c}/{f}")

    print(f"files scanned: {len(files_seen)}")
    print(f"missing files: {len(missing)}")
    for m in missing: print("  MISSING:", m)
    print(f"unexpected: {len(warn)}")
    for w in warn: print("  WARN:", w)
    print(f"broken links: {len(broken)}")
    for b in broken[:80]: print("  BROKEN:", b)
    if len(broken) > 80: print(f"  ... and {len(broken)-80} more")
    print(f"secret-scan hits: {len(secret_hits)}")
    for s in secret_hits[:30]: print("  SECRET:", s)
    print(f"fix candidates (../../ -> ../): {len(fix_candidates)}")
    for p, old, new in fix_candidates[:20]:
        print("  FIX:", os.path.relpath(p, ROOT), ":", old, "->", new)
    if len(fix_candidates) > 20: print(f"  ... and {len(fix_candidates)-20} more")

    if "--fix" in sys.argv:
        from collections import defaultdict
        byfile = defaultdict(list)
        for path, old, new in fix_candidates:
            byfile[path].append((old, new))
        n = 0
        for path, reps in byfile.items():
            t = open(path, encoding="utf-8").read()
            for old, new in reps:
                t = t.replace(f"]({old})", f"]({new})")
                n += 1
            open(path, "w", encoding="utf-8").write(t)
        print(f"applied {n} link fixes")

if __name__ == "__main__":
    main()
