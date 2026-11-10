# AcquisitionOS — Personal Data Inventory (DPDP)

**Last updated:** 2026-11-10
**Owner:** Data Protection Officer (dpo@acquisitionos.com)
**Source of truth:** `prisma/schema.prisma` (119 models, 49 carry personal data)

## 1. Inventory by category

### 1.1 Account & profile information

| Field(s) | Prisma model | Purpose | Legal basis | Storage | Retention | Deletion |
|---|---|---|---|---|---|---|
| email | User | Account identity, signin | Contract / consent | Primary DB | Until account deletion + 30-day grace | Soft-delete then hard-delete |
| name | User | Personalization | Consent | Primary DB | Until account deletion | Anonymized on deletion |
| phone | User | WhatsApp/OTP | Consent (optional) | Primary DB | Until account deletion | Anonymized |
| passwordHash | User | Authentication | Contract | Primary DB | Until account deletion | Hard-deleted (bcrypt) |
| googleId | User | OAuth signin | Consent (OAuth) | Primary DB | Until OAuth revocation | Hard-deleted |

### 1.2 Authentication & session data

| Field(s) | Prisma model | Purpose | Legal basis | Retention | Deletion |
|---|---|---|---|---|---|
| refreshToken | UserSession | Session continuity | Contract | 30 days absolute | Revoked on signout |
| ipAddress, userAgent | UserSession, LoginHistory, SecurityAlert | Security | Legitimate interest (security) | 30-90 days | Anonymized via enforceRetention() |
| MFA secret | MfaConfig | Multi-factor auth | Contract | Until MFA disabled | Hard-deleted |

### 1.3 Business & lead-related information

| Field(s) | Prisma model | Purpose | Legal basis | Retention | Deletion |
|---|---|---|---|---|---|
| businessName, ownerName, email, phone, whatsapp, linkedin, etc. | Lead | Lead management, outreach | Legitimate interest (B2B) + consent | Until user deletes lead | Hard-deleted via DELETE /api/leads/[id] |
| notes | LeadNote | User annotations | Contract | Until lead deletion | Cascade-deleted |
| analysis | LeadAnalysis | AI analysis output | Consent (AI usage) | Until lead deletion | Cascade-deleted |

### 1.4 Outreach & communication data

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| subject, content | OutreachMessage | Outreach history | Until lead deletion | Cascade-deleted |
| fromEmail, toEmail, subject, bodyPlain, bodyHtml | EmailMessage | Email thread history | 365 days per retention policy | Hard-deleted by enforceRetention() |
| content | ConversationMessage | Conversation history | Until lead deletion | Cascade-deleted |

### 1.5 AI prompts & responses

| Field(s) | Prisma model | Purpose | Retention | Status |
|---|---|---|---|---|
| content (user prompts + AI responses) | AiChatMessage | AI chat history | 180 days | ✅ Enforced |
| result JSON | ModelInvocation | Per-step workflow AI output | (not defined) | ⚠️ Gap |
| content (reasoning chain) | AgentMemory | Agent execution memory | (not defined) | ⚠️ Gap |
| content (template + variables) | PromptTemplate | Prompt templates | Until user deletion | ✅ Cascade-deleted |

### 1.6 Uploaded files & documents

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| fileName, content, chunks, embedding | FileContext | RAG over user-uploaded docs | Until user deletion | Hard-deleted via file deletion API |
| content | RagDocument | RAG chunk store | Until user deletion | Hard-deleted with FileContext |

### 1.7 Billing & subscription data

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| stripeCustomerId, razorpaySubscriptionId | Subscription | Subscription management | 7 years (tax compliance) | Retained for 7 years |
| amount, gstNumber | PaymentOrder, Invoice | Billing records, tax | 7 years | Retained for 7 years |
| creditsTotal, creditsUsed | Subscription | Entitlement | Until account deletion + 30 days | Hard-deleted after grace |

### 1.8 Usage & activity records

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| feature, action, count | UsageTracking | Usage analytics | 90 days | Hard-deleted by enforceRetention() |
| action, details, ipAddress | AuditLog | Tamper-evident audit chain | 365 days | Hard-deleted by enforceRetention() |

### 1.9 AI cost tracking

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| feature, model, inputTokens, outputTokens, costUsd | AiCostRecord | AI cost tracking | 365 days | Hard-deleted |

### 1.10 Support & communication records

| Field(s) | Prisma model | Purpose | Retention | Deletion |
|---|---|---|---|---|
| subject, description | SupportTicket | Support case | Until resolution + 90 days | Hard-deleted |
| content | SupportTicketMessage | Support conversation | Until resolution + 90 days | Cascade-deleted |
| stackTrace, userAgent | CrashReport, FeedbackReport | Bug reports | Until resolution + 90 days | Hard-deleted |

## 2. Retention enforcement status

| Category | Stated retention | Enforcement | Status |
|---|---|---|---|
| user_sessions | 30 days | enforceRetention() | ✅ Enforced |
| login_history | 90 days | enforceRetention() | ✅ Enforced |
| audit_logs | 365 days | enforceRetention() | ✅ Enforced |
| email_messages | 365 days | enforceRetention() | ✅ Enforced |
| notifications | 90 days | enforceRetention() | ✅ Enforced |
| ai_chat_history | 180 days | enforceRetention() | ✅ Enforced |
| security_alerts | 365 days | enforceRetention() | ✅ Enforced |
| usage_analytics | 90 days | enforceRetention() | ✅ Enforced |
| api_key_usage | 90 days | enforceRetention() | ✅ Enforced |
| financial_records | 2555 days (7 years) | No-op (retained) | ✅ Compliant |
| workflow_logs | 90 days | enforceRetention() | ✅ Enforced |
| ModelInvocation | (not defined) | None | ❌ Gap |
| AgentMemory | (not defined) | None | ❌ Gap |

**Critical fix in this implementation:** `enforceRetention()` is now auto-scheduled via the instrumentation heartbeat (24-hour cooldown, env-overridable). Previously it was only invokable via super_admin API.

## 3. AI data-flow summary

| Operation | Source model(s) | Data sent to AI provider | Default provider |
|---|---|---|---|
| AI Chat | User-typed message + lead context | Message text, lead name/niche/stage | Z-AI |
| Lead Analysis | Lead | businessName, ownerName, email, phone, website, niche, city, country | Z-AI |
| Lead Scoring | Lead | Same as Lead Analysis | Z-AI |
| Outreach Generation | Lead + business profile | businessName, ownerName, niche, channel, tone, language | Z-AI |
| Lead Enrichment | Lead + scraped website content | Full lead PII + 3000 chars of website HTML | Z-AI (direct call, now with audit trail) |
| RAG Ingestion | FileContext.content | Chunked file content | Z-AI |
| Agent Runtime | AgentMemory | Full agent conversation | Per-agent configured |
| Reply Intelligence | EmailMessage.bodyPlain | Incoming email reply text + prior outreach context | Z-AI |

## 4. Gaps requiring remediation

1. ~~`enforceRetention()` is not scheduled~~ → ✅ FIXED in this implementation (24h tick in heartbeat)
2. ~~Lead enrichment bypasses audit trail~~ → ✅ FIXED in this implementation (userId + leadId threaded through, AiCostRecord + AuditLog recorded)
3. Missing retention rules for `ModelInvocation`, `AgentMemory`, `MeetingIntentLog`, `RagDocument`, `FileContext`, `OutreachMessage`
4. No 30-day hard-delete after `User.deletedAt` is set (message says "permanently deleted within 30 days" but no job enforces it)
5. Vector "embeddings" use chat completions — `vector-search-service.ts` asks the LLM to produce a numeric vector from a chat prompt containing lead PII. Should use a real embeddings API.
6. Z-AI DPA / no-train attestation — pending. Disclosed honestly in privacy policy Section 11A.

## 5. Data subject rights workflow

| Right | Endpoint | Timeline | Status |
|---|---|---|---|
| Access | `POST /api/settings/account/export-request` | 48h ack, 30d delivery | ✅ Implemented |
| Correction | `PUT /api/settings/profile` | Immediate | ✅ Implemented |
| Erasure | `POST /api/settings/delete-account` + `POST /api/gdpr/delete` | 30-day grace then hard delete | ✅ Implemented |
| Consent withdrawal | `POST /api/gdpr/consent` (per-purpose) | Immediate | ✅ Implemented |
| Grievance | Email dpo@acquisitionos.com | 48h ack, 30d substantive | ✅ Documented |

## 6. Security controls summary

| Control | Implementation | Status |
|---|---|---|
| Encryption in transit | TLS 1.2/1.3 (nginx), HSTS preload | ✅ Configured |
| Encryption at rest (credentials) | AES-256-GCM for UserAIProvider, EmailAccount, GoogleCalendarToken | ✅ Implemented |
| Access control | Custom JWT + RBAC (7 roles, 57 permissions) | ✅ Implemented |
| Audit trails | Tamper-evident hash-chained AuditLog | ✅ Implemented |
| Data retention | enforceRetention() engine + auto-scheduled | ✅ Enforced (this impl) |
| Backups | scripts/backup/backup.sh + GFS retention | ✅ Implemented |
| Incident detection | In-app AlertEngine + Prometheus rules + Alertmanager | ✅ Implemented (this impl) |
| Vendor due diligence | Per-provider DPA tracking | ⚠️ Z-AI + DeepSeek DPAs pending |
