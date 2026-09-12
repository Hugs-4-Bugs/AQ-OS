# Data Privacy Policy — AcquisitionOS

> Owner: Legal + Engineering. Status: Living document. Last reviewed: 2026-09-09.
> This is the *internal* privacy posture document. The *user-facing* privacy policy is at [../legal/PRIVACY-POLICY.md](../legal/PRIVACY-POLICY.md).
> Source: `prisma/schema.prisma`, `src/lib/compliance/retention.ts`, `src/app/api/settings/account/{export-request,delete-request}/route.ts`, `src/app/(public)/legal/*`.

## 1. What User Data Is Collected

### Account data
- **Email** (unique identifier; required).
- **Name** (optional).
- **Avatar** (optional; uploaded image).
- **Phone** (optional).
- **Country** (optional).
- **Company** (optional).
- **Password** (bcrypt-hashed; never stored in plaintext).
- **Google ID** (if signed in with Google; OAuth sub).
- **Auth provider** (`email` / `google`).

### Authentication & security data
- **OTP codes** (email verification, login OTP, password reset) — stored hashed with short TTL.
- **Magic link tokens** — stored hashed with 15-min TTL; single-use.
- **MFA TOTP secret + backup codes** — secret stored; backup codes bcrypt-hashed.
- **Sessions** — refresh-token hash, device info, IP, user-agent, expiry, revoked flag.
- **Known devices** — fingerprint, user-agent, IP, trusted flag.
- **Security alerts** — type, severity, IP, resolved status.
- **Login history** — timestamp, IP, user-agent, success/failure.

### Usage data
- **Leads** the user discovers / imports — business name, website, email, phone, address, niche, scores, stage, activity timeline.
- **Outreach messages** — generated + sent content, channel, status.
- **Communications** — inbound + outbound email content, classification, buying signals.
- **Meetings** — title, time, attendees (email + name), agenda, notes, Meet link.
- **AI chat history** — sessions + messages (the user's prompts + AI responses).
- **RAG documents** — content the user ingested (URLs, text, CSV).
- **API keys** — name, hash, scopes, usage logs (endpoint, method, status, IP).
- **Billing** — plan, payment history, invoices, Stripe / Razorpay customer IDs (no card numbers).
- **Integrations** — Gmail / Calendar OAuth tokens (encrypted), Telegram chat ID, WhatsApp number.

### Device / telemetry data
- **IP address** (on every request; logged for security + rate limit).
- **User-agent** (logged for security + device tracking).
- **Crash reports** (auto-captured client crashes; stack trace, URL, user-agent).
- **Feedback** (user-submitted; type, subject, body).

### What we do NOT collect
- We do not read the user's Gmail inbox beyond what's needed for reply classification + sync (and only after they explicitly connect Gmail).
- We do not sell or share user data with third parties for their marketing.
- We do not track the user across other websites (no third-party analytics cookies).
- We do not collect biometric data.

## 2. Why Each Data Type Is Collected

| Data | Why | Legal basis (GDPR) | Legal basis (DPDP) |
|---|---|---|---|
| Account email + name | To provide the service; communicate | Contract | Consent / Contract |
| Password (hashed) | Authentication | Legitimate interest | Legitimate use |
| Google ID | Authentication alternative | Consent | Consent |
| OTP / magic link tokens | Authentication security | Legitimate interest | Legitimate use |
| MFA secret | Account security | Consent | Consent |
| Sessions / devices / login history | Security + fraud prevention | Legitimate interest | Legitimate use |
| Leads (the user's prospect list) | The user created this data to use the service | Contract | Consent |
| Outreach + communications | To provide the outreach + reply feature | Contract | Consent |
| Meetings | To provide the meeting-scheduling feature | Contract | Consent |
| AI chat history | To provide the AI assistant | Contract | Consent |
| API keys + usage | To provide + secure the API | Contract | Consent |
| Billing + invoices | To process payment; legal tax obligation | Contract + Legal obligation | Legal obligation |
| OAuth tokens (Gmail, Calendar) | To provide the integrations | Consent | Consent |
| IP + user-agent | Security, rate limit, fraud | Legitimate interest | Legitimate use |
| Crash reports | To fix bugs | Legitimate interest | Legitimate use |
| Feedback | To improve the product | Consent | Consent |

## 3. How Data Is Stored

- **Database:** SQLite (current) → PostgreSQL (target). Hosted on the deployment platform (Aliyun FC / Vercel / Railway / Supabase).
- **Encryption at rest:**
  - ✅ Passwords (bcrypt).
  - ✅ OAuth tokens (AES-256-GCM, `src/lib/encryption.ts`).
  - ✅ API keys (SHA-256 hash).
  - ❌ PII (lead emails, communication bodies) — plaintext in DB. **Roadmap: encrypt.**
- **Encryption in transit:** HTTPS (TLS 1.2+) for all traffic; SMTP TLS; Gmail API / Resend over HTTPS.
- **Backups:** `scripts/backup/` — daily snapshots; `db/custom.db` file copy. Stored on the same platform (encrypted-at-rest by the platform).
- **Logs:** `dev.log` + structured logs via `src/lib/observability/`. PII scrubbed (email bodies not logged). IP + user-agent logged for security.

## 4. How Long Data Is Retained

`src/lib/compliance/retention.ts` defines the retention policy.

| Data | Retention | Rationale |
|---|---|---|
| Account (active) | Until the user deletes their account | User control |
| Account (after deletion request) | 30 days hard delete | DPDP / GDPR right to deletion; grace period for fraud recovery |
| Sessions | 30 days (refresh-token TTL) | Authentication |
| Known devices | 1 year | Security + device-recognition |
| Login history | 1 year | Security forensics |
| Security alerts | 1 year | Security forensics |
| Audit log | 1 year hot, 3 years cold | Legal / tax / SOC 2 |
| Leads | Until the user deletes them | User control |
| Communications | Until the user deletes them | User control |
| Meetings | Until the user deletes them | User control |
| AI chat history | Until the user deletes it | User control |
| Crash reports | 90 days | Bug-fixing |
| Feedback | Until resolved + 1 year | Product improvement |
| Invoices + billing records | 7 years (tax law) | Legal obligation |
| Email unsubscribe list | Indefinite (until the lead requests deletion) | CAN-SPAM / GDPR compliance |
| Backups | 30 days rolling | Disaster recovery |

**Retention enforcement:** a scheduled cleanup job (`end-of-period` cron) deletes past-retention records. Account deletion (`/api/settings/delete-account` + `/api/settings/account/delete-request`) hard-deletes the user + their owned data after the 30-day grace period.

## 5. Who Has Access

- **The user** — their own data via the dashboard + API.
- **The platform operator (Ananya)** — admin endpoints (`/api/admin/*`) for support / refunds / feedback. Admin access is logged in `AuditLog`.
- **Engineering** — production DB access only via break-glass procedure (logged); no standing access.
- **Sub-processors:**
  - **Stripe / Razorpay** — payment data (card numbers held by them; we hold only order IDs).
  - **Google** — OAuth tokens (we hold them encrypted; Google holds the account).
  - **Z-AI** — prompts + content the user asks the AI to process (we send; Z-AI processes; we don't know their retention — to verify in their DPA).
  - **Google Custom Search** — search queries (we send; CSE processes).
  - **Resend / SMTP provider (Gmail)** — outreach emails (we send; they deliver).
  - **Sentry** — error + crash data (PII scrubbed before send).
  - **Hosting platform** (Aliyun FC / Vercel / Railway / Supabase) — the DB + the app.
- **No other third parties** get user data, except where required by law (see below).

## 6. How Users Can Request Deletion

### Account deletion
- **UI:** Settings → Account → "Delete account" → `POST /api/settings/account/delete-request` (creates a `GdprRequest` with 30-day grace) → after 30 days, the `end-of-period` cron hard-deletes the user + their leads / communications / meetings / API keys / sessions.
- **During the 30-day grace:** the user can cancel the deletion by signing in.
- **Hard delete:** removes the `User` row + all `CASCADE`-dependent rows (leads, meetings, communications, API keys, sessions, audit-log entries that reference the user — the audit log retains `userId` for forensic integrity but the user record is gone; the audit log entry's `details` may still mention the email — we redact on hard delete).
- **What survives:** anonymised analytics (aggregated counts, no user ID); invoices + billing records (legal / tax retention); the audit log entries (with the user reference redacted to "deleted-user").

### Data export (DSAR / GDPR Article 15 / DPDP access)
- **UI:** Settings → Account → "Export my data" → `POST /api/settings/account/export-request` → creates a `GdprRequest` + a `DataExport` job → the job assembles a JSON/CSV bundle of the user's data → `downloadUrl` emailed to the user → expires in 7 days.
- **Scope:** profile, leads, communications, meetings, AI chat history, API keys (metadata only — no raw key), billing history, audit log entries for the user.

### Direct email
- Users can email `privacy@acquisitionos.com` (publish when live) for any data-rights request. SLA: 30 days (GDPR) / 30 days (DPDP).

## 7. GDPR Compliance Status

- ✅ **Lawful basis** documented per data type (above).
- ✅ **Right to access** — data export (`/api/settings/account/export-request`).
- ✅ **Right to rectification** — settings page (profile, password, etc.).
- ✅ **Right to erasure** — account deletion (`/api/settings/account/delete-request`).
- ✅ **Right to restrict processing** — deactivate account (via support).
- ✅ **Right to data portability** — data export (JSON + CSV).
- ✅ **Right to object** — opt-out of marketing email (cookie consent + email unsubscribe).
- ✅ **Consent management** — cookie consent banner (`src/components/cookie-consent-banner.tsx`); withdrawal via the banner.
- 🟡 **Data Processing Addenda (DPAs)** — needed with each sub-processor. **Status:** to sign with Stripe, Google, Z-AI, Resend, Sentry, hosting. **Roadmap.**
- 🟡 **Records of Processing Activities (Article 30)** — this document + the audit log. **Roadmap:** formalise a single register.
- 🟡 **Data Protection Officer (DPO)** — not appointed (not strictly required for our scale, but recommended). **Roadmap:** appoint when we cross 250 employees OR sensitive-data processing thresholds.
- 🟡 **Data Protection Impact Assessment (DPIA)** — not yet performed. **Roadmap:** perform a DPIA for the lead-discovery + AI-outreach features (they process prospect PII without the prospect's consent — see below).
- ❌ **Cross-border transfer safeguards** — sub-processors are US/EU; we need Standard Contractual Clauses (SCCs) in the DPAs. **Roadmap.**
- ❌ **72-hour breach notification** — process not yet defined; see [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md). **Roadmap.**

## 8. Indian DPDP Act Compliance Status

- ✅ **Consent** — cookie consent banner; signup consent; integration consent (Gmail/Calendar connect).
- ✅ **Right to access + correction + erasure** — data export + account deletion.
- ✅ **Data retention** — defined in `retention.ts`.
- 🟡 **Data Fiduciary registration** — AcquisitionOS is a "Data Fiduciary" under DPDP. **Roadmap:** register with the Data Protection Board of India when the threshold is crossed.
- 🟡 **Significant Data Fiduciary** — we are unlikely to be designated "significant" at our scale, but if we are, additional obligations (DPO, DPIA, audit) apply. **Roadmap:** monitor.
- 🟡 **Data localisation** — DPDP allows cross-border to "permitted countries" (rule not yet finalised). Currently data is on Aliyun FC (Hong Kong region for some preview deploys) + Vercel/Railway/Supabase (US/EU). **Roadmap:** India-region deployment for Indian users when DPDP rules are finalised.
- ❌ **Consent Manager** — not yet integrated. **Roadmap:** integrate a DPDP-compliant Consent Manager when the spec is finalised.
- ❌ **Grievance Officer** — not yet appointed + published. **Roadmap:** appoint + publish contact on the privacy policy.

## 9. Special Considerations

### Lead / prospect PII (the user's prospects)
- The user discovers prospects (their email, phone, business name) via Google Custom Search + scraping.
- **Consent of the prospect:** the prospect did NOT consent to being on a lead list. We rely on the user's "legitimate interest" (GDPR) / "legitimate use" (DPDP) for B2B prospecting within the CAN-SPAM / GDPR direct-marketing rules.
- **CAN-SPAM compliance:** every outreach email has a postal address + an unsubscribe link + a clear subject. We honor unsubscribes within 1 business day via the `EmailUnsubscribe` table.
- **GDPR Article 14** (data collected not from the data subject): the user must inform the prospect "we obtained your contact details from [public source]" in their outreach. **We provide a template** but **the user is responsible** for compliance. This is documented in the [TERMS-OF-SERVICE.md](../legal/TERMS-OF-SERVICE.md) (the user indemnifies AcquisitionOS for their outreach content).
- **Right of the prospect to object:** the prospect can reply "unsubscribe" or click the unsubscribe link; we honor it. The prospect can also email `privacy@acquisitionos.com` directly.

### AI processing
- The user's prompts + the AI's responses are sent to Z-AI (sub-processor). **We don't use user data to train models** (to confirm in the Z-AI DPA). **Roadmap.**
- RAG ingested content (URLs, text) is processed by Z-AI's embedding + chat. **Roadmap:** mark RAG content as "untrusted" in prompts (prompt-injection defence).

### Children
- We do not knowingly collect data from children under 16. Sign-up requires an email + the product is B2B (no minor use case). If we learn of a minor's account, we delete it.

### Data breaches
- See [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md). 72-hour notification to the supervisory authority (GDPR) / Data Protection Board (DPDP) is the target.

## 10. Review Cadence

- **Quarterly** — this document + the retention policy + the sub-processor list.
- **On each new sub-processor** — update the list + sign a DPA.
- **On each new data type collected** — update this document + the privacy policy + assess lawful basis.
- **On each regulatory change** (GDPR / DPDP / CAN-SPAM) — review + update.

---

*See also: [../legal/PRIVACY-POLICY.md](../legal/PRIVACY-POLICY.md), [../legal/TERMS-OF-SERVICE.md](../legal/TERMS-OF-SERVICE.md), [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md), [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md), [COMPLIANCE/LEGAL improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-8--compliance-and-legal-improvements).*
