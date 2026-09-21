# Contributing — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.

## 1. Code Style Guidelines

### TypeScript
- **Strict mode** — `tsconfig.json` has `strict: true`. Every file must pass `bunx tsc --noEmit`.
- **No `any`** without a comment explaining why. Prefer `unknown` + a type guard.
- **Explicit return types** on exported functions (helps the IDE + catches drift).
- **No unused vars / params** — ESLint rule `no-unused-vars` is on.
- **`import type`** for type-only imports (avoids runtime side effects).
- **Path aliases:** `@/*` → `src/*`. No relative imports beyond a single `./` level.

### React
- **`'use client'`** at the top of any file using hooks / browser APIs / TanStack Query.
- **`'use server'`** for server actions (we use API routes instead; see ADR).
- **shadcn/ui** components from `src/components/ui/` — don't reimplement; extend. (See [UI Rules](#ui-rules) below.)
- **Functional components + hooks only.** No class components except error boundaries.
- **`useCallback` / `useMemo`** for stable references passed to memoized children.
- **TanStack Query** for server state; **Zustand** for client state (ADR-009).
- **No direct DOM manipulation** (no `document.getElementById`); use refs.
- **Accessibility:** semantic HTML (`main`, `nav`, `button`, `label`); ARIA where needed; keyboard-navigable.

### CSS / Tailwind
- **Tailwind CSS 4** — utility-first. No custom CSS except in `globals.css` (and only with a comment explaining why).
- **No inline `style={}`** except for genuinely dynamic values (e.g. `bottom: ${n}px` for FAB positioning).
- **No `!important`** except in `globals.css` for unavoidable overrides (e.g. the `fix5-fab-*` rules) — each `!important` needs a comment.
- **Responsive:** mobile-first. Use `sm:`, `md:`, `lg:`, `xl:` prefixes. Test at 320px + 768px + 1280px.
- **No indigo / blue** unless the user explicitly requests it. Use the shadcn/ui theme tokens (`bg-primary`, `text-foreground`).
- **Dark mode:** use `next-themes` (already wired); respect the user's preference; default is light.

### Prisma
- **Schema:** every model + field gets a comment explaining its purpose (the existing schema is the example).
- **Migrations:** `bun run db:migrate -- --name <descriptive>`; review the generated SQL; never commit a destructive migration without a backfill plan (see [DATABASE-OPERATIONS.md](../operations/DATABASE-OPERATIONS.md)).
- **No raw SQL** (`prisma.$queryRaw`) without a comment explaining why the typed query builder isn't enough.
- **JSON fields** stored as `String` (SQLite limitation); parse on read; will move to `Json` on PostgreSQL.

### API routes
- **`withAuth`** (or `withDualAuth` for API-key-eligible routes) wraps every protected handler.
- **Validation** at the top of every handler — fail 400 early on bad input.
- **Explicit `select`** on every DB read — never return more fields than needed.
- **Explicit field allowlist** on every DB write — never mass-assign.
- **Errors:** JSON `{ error, code? }` with the right HTTP status (see [ERROR-CODES.md](../technical/ERROR-CODES.md)).
- **Logging:** use `src/lib/observability/logger.ts`; never `console.log` in production code (the existing `console.warn` in the magic-link route is for diagnostic visibility — that's the exception, not the rule).
- **No secrets in logs.**

### Files / naming
- **PascalCase** for components (`ApiKeysPanel.tsx`).
- **kebab-case** for routes + lib files (`api-key-service.ts`).
- **UPPER_CASE** for env vars.
- **One default export per file** for components; named exports for lib functions.

## 2. Branch Naming

- `feat/<short-desc>` — new feature.
- `fix/<short-desc>` — bug fix.
- `chore/<short-desc>` — tooling, deps, refactors with no behaviour change.
- `docs/<short-desc>` — documentation only.
- `security/<short-desc>` — security fix (may be a private branch + a private PR until disclosed).
- `hotfix/<short-desc>` — urgent production fix (off `main`, merged back).

## 3. Commit Message Format

**Conventional Commits:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type:** `feat`, `fix`, `chore`, `docs`, `security`, `refactor`, `test`, `perf`, `build`, `ci`.
- **scope:** the area (e.g. `auth`, `leads`, `outreach`, `meetings`, `billing`, `api`, `ui`, `db`). Optional.
- **subject:** imperative, ≤ 72 chars, no period.
- **body:** what + why (the why is more important than the what). Wrap at 80 chars.
- **footer:** breaking changes (`BREAKING CHANGE:`), issue refs (`Closes #123`), co-authors.

**Examples:**
```
feat(outreach): actually send the email + BCC the user

The communications route only logged a DB row; the email was never
delivered. Now it sends via SMTP, BCCs the user, sends a separate
confirmation, and updates lead.emailStatus.

Closes the "outreach not delivered" report.
```
```
fix(auth): magic link email pointed at localhost:3000

The verify route's getDynamicOrigin() preferred new URL(request.url).origin
which resolves to localhost on this platform. Now APP_URL is the
highest-priority origin (validated against internal-host patterns).
```

## 4. PR Process

1. **Branch** from `main`; rebase before opening.
2. **Open a draft PR early** for visibility; mark "ready for review" when done.
3. **Self-review** the diff first (use GitHub's review view; read every line).
4. **PR description template:**
   ```
   ## What
   One-paragraph summary.
   
   ## Why
   The problem / motivation.
   
   ## How
   The approach.
   
   ## Testing
   How I tested it (manual steps; automated tests added/updated).
   
   ## Risk
   What could break; what I did to mitigate.
   
   ## Checklist
   - [ ] Lint passes
   - [ ] tsc clean for touched files
   - [ ] Tests pass
   - [ ] Changelog updated
   - [ ] No secrets in the diff
   - [ ] No localhost URLs in production code
   - [ ] Screenshots (if UI)
   ```
5. **Request review** from at least one engineer; for security / billing / auth changes, request two.
6. **Address review comments** with new commits (not force-push squash until ready to merge, unless the team prefers squash-merge).
7. **Merge** via squash-merge (the conventional-commit subject becomes the squashed commit subject).

## 5. Code Review Checklist

See [CODE-REVIEW-CHECKLIST.md](CODE-REVIEW-CHECKLIST.md).

## 6. Testing Requirements

See [TESTING-STRATEGY.md](TESTING-STRATEGY.md).

**Minimum bar for every PR:**
- `bun run lint` passes.
- `bunx tsc --noEmit` has no new errors in touched files.
- If the PR changes user-facing behaviour, at least one test (unit or integration) covers the new path.
- If the PR fixes a bug, a regression test is added.
- Manual smoke test of the affected flow.

## 7. UI Rules

- **Use existing shadcn/ui components** from `src/components/ui/` — don't build from scratch.
- **Card alignment + padding:** `p-4` or `p-6` for content; `gap-4` or `gap-6` for spacing.
- **Long lists:** `max-h-96 overflow-y-auto` + custom scrollbar styling.
- **Sticky footer:** if a footer exists, it sticks to the bottom (`min-h-screen flex flex-col` on the root; `mt-auto` on the footer).
- **Touch targets:** ≥ 44px on mobile.
- **Loading states:** spinners (`Loader2 animate-spin`) during async; skeletons for initial load.
- **Error states:** clear, actionable messages; not just "Error."
- **Empty states:** illustrative + a CTA, not just "No data."
- **Toasts:** `sonner` for feedback; type-appropriate (success / error / warning / info).
- **Tooltips + help text** where the user might be confused.
- **Animations:** subtle Framer Motion transitions (hover, focus); no janky CSS keyframes.

## 8. The Worklog

Every PR (or every work session for the founder working solo) appends a section to `worklog.md`:
```
---
Task ID: <id>
Agent: <name>
Task: <one-line>

Work Log:
- <step>
- <step>

Stage Summary:
- Files modified:
- New files:
- Verification:
- Constraints honored:
```

This is the institutional memory. The next person to touch the code reads the worklog first.

## 9. Communication

- **Slack / Discord** (when the team grows) for quick questions.
- **GitHub PRs** for design discussion; open a draft PR rather than a long thread.
- **The worklog** for the durable record.
- **ADRs** (`/docs/technical/ARCHITECTURE-DECISION-RECORDS.md`) for decisions that affect the whole codebase.

## 10. Unwritten Rules (read the codebase)

- **Don't touch OTP login** — it's working; leave it.
- **Don't touch the magic-link sending logic** without coordinating — it has platform-specific fixes.
- **Don't `bun run build`** in the sandbox — use `next dev` (the sandbox can't sustain the build memory).
- **Don't run the server on a port other than 3000** — the gateway routes 3000.
- **`z-ai-web-dev-sdk` is backend-only** — never import it in a client component.
- **Relative paths only** in `fetch` / WebSocket — no `http://localhost:3000` in client code.

---

*See also: [CODE-REVIEW-CHECKLIST.md](CODE-REVIEW-CHECKLIST.md), [LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md), [TESTING-STRATEGY.md](TESTING-STRATEGY.md), [DEBUGGING-GUIDE.md](DEBUGGING-GUIDE.md), [GLOSSARY.md](GLOSSARY.md).*
