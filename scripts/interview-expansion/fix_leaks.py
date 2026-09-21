#!/usr/bin/env python3
"""Fix Prisma/Next.js narrative leaks in the AcquisitionOS interview prep MD."""
import re, sys

MD = "/home/z/my-project/Interview docs/ACQUISITIONOS-INTERVIEW-PREP.md"

with open(MD, encoding="utf-8") as f:
    text = f.read()

before = text.count("Prisma") + text.count("prisma")

# 1) Q6-2 schema design answer: replace the Prisma sentence
text = re.sub(
    r"~80 tables across 6 bounded contexts\. The schema is in `prisma/schema\.prisma`.*?extraction\.",
    "~80 tables across 6 bounded contexts. The schema is owned by **Flyway migrations** "
    "(`V<version>__<description>.sql`, checked into the repo — the schema lives in SQL files, "
    "not in code annotations, so DBAs can review it in PRs). Hibernate entities map onto this "
    "schema via `@Entity`/`@Table`; we never let `hbm2ddl.auto` touch production. Each context "
    "owns its tables; cross-context references use UUID IDs (not FK constraints) to allow "
    "future service extraction.",
    text, flags=re.S)

# 2) Migration follow-up answer: replace "We use Prisma migrations today..." sentence
text = re.sub(
    r"We use Prisma migrations today.*?migrations\)\.",
    "**Flyway** runs all migrations — SQL-first, versioned (`V<timestamp>__<description>.sql`), "
    "forward-only (no down-migrations), reviewed in PRs like code. Spring Boot auto-runs Flyway "
    "at startup before serving traffic (`flyway.clean-disabled=true` in prod).",
    text, flags=re.S)

after = text.count("Prisma") + text.count("prisma")

with open(MD, "w", encoding="utf-8") as f:
    f.write(text)

print(f"Prisma mentions: {before} -> {after}")
# Show remaining occurrences for verification
for i, line in enumerate(text.splitlines(), 1):
    if "risma" in line:
        print(f"  line {i}: {line[:140]}")
