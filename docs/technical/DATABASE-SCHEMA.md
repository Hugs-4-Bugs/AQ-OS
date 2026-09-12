# Database Schema — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source of truth: `prisma/schema.prisma` (2832 lines, 90+ models). The exhaustive per-field reference is in [`docs/02-architecture/DATABASE-SCHEMA.md`](../02-architecture/DATABASE-SCHEMA.md). This document is the navigable summary: every model, its purpose, key fields, relations, and indexes.

## Provider

- **Current:** SQLite (`datasource db { provider = "sqlite" }`).
- **Target:** PostgreSQL. The schema header annotates every field with migration-safety tags (`[MIGRATE-SAFE]`, `[MIGRATE-CAUTION]`, `[MIGRATE-RISK]`). Migration is planned before ~500 paying accounts (see ADR-012).
- **IDs:** `cuid()` strings throughout.
- **Timestamps:** Prisma `DateTime` (ISO-8601).
- **JSON fields:** stored as `String` in SQLite (Prisma limitation); parse on read. Will move to Prisma `Json` type on PostgreSQL.

## Model Index (90+ models, grouped)

### User & Auth (12)
| Model | Purpose | Key fields | Notable relations |
|---|---|---|---|
| **User** | Root entity; the person using the app | email (unique), name, avatar, passwordHash, googleId (unique), emailVerified, plan, credits, creditsMonthly, rolloverCredits, isTrial, trialEndsAt, role, orgId, authProvider, emailVerificationOtp(+Expiry), resetOtp(+Expiry), loginOtp(+Expiry), magicLinkToken(+Expiry), otpAttemptCount, otpLockedUntil, isActive, lastLoginAt | → Subscription, CreditsLedger, PaymentOrder, Lead, Meeting, ApiKey, AuditLog, UserSettings, MfaConfig, UserSession, KnownDevice, SecurityAlert, etc. |
| **Organization** | Team / company | name, slug, ownerId, plan, settingsJson | → User (owner), OrgMember, Invite |
| **OrgMember** | Membership | userId, orgId, role (owner/admin/member/viewer), invitedBy, joinedAt | → User, Organization |
| **Invite** | Pending team invite | email, orgId, role, token, expiresAt, invitedBy | → Organization |
| **UserSession** | Refresh-token record for revocation | userId, refreshToken (hashed), deviceInfo, ipAddress, userAgent, expiresAt, isRevoked | → User |
| **MfaConfig** | TOTP MFA per user | userId, secret, backupCodesHash, isEnabled, verifiedAt | → User |
| **KnownDevice** | Device fingerprint + trust | userId, fingerprint, userAgent, ipAddress, lastSeen, trusted | → User |
| **SecurityAlert** | Suspicious-login alerts | userId, type, severity, details, ipAddress, resolved, resolvedAt | → User |
| **Notification** | In-app + push notifications | userId, type, title, message, read, createdAt | → User |
| **NotificationPreferences** | Per-user channel prefs | userId, email, push, inApp, sms, whatsapp, telegram | → User |
| **UserSettings** | App preferences + meeting prefs | userId, theme, compactView, defaultCountry, defaultNiche, notificationPrefs (JSON), timezone, meetingPlatform, meetingDurationDefault, meetingBufferMinutes, meetingWorkingHours*, meetingWorkingDays, meetingTimezone, meetingAutoSchedule, meetingAutonomyMode, meetingRemindersEnabled, meetingReminderMinutes, meetingEmailConfirmation, meetingEmailReminder, calendarSyncEnabled, calendarWatchEnabled, googleCalendarConnected, gmailConnected, gmailEmail | → User |
| **AuditLog** | Append-only audit trail | userId, action, details, resource, resourceId, ipAddress, createdAt | → User |

### Subscription & Billing (8)
| Model | Purpose | Key fields |
|---|---|---|
| **Subscription** | User's current plan | userId, plan, status, stripeCustomerId, stripeSubscriptionId, razorpaySubscriptionId, currentPeriodStart, currentPeriodEnd, cancelAt, cancelledAt, isTrial, trialEndsAt |
| **CreditsLedger** | Credits in/out ledger | userId, action, cost, balanceAfter, referenceId, createdAt |
| **PaymentOrder** | Order for a plan / pack | userId, amount, currency, provider (stripe/razorpay), providerOrderId, status, plan, metadata |
| **PaymentWebhook** | Idempotent webhook record | provider, eventId, processedAt, payloadHash |
| **Invoice** | Generated invoice | userId, paymentOrderId, number, amount, tax, total, pdfUrl, status |
| **Coupon** | Discount code | code, percentOff, amountOff, currency, maxRedemptions, redeemedCount, expiresAt, active |
| **CouponRedemption** | Coupon use record | couponId, userId, paymentOrderId |
| **TaxRate** | Tax rate (GST) | country, state, rate, hsn, label |

### Lead & Pipeline (10)
| Model | Purpose | Key fields |
|---|---|---|
| **Lead** | A prospect business | userId, orgId, businessName, ownerName, website, email, phone, whatsapp, linkedin, instagram, facebook, googleMapsListing, reviews, rating, estimatedQuality, estimatedRevenue, city, country, niche, replyScore, conversionScore, urgencyScore, revenuePotentialScore, scoreReasoning, stage, emailStatus, lastContactedAt, techStack (JSON) | → LeadAnalysis, LeadScore, LeadNote, LeadActivity, OutreachMessage, Communication, Meeting, Deal |
| **LeadAnalysis** | AI analysis snapshot | leadId, analysisType, result (JSON), createdAt |
| **LeadScore** | AI scores + reasoning | leadId, replyScore, conversionScore, urgencyScore, revenuePotentialScore, reasoning |
| **LeadNote** | User note on a lead | leadId, userId, content, pinned |
| **LeadActivity** | Activity timeline | leadId, type, description, metadata (JSON), createdAt |
| **PipelineStage** | Default stages | userId, name, order, color |
| **PipelineCustomStage** | Org custom stages | orgId, name, order, color |
| **Communication** | Outreach / reply log | leadId, channel, direction, content, messageGeneratedByAI, responseSummary, intent, buyingSignals, hesitationReasons |
| **Deal** | Won/in-progress deal | leadId, userId, value, currency, expectedCloseDate, stage, probability, source |
| **FollowUpReminder** | Reminder to follow up | leadId, userId, message, dueAt, completedAt |

### Outreach & Email (11)
| Model | Purpose | Key fields |
|---|---|---|
| **OutreachMessage** | Generated outreach record | leadId, userId, channel, subject, body, status (draft/sent/failed), metadata |
| **OutreachSequence** | Multi-step campaign | userId, name, steps (JSON), status |
| **SequenceStep** | One step of a sequence | sequenceId, order, delayMinutes, channel, template |
| **SequenceEnrollment** | Lead enrolled in a sequence | sequenceId, leadId, currentStep, enrolledAt, status |
| **EmailAccount** | Connected Gmail/SMTP | userId, provider, gmailEmail, accessToken (enc), refreshToken (enc), status |
| **EmailThread** | Email thread | userId, gmailThreadId, leadId, subject, snippet |
| **EmailMessage** | Single email | threadId, from, to, cc, bcc, subject, body, direction, read, receivedAt |
| **EmailBounce** | Bounce record | userId, email, bounceType, permanent |
| **EmailUnsubscribe** | Unsubscribe list | userId, email, reason, createdAt |
| **EmailOpenEvent** | Open tracking | messageId, openedAt, ipAddress, userAgent |
| **EmailClickEvent** | Click tracking | messageId, linkId, url, clickedAt |

### Meetings & Calendar (4)
| Model | Purpose | Key fields |
|---|---|---|
| **Meeting** | Scheduled meeting | userId, leadId, dealId, title, meetingType, platform, meetingUrl, calendarEventId, status, startDateTime, endDateTime, durationMinutes, timezone, agenda, attendees (JSON), location, conferenceData (JSON), createdBy, approvalStatus |
| **MeetingIntentLog** | Detected meeting intent | userId, leadId, sourceText, detectedIntent, confidence |
| **MeetingReminder** | Reminder for a meeting | meetingId, remindAt, type, minutesBefore, sent |
| **GoogleCalendarToken** | OAuth token for Calendar | userId, calendarEmail, accessToken (enc), refreshToken (enc), tokenExpiry, scope, status, isConnected, lastSyncAt |
| **CalendarWatch** | Push-channel for Calendar | userId, channelId, resourceId, calendarEmail, expiration, status |

### AI (6)
| Model | Purpose | Key fields |
|---|---|---|
| **AiChatSession** | Chat session | userId, title, context (JSON), createdAt |
| **AiChatMessage** | Chat message | sessionId, role, content, tokensUsed, costUsd, createdAt |
| **AiCostRecord** | AI cost tracking | userId, action, provider, tokensIn, tokensOut, costUsd, createdAt |
| **PromptTemplate** | Prompt library | userId (nullable for system), name, category, prompt, variables, isPublic |
| **RagDocument** | RAG ingested doc | userId, source, content, embedding, metadata |
| **FileContext** | Uploaded file context | userId, filename, mimeType, size, content |

### Workflows (6)
| Model | Purpose | Key fields |
|---|---|---|
| **WorkflowDefinition** | Workflow blueprint | userId, name, description, trigger, steps (JSON), status |
| **WorkflowStep** | One step (legacy) | workflowId, type, config, nextStepId |
| **WorkflowExecution** | A run | workflowId, status, trigger, context (JSON), startedAt, completedAt |
| **WorkflowLog** | Execution log | executionId, level, message, timestamp |
| **WorkflowTemplate** | Pre-built template | name, category, description, definition (JSON) |
| **DeliveryDeadLetter** | Failed delivery | userId, channel, payload, error, attempts, lastAttemptAt |

### Competitors (3)
| Model | Purpose | Key fields |
|---|---|---|
| **CompetitorData** | Tracked competitor | userId, name, website, domain |
| **CompetitorAnalysis** | Analysis snapshot | competitorId, type, result (JSON), createdAt |
| **CompetitorSnapshot** | Point-in-time snapshot | competitorId, capturedAt, metrics (JSON) |

### Analytics (8)
| Model | Purpose | Key fields |
|---|---|---|
| **AnalyticsPrediction** | Forecast | userId, metric, prediction, confidence, horizon |
| **AnalyticsInsight** | Auto-insight | userId, type, insight, severity |
| **AnalyticsAnomaly** | Anomaly detection | userId, metric, expected, actual, severity |
| **AnalyticsBenchmark** | Benchmark | userId, metric, value, period |
| **AnalyticsSnapshot** | Point-in-time metric | userId, metric, value, capturedAt |
| **AnalyticsFormula** | Custom formula | userId, name, formula, variables |
| **DashboardShare** | Shareable dashboard | userId, token, config, expiresAt |
| **SystemMetrics** | Platform metrics | metric, value, capturedAt |

### Platform / Ops (10)
| Model | Purpose | Key fields |
|---|---|---|
| **ApiKey** | API key | userId, name, keyHash, prefix, scopes (JSON), environment, rateLimitPerHour, expiresAt, lastUsedAt, isActive |
| **ApiKeyUsage** | Per-call usage | apiKeyId, userId, endpoint, method, statusCode, responseTime, ipAddress, createdAt |
| **FeatureFlag** | Feature flag | key, value, enabled, description |
| **PlanEntitlement** | Plan → feature mapping | plan, feature, enabled, limit |
| **UsageTracking** | Usage counters | userId, metric, count, period |
| **DiscoveryJob** | Background discovery job | userId, query, niche, location, status, progress, result (JSON) |
| **RealtimeEvent** | Pub/sub event | type, payload, createdAt |
| **WsConnection** | WebSocket connection | userId, socketId, connectedAt |
| **SseConnection** | SSE connection | userId, channel, connectedAt |
| **MediaFile** | Uploaded media | userId, filename, mimeType, size, url |

### Messaging & Notifications (5)
| Model | Purpose | Key fields |
|---|---|---|
| **Conversation** | Cross-channel thread | userId, leadId, channel, lastMessageAt |
| **ConversationMessage** | Message in a thread | conversationId, channel, direction, content, sentAt |
| **TelegramConfig** | Telegram bot config | userId, botToken (enc), chatId, connectedAt |
| **WhatsappConfig** | WhatsApp (Twilio) config | userId, accountSid, authToken (enc), phoneNumber, connectedAt |
| **MessageBroadcast** | Broadcast campaign | userId, message, channel, audience, status |

### Feedback & Compliance (7)
| Model | Purpose | Key fields |
|---|---|---|
| **FeedbackReport** | User feedback | userId, type, category, subject, body, status, priority |
| **FeedbackComment** | Admin comment | feedbackId, userId, content |
| **FeedbackStatusLog** | Status history | feedbackId, from, to, userId |
| **CrashReport** | Auto-captured crash | userId, fingerprint, stack, userAgent, url, metadata, createdAt |
| **GdprRequest** | DSAR request | userId, type (export/delete), status, requestedAt, completedAt |
| **DataExport** | Export job | userId, type, status, downloadUrl, expiresAt |
| **OnboardingProgress** | Onboarding state | userId, stepsCompleted (JSON), completedAt |

### Misc (8)
| Model | Purpose | Key fields |
|---|---|---|
| **MessageTemplate** | Outreach template | userId, name, channel, content, variables |
| **MessageTemplateApproval** | Approval workflow | templateId, status, approvedBy |
| **ScheduledEmail** | Scheduled send | userId, to, subject, body, sendAt, status |
| **EmailTrackingLink** | Tracked link | messageId, originalUrl, shortId |
| **MessageDelivery** | Delivery record | userId, channel, recipient, status, attemptCount |
| **ProxyEndpoint** | Scraping proxy | url, country, healthy, lastChecked |
| **ScrapingMetric** | Scrape metrics | domain, success, durationMs, capturedAt |
| **AcquisitionCampaign** | Acquisition campaign | userId, name, niche, location, status |
| **Report** | Saved report | userId, name, type, config (JSON), schedule |

## Critical Relations (verify on migration)

- `User → Subscription` (userId FK, CASCADE)
- `User → CreditsLedger` (userId FK, CASCADE)
- `User → PaymentOrder` (userId FK, CASCADE)
- `User → Lead` (userId FK, SET_NULL — leads survive user deletion for org data)
- `Lead → LeadAnalysis` (leadId FK, CASCADE)
- `Lead → OutreachMessage` (leadId FK, CASCADE)
- `PaymentOrder → Invoice` (paymentOrderId FK, CASCADE)
- `Organization → OrgMember` (orgId FK, CASCADE)
- `WorkflowDefinition → WorkflowExecution` (workflowId FK, CASCADE)

## Indexes

Key unique indexes: `User.email`, `User.googleId`, `ApiKey.keyHash`, `GoogleCalendarToken.userId`, `EmailUnsubscribe.email`, `Coupon.code`. Most `@id @default(cuid())` fields are the PK. Foreign keys are indexed by Prisma by default.

## Migration Safety Notes

- All `DateTime` fields map correctly (ISO-8601) SQLite → PostgreSQL.
- `CUID()` IDs are string-based — no type mismatch.
- SQLite has no real BOOLEAN (0/1); PostgreSQL handles `true`/`false` natively — Prisma handles the conversion.
- `Float` fields: SQLite 64-bit → PostgreSQL `DOUBLE PRECISION` — compatible.
- JSON fields stored as `String` in SQLite; consider Prisma `Json` type for typed JSON in PostgreSQL.
- `@unique` constraints become UNIQUE indexes in PostgreSQL.
- CASCADE deletes are preserved.

---

*See also: [API-REFERENCE.md](API-REFERENCE.md), [DATA-FLOW-DIAGRAMS.md](DATA-FLOW-DIAGRAMS.md), and the exhaustive per-field reference in [`docs/02-architecture/DATABASE-SCHEMA.md`](../02-architecture/DATABASE-SCHEMA.md).*
