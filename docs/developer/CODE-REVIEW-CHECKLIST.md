# Code Review Checklist — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Use this for every PR review. Approve only when every applicable item is checked.

## 1. Security

- [ ] **Auth is enforced.** Every protected route wraps its handler in `withAuth` (or `withDualAuth`). No "I'll add auth later."
- [ ] **Authz is correct.** The route checks the right role / scope / ownership. (`lead.userId === authUser.id`; `hasPermission(user, 'leads:write')`.)
- [ ] **No SQL injection.** No `prisma.$queryRaw` with string interpolation. All raw SQL uses `Prisma.sql` tagged templates.
- [ ] **No XSS.** No `dangerouslySetInnerHTML` from user input. React escapes by default; verify no escape-hatch was added.
- [ ] **No CSRF hole.** State-changing non-OAuth requests rely on SameSite=strict cookies (the current defence). OAuth flows use the `state` parameter.
- [ ] **No secrets in the diff.** `git diff origin/main -- '*.env*' '*.json' '*.yml' '*.ts' '*.tsx'` — scan for keys, tokens, passwords.
- [ ] **No secret logging.** No `console.log(process.env.*)` (use the redacting helpers in `email-ethereal.ts`).
- [ ] **Input is validated.** Every request body is validated (type, presence, format) before use. Use `src/lib/security/input-validator.ts` or a Zod schema.
- [ ] **No SSRF.** Any new URL-fetch from user input uses the SSRF allowlist (reject private IP ranges, link-local, cloud-metadata endpoints). (The allowlist is a roadmap item — flag any new SSRF surface for it.)
- [ ] **File uploads are validated.** Mime, size, magic-byte (via `src/lib/security/upload-security.ts`).
- [ ] **No path traversal.** No `fs.readFile(userInput)` or similar.
- [ ] **Mass-assignment protected.** Writes use explicit `select` / `data: { field1, field2 }` — never `data: requestBody` (which would let the user set `plan`, `role`, etc.).
- [ ] **Webhooks are signed + idempotent.** Any new webhook receiver verifies a signature + deduplicates on an event ID.
- [ ] **Rate limits respected.** Any new public / high-volume endpoint has a rate limit.

## 2. Performance

- [ ] **No N+1 queries.** A list route uses `include` / `select` for relations, not a per-row re-query. Verify with the Prisma query log in dev.
- [ ] **Indexed queries.** Any new `where` clause uses an indexed field. (Check `prisma/schema.prisma` for the model's indexes.)
- [ ] **No full-table scans in the request path.** Aggregations on large tables use pre-materialised `AnalyticsSnapshot` (or are flagged for it).
- [ ] **Long jobs are backgrounded.** Any new > 5s operation is a candidate for the worker queue (ADR-011). At minimum, documented as "move to worker."
- [ ] **No synchronous external API calls in a hot path.** Cache external results where possible.
- [ ] **Pagination on list endpoints.** No "return all rows" — use `take` + `skip` or cursor pagination.
- [ ] **Bundle size.** New imports don't blow the chunk budget. Lazy-load heavy components (`next/dynamic`).
- [ ] **No unnecessary re-renders.** `useCallback` / `useMemo` for stable references passed to memoized children.

## 3. Error Handling

- [ ] **Errors are typed.** JSON `{ error, code? }` with the right HTTP status (see [ERROR-CODES.md](../technical/ERROR-CODES.md)).
- [ ] **Errors are actionable.** The message tells the user what to do, not just "Error."
- [ ] **No swallowed errors.** `catch (e) {}` (empty) is a smell; at minimum `console.warn` it.
- [ ] **External API errors are surfaced.** A Stripe / Google / SMTP failure propagates a clear error to the user.
- [ ] **Idempotency.** For webhooks + cron + payment: a replay is a no-op.
- [ ] **Graceful degradation.** If an external service is down, the app shows a clear state, not a 500.

## 4. Logging

- [ ] **Right level.** `console.log` for dev; `logger.info/warn/error` for prod. The route handlers should use `src/lib/observability/logger.ts`.
- [ ] **No PII in logs.** Email bodies, passwords, tokens, lead PII are never logged.
- [ ] **Contextual.** Logs include the request ID, user ID (if authed), route, for correlation.
- [ ] **No secret leaks.** (See §1.)

## 5. Documentation

- [ ] **Changelog updated** (`docs/product/CHANGELOG.md`) for user-facing changes.
- [ ] **API docs updated** (`docs/technical/API-REFERENCE.md` + the in-app `/api-docs` if the route is public-API-eligible) for new / changed endpoints.
- [ ] **This doc updated** if the review process itself changed.
- [ ] **JSDoc / TSDoc** on exported functions that aren't self-explanatory.
- [ ] **Comments** on non-obvious code; the "why" not the "what."
- [ ] **Worklog entry** (`worklog.md`) appended per the [CONTRIBUTING.md](CONTRIBUTING.md) §8 template.

## 6. Test Coverage

- [ ] **Unit tests** added / updated for new pure functions.
- [ ] **Integration tests** added / updated for new API routes + critical paths.
- [ ] **Regression test** added for bug fixes (the bug's reproduction is the test).
- [ ] **Edge cases** covered: empty input, null, boundary values, unauthorised user.
- [ ] **Existing tests still pass.** `bun run test`.
- [ ] **Lint + tsc clean** for touched files.

## 7. Breaking Changes

- [ ] **Identified.** Any change that breaks a public contract (API shape, DB schema, env var, behaviour) is flagged.
- [ ] **Documented.** The changelog says "BREAKING CHANGE:" + the migration path.
- [ ] **Migrated.** The DB has a backfill / down-migration. The API has a deprecation window (when versioning ships — ADR-013). The env var is added to `ensure-env.sh` + the docs.
- [ ] **Coordinated.** If the change affects external API users, they're notified ≥ 30 days in advance.

## 8. UI / UX

- [ ] **Responsive.** Tested at 320px, 768px, 1280px.
- [ ] **Accessible.** Semantic HTML, ARIA where needed, keyboard-navigable, sufficient contrast.
- [ ] **Loading states.** Spinner / skeleton during async.
- [ ] **Error states.** Clear, actionable message; not just "Error."
- [ ] **Empty states.** Illustrative + a CTA.
- [ ] **Toasts.** Type-appropriate (success / error / warning / info); not excessive.
- [ ] **No overlap.** Floating buttons don't cover the input area; modals don't overflow the viewport; sticky footer works.
- [ ] **Touch targets ≥ 44px** on mobile.
- [ ] **Dark mode.** Tested in light + dark.
- [ ] **No indigo / blue** unless the user requested it.

## 9. Data Integrity

- [ ] **Schema changes** have a migration + a backfill plan + a down-migration.
- [ ] **Foreign keys** are preserved (no orphaned rows). CASCADE rules are intentional.
- [ ] **Unique constraints** are respected; P2002 errors are caught + handled.
- [ ] **Transactions** used for multi-step writes (e.g. payment activation: subscription + user + credits + invoice).
- [ ] **Soft deletes vs hard deletes** — soft-delete (`isActive=false`) for users; hard-delete for things the user explicitly deletes (their leads, their API keys).

## 10. Production-Readiness

- [ ] **No `console.log` of secrets / PII.**
- [ ] **No `localhost` / `127.0.0.1`** in production code (the keepalive `localhost:3000` curl is OK).
- [ ] **No `process.env.NODE_ENV === 'development'`** code paths that bypass security.
- [ ] **`AUTH_DEV_MODE=false`** respected (the dev-bypass paths don't run in prod).
- [ ] **Caching headers** set where appropriate (static assets long; API responses never or short).
- [ ] **CSP / HSTS / security headers** don't break the new feature.

## 11. The "Would I Be Comfortable…" Final Checks

- [ ] **…deploying this at 3am?** If the answer is "I'd want to test more first," don't approve.
- [ ] **…this code running for a year without my attention?** If a subtle bug would be catastrophic, add a test + a monitor.
- [ ] **…a stranger reading this code?** Is it clear enough that the next engineer understands it without asking you?

## 12. Approving

- **Approve** when all applicable items are checked.
- **Request changes** when any required item is unchecked.
- **Comment** (non-blocking) on style / preference items.
- **Block** on security / data-integrity / breaking-change items.

---

*See also: [CONTRIBUTING.md](CONTRIBUTING.md), [TESTING-STRATEGY.md](TESTING-STRATEGY.md), [DEBUGGING-GUIDE.md](DEBUGGING-GUIDE.md), [../security/CODE-REVIEW-CHECKLIST.md (the security subset)](../security/SECURITY-POLICY.md).*
