# Incident Response Plan — AcquisitionOS

> Owner: Security + Operations. Status: Living document. Last reviewed: 2026-09-09.
> Audience: the on-call engineer (Ananya persona) + the founding team. This is the playbook, not the post-mortem template.

## 1. Severity Levels

| Severity | Definition | Examples | Response time |
|---|---|---|---|
| **SEV-1 (Critical)** | Active data breach, data loss, or full service outage. Production is down or compromised. | DB leaked publicly; auth bypass live; Stripe webhook forging an active attack; all users unable to log in. | Acknowledge < 15 min; contain < 1 h; communicate < 4 h |
| **SEV-2 (Major)** | Partial outage or a serious vulnerability not yet exploited. | One major feature (billing, meetings, outreach) broken for all users; SSRF / SQLi found but no evidence of exploitation. | Acknowledge < 1 h; contain < 4 h; communicate < 24 h |
| **SEV-3 (Minor)** | Localised issue, workaround exists, no data impact. | One user's data corrupted; one integration down for some users; non-security bug affecting a small subset. | Acknowledge < 4 h (business hours); fix < 3 business days |
| **SEV-4 (Low)** | Cosmetic, annoyance, no functional impact. | Typo; minor UI glitch. | Acknowledge < 1 business day; fix in next release |

## 2. Roles

- **Incident Commander (IC):** the person who coordinates the response. Defaults to the on-call engineer; can be handed off. The IC declares the severity, owns the timeline, calls for additional help.
- **Communications Lead:** writes the user-facing communication (email, in-app banner, status-page update). Defaults to the founder / product owner.
- **Technical Lead:** performs the containment + forensics. Defaults to the on-call engineer.
- **Legal / Compliance Lead:** assesses regulatory notification obligations (GDPR 72-hr, DPDP, etc.). Defaults to the founder until a legal counsel is engaged.

## 3. Detection

### How we detect incidents
- **Sentry alerts** — unhandled exceptions + performance anomalies (`src/lib/observability/sentry.ts`).
- **Prometheus alerts** — `deploy/prometheus/alerts.yml` + `monitoring/prometheus/alerts.yml`: error rate, p95 latency, DB connections, payment failures, SMTP failures.
- **Grafana dashboards** — `monitoring/grafana/` + `deploy/grafana/`: real-time visibility.
- **User reports** — feedback / crash reports (`/api/feedback`, `/api/feedback/crash`), support email, in-app feedback button (Shift+F).
- **External reports** — `security@acquisitionos.com` (see [SECURITY-POLICY.md](SECURITY-POLICY.md)).
- **Stripe / Razorpay** — webhook failures, dispute spikes, fraud alerts.
- **Google / Gmail** — OAuth token revocation spikes, Pub/Sub delivery failures.
- **Manual observation** — the on-call engineer notices a pattern in `dev.log`.

### Thresholds (auto-trigger an alert → page the on-call)
- Error rate > 5% sustained for 5 min.
- p95 latency > 5 s sustained for 10 min.
- Stripe webhook failure rate > 10% over 30 min.
- SMTP failure rate > 20% over 30 min.
- Auth failure rate > 30% over 5 min (credential stuffing indicator).
- DB CPU > 90% sustained 5 min.
- DB connection count > 80% of max.
- Sentry: any new `fatal`-level issue in production.

## 4. Step-by-Step Playbook (generic, applies to all SEV-1/2)

### Step 1 — Acknowledge + triage (≤ 15 min for SEV-1)
1. On-call engineer acknowledges the alert (Sentry / Prometheus / email).
2. Declare a severity (SEV-1/2/3/4) based on the definitions.
3. Open an incident channel (Slack / whatever exists) — name it `#incident-YYYY-MM-DD-short-desc`.
4. Post the initial summary: what's known, what's suspected, who's the IC, current severity.
5. If SEV-1, page the founder + the Communications Lead immediately.

### Step 2 — Contain (≤ 1 h for SEV-1)
1. **Stop the bleeding.** Examples:
   - If a user's account is compromised: revoke their sessions (`/api/settings/sessions/revoke-all`); disable their API keys; force password reset.
   - If an API route is being abused: disable it (comment out the route handler; deploy); or rate-limit harder.
   - If a webhook is being forged: rotate `STRIPE_WEBHOOK_SECRET` / Google Pub/Sub token.
   - If the DB is being exfiltrated: block the source IP at the gateway; rotate DB credentials.
   - If the app is down: restart via `keepalive-v2.sh`; if it won't start, restore `.env` via `ensure-env.sh` + the manual restart sequence in the keepalive script.
2. **Preserve evidence.** Snapshot `dev.log`, the DB (`scripts/backup/`), Sentry events, Prometheus metrics at the time of the incident. Don't delete logs.
3. **Communicate internally** every 30 min: "Still containing. Current status: …"

### Step 3 — Assess damage (≤ 4 h for SEV-1)
1. **What data was accessed / modified / deleted?** Query the audit log (`AuditLog`), the access logs, Sentry, Stripe webhook log, Google OAuth logs.
2. **Which users are affected?** List them.
3. **Was PII involved?** Lead emails, user emails, payment data, AI chat history?
4. **Is the vulnerability closed?** Verify the containment is effective (try to reproduce the attack against the contained system).

### Step 4 — Communicate (≤ 4 h for SEV-1, ≤ 24 h for SEV-2)
1. **Status page** — update the public status page (publish one when live) with: "We are investigating an issue with …"
2. **Affected users** — email them directly if their data was involved. Be honest: what happened, what data, what we're doing, what they should do (change password, review their leads).
3. **Regulatory notification** — if PII is involved:
   - **GDPR:** notify the supervisory authority within 72 hours of becoming aware. Use the lead supervisory authority's portal.
   - **DPDP:** notify the Data Protection Board of India "in such form and manner as may be prescribed" (rules not yet finalised — use the breach-notification format when published).
   - **Stripe / payment processors:** notify if card data may have been involved (they have their own notification flow).
4. **Internal stakeholders** — founder, investors (if material), team.

### Step 5 — Eradicate (≤ 24 h for SEV-1)
1. Close the root-cause vulnerability (the actual fix, not just the containment).
2. Verify the fix with a regression test.
3. Rotate any secrets that may have been exposed (see [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md) for the rotation procedure).
4. Re-deploy.

### Step 6 — Recover
1. Restore service to normal.
2. Verify with the QA checklist (smoke tests: signup, signin, discovery, outreach, payment, webhook).
3. Monitor for 24 h for recurrence.

### Step 7 — Post-mortem (within 5 business days)
1. Write a blameless post-mortem (Google's template): timeline, root cause, contributing factors, what went well, what went wrong, action items with owners + due dates.
2. Store the post-mortem in `/docs/security/incidents/YYYY-MM-DD-<short-desc>.md` (create the directory on the first incident).
3. Review the post-mortem with the team within 10 business days.
4. Track action items to completion; report status in the weekly engineering review.

## 5. Scenario-Specific Playbooks

### Scenario A — Compromised user account (credential stuffing)
1. Revoke all sessions for that user; disable API keys.
2. Force password reset; email the user with a reset link.
3. Check the audit log for what the attacker did (sent outreach? exported leads? changed billing?).
4. If the attacker sent outreach: pull the sends (we can't unsend, but we can BCC-reply "disregard"); log the abuse in the EmailUnsubscribe list if recipients complained.
5. If the attacker exported leads: the lead data is gone; notify the user; this is their data, not ours to chase, but we log it.
6. If the attacker changed billing: refund the unauthorized charge via `/api/admin/refund`; restore the original plan.
7. Post-mortem: how did the credential stuffing get through the rate limit? (Per-IP rate limit was the only defence — see [THREAT-MODEL.md](THREAT-MODEL.md) Scenario A.)

### Scenario B — Stripe webhook forgery (fake payment activation)
1. Check the `PaymentWebhook` log for entries where signature verification would have failed but didn't (this means `STRIPE_WEBHOOK_SECRET` leaked).
2. Rotate `STRIPE_WEBHOOK_SECRET` immediately in the Stripe dashboard + `.env`.
3. Audit all recently-activated subscriptions for ones without a matching valid Stripe event; refund / cancel the fraudulent ones via `/api/admin/refund` + subscription cancel.
4. Notify affected users (the ones whose "upgrades" were fraudulent) — they're not at fault; offer them the legitimate upgrade.
5. Post-mortem: how did the secret leak? (Git commit? Log line? CI env var exposed?)

### Scenario C — SSRF exploited (scraper hit cloud metadata)
1. If we run on AWS EC2: check whether the IAM role was used (CloudTrail); rotate the IAM credentials.
2. Patch the scraper with the SSRF allowlist (see [OWASP-COMPLIANCE.md](OWASP-COMPLIANCE.md) A10).
3. Enforce IMDSv2 on the host.
4. Audit logs for the offending user + ban if malicious.
5. Post-mortem: how long was the SSRF open? Did the attacker get credentials? What did they access with them?

### Scenario D — DB leak (SQLite file accessible)
1. If `db/custom.db` was ever downloadable (misconfigured static serving / public S3): assume all user data is compromised.
2. Rotate `JWT_SECRET` + `JWT_REFRESH_SECRET` immediately (forces all sessions to re-auth).
3. Force password reset for all users.
4. Rotate all OAuth tokens (re-prompt Gmail / Calendar connect).
5. Notify all users (this is a SEV-1; 72-hr GDPR / DPDP notification).
6. Post-mortem: how was the file exposed?

### Scenario E — AI cost abuse (one user burns $5k of AI in a day)
1. Identify the user via `AiCostRecord` aggregate per user per day.
2. If they're on a plan whose credits wouldn't cover it: someone bypassed the credit gate — investigate.
3. If they bought legitimate credit packs: it's not an incident; it's a revenue event (but monitor for the pattern).
4. If they bypassed: disable their API keys; suspend their account; refund any credit-pack purchase they made as a cover.
5. Post-mortem: how was the credit gate bypassed? (Race condition? Direct API call without credit deduction?)

### Scenario F — Service down (dev server won't respond)
1. Run `keepalive-v2.sh` (it does nothing if healthy; restores env + restarts if not).
2. If still down after keepalive: manual restart sequence (in `keepalive-v2.sh` comments):
   ```
   pkill -9 -f 'next'; sleep 2; ensure-env.sh; mv src/middleware.ts src/middleware.ts.disabled 2>/dev/null; cp node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node node_modules/next/dist/server/; setsid npx next dev -p 3000 > dev.log 2>&1 &
   ```
3. Wait 25 s; curl localhost:3000; if 200, recover; if not, inspect dev.log for the compile error.
4. Common causes: `.env` wiped (sandbox) → `ensure-env.sh`; SWC binary missing → `cp` step; syntax error in a file (the "Ecmascript file had an error" log) → fix the file.

### Scenario G — Deliverability disaster (Gmail marks our sends as spam)
1. Check the bounce rate via `EmailBounce` + `gmail-delivery-service.ts` logs.
2. If our sending domain is flagged (we don't have a shared sending domain — per-user Gmail — but if Resend is used as fallback, Resend's domain could be flagged): pause Resend; force per-user Gmail OAuth; notify users to warm up.
3. Notify affected users: "Our email deliverability dropped; some of your outreach may have landed in spam. We're working on it. Meanwhile, check your sent folder."
4. Post-mortem: what caused the spike? (One user's spam complaints? A new outreach template that triggered filters?)

## 6. Communication Templates

### Initial status-page update (SEV-1, ≤ 30 min)
> "We are investigating an issue affecting [feature]. We'll update here within 60 minutes or sooner as we learn more. Last updated: [timestamp]."

### User email (data breach, SEV-1, ≤ 4 h)
> Subject: Security incident — action may be required.
> Body: We recently identified a security incident that may have affected your account. Here's what we know: [what + when]. Here's what data was involved: [data]. Here's what we're doing: [containment + fix]. Here's what you should do: [change password + review leads + ...]. We're sorry this happened. We'll post a full post-mortem at [link] within 5 business days. Contact: security@acquisitionos.com.

### Regulatory notification (GDPR Article 33, ≤ 72 h)
> Submit to the supervisory authority's breach portal: nature of the breach, categories + approximate number of data subjects + records, likely consequences, measures taken + proposed, contact for the DPO.

## 7. Post-Mortem Template

```
# Incident YYYY-MM-DD — <short description>

## Summary
One-paragraph what-happened.

## Timeline (all times UTC)
- HH:MM — detection (how)
- HH:MM — acknowledgement
- HH:MM — containment
- HH:MM — fix deployed
- HH:MM — recovery verified
- HH:MM — incident closed

## Severity
SEV-X (justification)

## Root cause
Technical explanation.

## Contributing factors
- Factor 1
- Factor 2

## What went well
- Thing 1

## What went wrong
- Thing 1

## Action items
- [ ] Action 1 — owner — due date
- [ ] Action 2 — owner — due date

## Lessons learned
- Lesson 1

## Notifications sent
- Users: yes/no — link
- Regulator: yes/no — date
- Status page: yes/no — link
```

## 8. On-Call Rotation

- **Current:** founder + 1 engineer, weekly rotation, 24/7.
- **Handoff:** Monday 10:00 IST; the outgoing on-call writes a handoff note in the incident channel.
- **Escalation:** SEV-1 → page founder immediately. SEV-2 → page within 1 h. SEV-3 → within 4 h business hours.
- **Tools:** Sentry + Prometheus alerts route to the on-call's phone (PagerDuty / Opsgenie when formalised).

## 9. Drills

- **Quarterly** — run a tabletop exercise of one scenario from §5.
- **After every real incident** — review the playbook against what actually happened; update.

## 10. Review Cadence

- **Quarterly** — review this document, the alert thresholds, the on-call rotation, the contact list.
- **After every incident** — review the playbook + the templates.

---

*See also: [SECURITY-POLICY.md](SECURITY-POLICY.md), [THREAT-MODEL.md](THREAT-MODEL.md), [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md), [../operations/ON-CALL-RUNBOOK.md](../operations/ON-CALL-RUNBOOK.md), [RELIABILITY improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-6--reliability-improvements).*
