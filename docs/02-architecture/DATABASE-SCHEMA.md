# AcquisitionOS — Database Schema Reference

> Generated from `prisma/schema.prisma` (v2.0). **104 models**, datasource **SQLite** (`DATABASE_URL`), with annotated migration path to PostgreSQL. Every model and field below is taken verbatim from the schema file.

## Legend

- `?` suffix = nullable field. `@default(...)` shown where declared.
- JSON-typed columns are stored as `String` containing JSON (SQLite). Marked `// JSON` in schema.
- `Cascade` = row deleted when parent deleted; `SetNull` = FK nulled on parent delete.

## Categories

- **Auth & Users** — 4 models
- **Organizations** — 3 models
- **Billing & Payments** — 9 models
- **Platform Config** — 2 models
- **Leads & Pipeline** — 6 models
- **Outreach & Email** — 9 models
- **Conversations & Messaging** — 2 models
- **Integrations** — 2 models
- **Notifications** — 2 models
- **AI** — 5 models
- **Workflows** — 5 models
- **Competitor Intelligence** — 2 models
- **Audit & Compliance** — 7 models
- **CRM (Legacy Compatibility)** — 6 models
- **Calendar & Meetings** — 5 models
- **Lead Discovery** — 1 models
- **Security** — 2 models
- **Monitoring** — 1 models
- **Scraping Infrastructure** — 2 models
- **Realtime** — 3 models
- **Messaging Hub** — 6 models
- **Email Scheduling & Tracking** — 4 models
- **Feedback & Support** — 4 models
- **Campaigns & Reporting** — 4 models
- **Analytics Engine** — 8 models

---

## `User`
*Category: Auth & Users · defined at schema line 90*

**Purpose:** Root identity entity. Stores credentials, plan, credits, OTP/magic-link tokens, and links to every other table.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `email` | `String` | `@unique` |
| `name` | `String` | `?` |
| `avatar` | `String` | `?` |
| `passwordHash` | `String` | `?` |
| `googleId` | `String` | `?   @unique` |
| `emailVerified` | `Boolean` | `@default(false)` |
| `phone` | `String` | `?` |
| `country` | `String` | `?` |
| `company` | `String` | `?` |
| `preferencesJson` | `String` | `?` — [JSON-FIELD][MIGRATE-SAFE] JSON: {theme, compactView, defaultCountry, defaultNiche, notificationPrefs, timezone} |
| `plan` | `String` | `@default("free")` |
| `credits` | `Int` | `@default(50)` |
| `creditsMonthly` | `Int` | `@default(50)` |
| `rolloverCredits` | `Int` | `@default(0)` |
| `isTrial` | `Boolean` | `@default(true)` |
| `trialEndsAt` | `DateTime` | `?` |
| `role` | `String` | `@default("owner")` |
| `orgId` | `String` | `?` |
| `authProvider` | `String` | `@default("email")` — email, google |
| `emailVerificationOtp` | `String` | `?` |
| `emailVerificationOtpExpiry` | `DateTime` | `?` |
| `resetOtp` | `String` | `?` |
| `resetOtpExpiry` | `DateTime` | `?` |
| `loginOtp` | `String` | `?` |
| `loginOtpExpiry` | `DateTime` | `?` |
| `magicLinkToken` | `String` | `?` |
| `magicLinkTokenExpiry` | `DateTime` | `?` |
| `otpAttemptCount` | `Int` | `@default(0)` |
| `otpLockedUntil` | `DateTime` | `?` |
| `isActive` | `Boolean` | `@default(true)` |
| `lastLoginAt` | `DateTime` | `?` |
| `deletedAt` | `DateTime` | `?` |
| `meetingIntentLogs` | `MeetingIntentLog[]` |  |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `bio` | `String` | `?` |
| `consecutivePaymentFailures` | `Int` | `@default(0)` |
| `lastPaymentFailureAt` | `DateTime` | `?` |

**Relations:**
- `sessions` → `UserSession[]`
- `loginHistory` → `LoginHistory[]`
- `mfaConfig` → `MfaConfig`
- `subscriptions` → `Subscription[]`
- `creditsLedger` → `CreditsLedger[]`
- `creditAddons` → `CreditAddon[]`
- `paymentOrders` → `PaymentOrder[]`
- `emailAccounts` → `EmailAccount[]`
- `outreachSequences` → `OutreachSequence[]`
- `workflowDefinitions` → `WorkflowDefinition[]`
- `competitorAnalyses` → `CompetitorAnalysis[]`
- `aiChatSessions` → `AiChatSession[]`
- `settings` → `UserSettings`
- `auditLogs` → `AuditLog[]`
- `notifications` → `Notification[]`
- `notificationPrefs` → `NotificationPreferences`
- `apiKeys` → `ApiKey[]`
- `gdprRequests` → `GdprRequest[]`
- `dataExports` → `DataExport[]`
- `onboardingProgress` → `OnboardingProgress`
- `organizations` → `OrgMember[]`
- `orgInvitationsSent` → `OrgInvitation[]`
- `leadNotes` → `LeadNote[]`
- `emailBounces` → `EmailBounce[]`
- `emailUnsubscribes` → `EmailUnsubscribe[]`
- `conversationMessages` → `ConversationMessage[]`
- `workflowLogs` → `WorkflowLog[]`
- `apiKeyUsage` → `ApiKeyUsage[]`
- `usageTracking` → `UsageTracking[]`
- `discoveryJobs` → `DiscoveryJob[]`
- `securityAlerts` → `SecurityAlert[]`
- `knownDevices` → `KnownDevice[]`
- `aiCostRecords` → `AiCostRecord[]`
- `fileContexts` → `FileContext[]`
- `meetings` → `Meeting[]`
- `googleCalendarTokens` → `GoogleCalendarToken[]`
- `calendarWatches` → `CalendarWatch[]`
- `telegramConfigs` → `TelegramConfig[]`
- `whatsappConfigs` → `WhatsappConfig[]`
- `mediaFiles` → `MediaFile[]`
- `messageBroadcasts` → `MessageBroadcast[]`
- `messageTemplateApprovals` → `MessageTemplateApproval[]`
- `scheduledEmails` → `ScheduledEmail[]`
- `leads` → `Lead[]`
- `deals` → `Deal[]`
- `leadActivities` → `LeadActivity[]`
- `communications` → `Communication[]`
- `followUpReminders` → `FollowUpReminder[]`
- `outreachMessages` → `OutreachMessage[]`
- `invoices` → `Invoice[]`
- `meetingReminders` → `MeetingReminder[]`
- `messageDeliveries` → `MessageDelivery[]`
- `deliveryDeadLetters` → `DeliveryDeadLetter[]`
- `wsConnections` → `WsConnection[]`
- `sseConnections` → `SseConnection[]`
- `realtimeEvents` → `RealtimeEvent[]`
- `competitorData` → `CompetitorData[]`
- `promptTemplates` → `PromptTemplate[]`
- `feedbackReports` → `FeedbackReport[]`

**Indexes/constraints:** `@@index([email])` · `@@index([googleId])` · `@@index([plan])` · `@@index([orgId])` · `@@index([isActive])`

## `UserSession`
*Category: Auth & Users · defined at schema line 199*

**Purpose:** One row per active login session (refresh token). Enables session listing and revocation.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `refreshToken` | `String` | `@unique` |
| `deviceInfo` | `String` | `?` |
| `ipAddress` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `expiresAt` | `DateTime` |  |
| `isRevoked` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([refreshToken])` · `@@index([expiresAt])`

## `LoginHistory`
*Category: Auth & Users · defined at schema line 219*

**Purpose:** Audit of every sign-in attempt (success/failure, IP, geo) used for security alerts and suspicious-login detection.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `ip` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `country` | `String` | `?` |
| `city` | `String` | `?` |
| `success` | `Boolean` |  |
| `failReason` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([createdAt])` · `@@index([success])`

## `MfaConfig`
*Category: Auth & Users · defined at schema line 238*

**Purpose:** Encrypted TOTP secret + hashed backup codes for a user who enabled Multi-Factor Auth.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `secret` | `String` | Encrypted TOTP secret |
| `backupCodes` | `String` | JSON array of hashed backup codes |
| `isEnabled` | `Boolean` | `@default(false)` |
| `verifiedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

## `Organization`
*Category: Organizations · defined at schema line 258*

**Purpose:** Tenant/workspace for teams: branding, custom domain, custom pipeline stages.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `name` | `String` |  |
| `logo` | `String` | `?` |
| `customDomain` | `String` | `?` |
| `branding` | `String` | `?` — JSON: { primaryColor, accentColor, hideBranding } |
| `ownerId` | `String` |  |
| `meetingIntentLogs` | `MeetingIntentLog[]` |  |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `members` → `OrgMember[]`
- `invitations` → `OrgInvitation[]`
- `pipelineCustomStages` → `PipelineCustomStage[]`
- `leads` → `Lead[]`
- `deals` → `Deal[]`
- `communications` → `Communication[]`
- `leadActivities` → `LeadActivity[]`
- `followUpReminders` → `FollowUpReminder[]`
- `outreachSequences` → `OutreachSequence[]`
- `conversations` → `Conversation[]`
- `conversationMessages` → `ConversationMessage[]`
- `competitorAnalyses` → `CompetitorAnalysis[]`
- `meetings` → `Meeting[]`
- `discoveryJobs` → `DiscoveryJob[]`
- `pipelineStages` → `PipelineStage[]`
- `workflowDefinitions` → `WorkflowDefinition[]`
- `realtimeEvents` → `RealtimeEvent[]`

**Indexes/constraints:** `@@index([ownerId])` · `@@index([customDomain])`

## `OrgMember`
*Category: Organizations · defined at schema line 292*

**Purpose:** Membership join table User<->Organization with role (owner/admin/member/viewer).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `orgId` | `String` |  |
| `userId` | `String` |  |
| `role` | `String` | `@default("member")` — owner, admin, member, viewer |
| `joinedAt` | `DateTime` | `@default(now())` |

**Relations:**
- `organization` → `Organization`
- `user` → `User`

**Indexes/constraints:** `@@unique([orgId, userId])` · `@@index([orgId])` · `@@index([userId])`

## `OrgInvitation`
*Category: Organizations · defined at schema line 308*

**Purpose:** Pending email invitations to join an organization, with unique token and expiry.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `orgId` | `String` |  |
| `email` | `String` |  |
| `role` | `String` | `@default("member")` |
| `token` | `String` | `@unique` |
| `invitedBy` | `String` |  |
| `expiresAt` | `DateTime` |  |
| `acceptedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `organization` → `Organization`
- `inviter` → `User`

**Indexes/constraints:** `@@index([orgId])` · `@@index([token])` · `@@index([email])`

## `Subscription`
*Category: Billing & Payments · defined at schema line 336*

**Purpose:** Current plan state per user: status lifecycle (trialing/active/past_due/canceled/expired), Stripe/Razorpay IDs, period bounds, credit counters.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `plan` | `String` |  |
| `status` | `String` | `@default("trialing")` — trialing, active, past_due, canceled, expired |
| `stripeCustomerId` | `String` | `?` |
| `stripeSubscriptionId` | `String` | `?` |
| `razorpaySubscriptionId` | `String` | `?` |
| `currentPeriodStart` | `DateTime` | `?` |
| `currentPeriodEnd` | `DateTime` | `?` |
| `cancelAtPeriodEnd` | `Boolean` | `@default(false)` |
| `scheduledPlanChange` | `String` | `?` |
| `isTrial` | `Boolean` | `@default(true)` |
| `trialEndsAt` | `DateTime` | `?` |
| `billingCycle` | `String` | `@default("monthly")` — monthly, yearly |
| `creditsTotal` | `Int` | `@default(50)` |
| `creditsUsed` | `Int` | `@default(0)` |
| `creditsRemaining` | `Int` | `@default(50)` |
| `creditsResetAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([stripeCustomerId])` · `@@index([razorpaySubscriptionId])` · `@@index([stripeSubscriptionId])`

## `CreditsLedger`
*Category: Billing & Payments · defined at schema line 368*

**Purpose:** Append-only credit transaction log (add/deduct) with running balance and reference to the entity that caused it.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `action` | `String` | lead_discovery, deep_analysis, outreach_generation, etc. |
| `credits` | `Int` | positive for add, negative for deduct |
| `balance` | `Int` | balance after transaction |
| `description` | `String` | `?` |
| `referenceId` | `String` | `?` — ID of related entity (lead, deal, etc.) |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([action])` · `@@index([createdAt])` · `@@index([referenceId])`

## `CreditAddon`
*Category: Billing & Payments · defined at schema line 387*

**Purpose:** One-time credit packs purchased on top of a plan; optional expiry.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `credits` | `Int` |  |
| `pricePaid` | `Float` |  |
| `currency` | `String` | `@default("USD")` |
| `paymentOrderId` | `String` | `?` |
| `expiresAt` | `DateTime` | `?` — null = never expires |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([expiresAt])`

## `PaymentOrder`
*Category: Billing & Payments · defined at schema line 404*

**Purpose:** A checkout attempt via Stripe or Razorpay with amount, tax/GST, coupon, idempotency key.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `provider` | `String` | `@default("razorpay")` — razorpay, stripe |
| `providerOrderId` | `String` | `?` |
| `providerPaymentId` | `String` | `?` |
| `amount` | `Float` |  |
| `currency` | `String` | `@default("USD")` |
| `plan` | `String` |  |
| `billingCycle` | `String` | `@default("monthly")` — monthly, yearly |
| `status` | `String` | `@default("pending")` — pending, completed, failed, refunded |
| `couponCode` | `String` | `?` |
| `discountAmount` | `Float` | `@default(0)` |
| `subtotal` | `Float` | `@default(0)` |
| `taxRate` | `Float` | `@default(0)` |
| `taxAmount` | `Float` | `@default(0)` |
| `gstNumber` | `String` | `?` |
| `isIndianUser` | `Boolean` | `@default(false)` |
| `idempotencyKey` | `String` | `? @unique` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `webhooks` → `PaymentWebhook[]`
- `invoice` → `Invoice`

**Indexes/constraints:** `@@index([userId])` · `@@index([providerOrderId])` · `@@index([providerPaymentId])` · `@@index([status])` · `@@index([idempotencyKey])`

## `PaymentWebhook`
*Category: Billing & Payments · defined at schema line 438*

**Purpose:** Raw webhook events received from payment providers, deduplicated by eventId, with processing status/error.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `paymentOrderId` | `String` | `?` |
| `provider` | `String` | razorpay, stripe |
| `eventId` | `String` | `@unique` |
| `eventType` | `String` |  |
| `payload` | `String` | JSON |
| `signature` | `String` | `?` |
| `processed` | `Boolean` | `@default(false)` |
| `processingError` | `String` | `?` |
| `receivedAt` | `DateTime` | `@default(now())` |
| `processedAt` | `DateTime` | `?` |

**Relations:**
- `paymentOrder` → `PaymentOrder`

**Indexes/constraints:** `@@index([eventId])` · `@@index([provider])` · `@@index([processed])`

## `Invoice`
*Category: Billing & Payments · defined at schema line 459*

**Purpose:** Generated invoice (1:1 with PaymentOrder) with tax breakdown, line items JSON, HTML content and PDF URL.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `paymentOrderId` | `String` | `@unique` |
| `invoiceNumber` | `String` | `@unique` |
| `userId` | `String` |  |
| `subtotal` | `Float` |  |
| `taxRate` | `Float` |  |
| `taxAmount` | `Float` |  |
| `total` | `Float` |  |
| `currency` | `String` | `@default("USD")` |
| `gstNumber` | `String` | `?` |
| `taxExempt` | `Boolean` | `@default(false)` |
| `pdfUrl` | `String` | `?` |
| `htmlContent` | `String` | `?` — Pre-rendered HTML invoice for display/PDF generation |
| `lineItems` | `String` | JSON |
| `createdAt` | `DateTime` | `@default(now())` |
| `status` | `String` | `?` |

**Relations:**
- `user` → `User`
- `paymentOrder` → `PaymentOrder`

**Indexes/constraints:** `@@index([userId])` · `@@index([invoiceNumber])`

## `Coupon`
*Category: Billing & Payments · defined at schema line 485*

**Purpose:** Discount codes (percent or fixed), usage caps, plan restrictions.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `code` | `String` | `@unique` |
| `discountType` | `String` | percent, fixed |
| `discountValue` | `Float` |  |
| `maxUses` | `Int` | `?` |
| `usedCount` | `Int` | `@default(0)` |
| `expiresAt` | `DateTime` | `?` |
| `applicablePlans` | `String` | `@default("[]")` — JSON array |
| `active` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([code])` · `@@index([active])`

## `TaxRate`
*Category: Billing & Payments · defined at schema line 503*

**Purpose:** Per-country/region tax rates (GST/VAT) applied at checkout.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `country` | `String` |  |
| `region` | `String` | `?` |
| `rate` | `Float` |  |
| `name` | `String` | e.g., "GST", "VAT" |
| `isActive` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@unique([country, region])`

## `UsageTracking`
*Category: Billing & Payments · defined at schema line 517*

**Purpose:** Per-user per-feature usage counters within a billing period (entitlement enforcement).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `feature` | `String` | e.g., lead_discovery, deep_analysis, etc. |
| `action` | `String` | specific action taken |
| `count` | `Int` | `@default(1)` |
| `periodStart` | `DateTime` | billing period start |
| `periodEnd` | `DateTime` | billing period end |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@unique([userId, feature, periodStart])` · `@@index([userId])` · `@@index([feature])` · `@@index([periodStart])` · `@@index([periodEnd])`

## `FeatureFlag`
*Category: Platform Config · defined at schema line 542*

**Purpose:** Global feature toggles, optionally restricted to plan list.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `key` | `String` | `@unique` |
| `name` | `String` |  |
| `description` | `String` | `?` |
| `enabled` | `Boolean` | `@default(true)` |
| `plans` | `String` | `@default("[]")` — JSON array of allowed plans |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([key])` · `@@index([enabled])`

## `PlanEntitlement`
*Category: Platform Config · defined at schema line 557*

**Purpose:** Matrix of plan -> feature -> numeric limit (null = unlimited) used by entitlement middleware.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `plan` | `String` | free, pro, elite |
| `feature` | `String` |  |
| `limit` | `Int` | `?` — null = unlimited |
| `enabled` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@unique([plan, feature])` · `@@index([plan])`

## `Lead`
*Category: Leads & Pipeline · defined at schema line 578*

**Purpose:** Central sales prospect record: business info, contact channels, website quality, AI scores (reply/conversion/urgency/revenue), pipeline stage, email status.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `businessName` | `String` |  |
| `ownerName` | `String` | `?` |
| `website` | `String` | `?` |
| `email` | `String` | `?` |
| `phone` | `String` | `?` |
| `whatsapp` | `String` | `?` |
| `linkedin` | `String` | `?` |
| `instagram` | `String` | `?` |
| `facebook` | `String` | `?` |
| `googleMapsListing` | `String` | `?` |
| `reviews` | `String` | `?` |
| `rating` | `Float` | `?` |
| `estimatedQuality` | `String` | `?       @default("medium")` |
| `estimatedRevenue` | `String` | `?       @default("medium")` |
| `city` | `String` | `?` |
| `country` | `String` | `?` |
| `niche` | `String` | `?` |
| `replyScore` | `Float` | `@default(0)` |
| `conversionScore` | `Float` | `@default(0)` |
| `urgencyScore` | `Float` | `@default(0)` |
| `revenuePotentialScore` | `Float` | `@default(0)` |
| `scoreReasoning` | `String` | `?` |
| `stage` | `String` | `@default("discovered")` |
| `emailStatus` | `String` | `?` — none, sent, bounced, opened, replied, unsubscribed |
| `hasWebsite` | `Boolean` | `@default(false)` |
| `websiteQuality` | `String` | `? @default("none")` |
| `digitalWeaknesses` | `String` | `?` |
| `opportunityNotes` | `String` | `?` |
| `bestContactPerson` | `String` | `?` |
| `bestChannel` | `String` | `?` |
| `bestTiming` | `String` | `?` |
| `outreachStyle` | `String` | `?` |
| `source` | `String` | `?` |
| `notes` | `String` | `?` |
| `tags` | `String` | `@default("[]")` |
| `followUpAt` | `DateTime` | `?` |
| `lastContactedAt` | `DateTime` | `?` |
| `websiteScreenshotUrl` | `String` | `?` |
| `techStack` | `String` | `?` — JSON array |
| `isActive` | `Boolean` | `@default(true)` |
| `deletedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`
- `communications` → `Communication[]`
- `deals` → `Deal[]`
- `activities` → `LeadActivity[]`
- `followUpReminders` → `FollowUpReminder[]`
- `leadAnalysis` → `LeadAnalysis[]`
- `leadScores` → `LeadScore[]`
- `leadNotes` → `LeadNote[]`
- `sequenceEnrollments` → `SequenceEnrollment[]`
- `outreachMessages` → `OutreachMessage[]`
- `meetings` → `Meeting[]`
- `conversations` → `Conversation[]`
- `broadcastTargets` → `BroadcastTarget[]`

**Indexes/constraints:** `@@index([userId])` · `@@index([orgId])` · `@@index([stage])` · `@@index([niche])` · `@@index([country])` · `@@index([email])` · `@@index([replyScore])` · `@@index([conversionScore])` · `@@index([urgencyScore])` · `@@index([createdAt])` · `@@index([isActive])` · `@@index([businessName])` · `@@index([userId, stage])` · `@@index([userId, createdAt])`

## `LeadAnalysis`
*Category: Leads & Pipeline · defined at schema line 666*

**Purpose:** AI deep-analysis result for one lead (1:1): website/digital maturity scores, weaknesses, decision maker profile, recommended services, deal value estimates.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` | `@unique` |
| `websiteQualityScore` | `Int` | `@default(0)` |
| `digitalMaturityScore` | `Int` | `@default(0)` |
| `weaknesses` | `String` | `?` — JSON array of Weakness objects |
| `replyScore` | `Int` | `@default(0)` |
| `dealConversionScore` | `Int` | `@default(0)` |
| `urgencyScore` | `Int` | `@default(0)` |
| `revenuePotentialScore` | `Int` | `@default(0)` |
| `scoreExplanations` | `String` | `?` — JSON |
| `decisionMaker` | `String` | `?` — JSON: { likelyName, likelyRole, bestChannel, reasoning, approachStyle } |
| `recommendedServices` | `String` | `?` — JSON array |
| `estimatedDealValueInr` | `String` | `?` |
| `estimatedDealValueUsd` | `String` | `?` |
| `outreachMessages` | `String` | `?` — JSON: { emailSubject, emailBody, whatsappMessage, linkedinMessage, instagramDm, followUpDay4, followUpDay10 } |
| `closingStrategy` | `String` | `?` |
| `bestContactTime` | `String` | `?` |
| `analysisVersion` | `Int` | `@default(1)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `lead` → `Lead`

**Indexes/constraints:** `@@index([leadId])` · `@@index([replyScore])` · `@@index([dealConversionScore])`

## `LeadScore`
*Category: Leads & Pipeline · defined at schema line 696*

**Purpose:** Explainable score components attached to a lead.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `scoreType` | `String` | reply, conversion, urgency, revenue_potential, website_quality, digital_maturity |
| `score` | `Int` |  |
| `explanation` | `String` | `?` |
| `modelVersion` | `String` | `?` |
| `scoredAt` | `DateTime` | `@default(now())` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `lead` → `Lead`

**Indexes/constraints:** `@@index([leadId])` · `@@index([scoreType])` · `@@index([scoredAt])`

## `LeadNote`
*Category: Leads & Pipeline · defined at schema line 714*

**Purpose:** Free-form notes on a lead.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `userId` | `String` |  |
| `content` | `String` |  |
| `pinned` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `lead` → `Lead`
- `user` → `User`

**Indexes/constraints:** `@@index([leadId])` · `@@index([userId])` · `@@index([pinned])`

## `PipelineStage`
*Category: Leads & Pipeline · defined at schema line 736*

**Purpose:** Default pipeline stage definition per user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `name` | `String` |  |
| `order` | `Int` |  |
| `color` | `String` | `?` |
| `isDefault` | `Boolean` | `@default(true)` |
| `orgId` | `String` | `?` — null = global default stage |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `organization` → `Organization`

**Indexes/constraints:** `@@index([order])` · `@@index([orgId])`

## `PipelineCustomStage`
*Category: Leads & Pipeline · defined at schema line 753*

**Purpose:** Organization-defined custom pipeline stage.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `orgId` | `String` |  |
| `name` | `String` |  |
| `order` | `Int` |  |
| `color` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `organization` → `Organization`

**Indexes/constraints:** `@@index([orgId])` · `@@index([order])`

## `OutreachMessage`
*Category: Outreach & Email · defined at schema line 775*

**Purpose:** Single outreach email generated/sent to a lead, with subject/body, status and tracking data.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `userId` | `String` | `?` |
| `channel` | `String` | email, whatsapp, linkedin, instagram |
| `direction` | `String` | `@default("outbound")` |
| `subject` | `String` | `?` |
| `content` | `String` |  |
| `status` | `String` | `@default("draft")` — draft, sent, delivered, opened, replied, bounced, failed |
| `sentAt` | `DateTime` | `?` |
| `openedAt` | `DateTime` | `?` |
| `repliedAt` | `DateTime` | `?` |
| `bouncedAt` | `DateTime` | `?` |
| `generatedByAI` | `Boolean` | `@default(false)` |
| `sequenceStepId` | `String` | `?` — null = manual/outreach, set = from sequence |
| `trackingPixelId` | `String` | `?   @unique` |
| `metadata` | `String` | `?` — JSON for additional data |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `lead` → `Lead`
- `user` → `User`
- `sequenceStep` → `SequenceStep`

**Indexes/constraints:** `@@index([leadId])` · `@@index([userId])` · `@@index([channel])` · `@@index([status])` · `@@index([sentAt])` · `@@index([trackingPixelId])` · `@@index([userId, status])` · `@@index([sequenceStepId])`

## `OutreachSequence`
*Category: Outreach & Email · defined at schema line 810*

**Purpose:** Named multi-step outreach sequence owned by a user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `name` | `String` |  |
| `description` | `String` | `?` |
| `status` | `String` | `@default("draft")` — draft, active, paused, completed |
| `steps` | `String` | `@default("[]")` — JSON array of step definitions |
| `channel` | `String` | `@default("email")` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `enrollments` → `SequenceEnrollment[]`
- `sequenceSteps` → `SequenceStep[]`
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([orgId])`

## `SequenceStep`
*Category: Outreach & Email · defined at schema line 834*

**Purpose:** One step in a sequence (delay, template).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `sequenceId` | `String` |  |
| `order` | `Int` |  |
| `channel` | `String` | email, whatsapp, linkedin, instagram |
| `subject` | `String` | `?` |
| `template` | `String` |  |
| `delayDays` | `Int` | `@default(1)` |
| `delayHours` | `Int` | `@default(0)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `sequence` → `OutreachSequence`
- `outreachMessages` → `OutreachMessage[]`

**Indexes/constraints:** `@@index([sequenceId])` · `@@index([order])`

## `SequenceEnrollment`
*Category: Outreach & Email · defined at schema line 855*

**Purpose:** A lead enrolled in a sequence with progress tracking.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `sequenceId` | `String` |  |
| `leadId` | `String` |  |
| `currentStep` | `Int` | `@default(0)` |
| `nextSendAt` | `DateTime` | `?` |
| `status` | `String` | `@default("active")` — active, paused, completed, opted_out |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `sequence` → `OutreachSequence`
- `lead` → `Lead`

**Indexes/constraints:** `@@index([sequenceId])` · `@@index([leadId])` · `@@index([status])` · `@@index([nextSendAt])`

## `EmailAccount`
*Category: Outreach & Email · defined at schema line 881*

**Purpose:** Connected sending mailbox (OAuth Gmail or SMTP) per user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `gmailEmail` | `String` |  |
| `accessToken` | `String` | Encrypted at rest |
| `refreshToken` | `String` | Encrypted at rest |
| `tokenExpiry` | `DateTime` | `?` |
| `consentGiven` | `Boolean` | `@default(false)` |
| `consentGivenAt` | `DateTime` | `?` |
| `status` | `String` | `@default("active")` — active, revoked, expired |
| `mode` | `String` | `@default("manual")` — manual, auto |
| `lastPollAt` | `DateTime` | `?` |
| `pubSubConfigured` | `Boolean` | `@default(false)` |
| `labelId` | `String` | `?` — Gmail label ID for "AcquisitionOS" |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `threads` → `EmailThread[]`
- `scheduledEmails` → `ScheduledEmail[]`

**Indexes/constraints:** `@@unique([gmailEmail, userId])` · `@@index([userId])` · `@@index([gmailEmail])` · `@@index([status])`

## `EmailThread`
*Category: Outreach & Email · defined at schema line 909*

**Purpose:** Conversation thread grouping email messages.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `emailAccountId` | `String` |  |
| `gmailThreadId` | `String` |  |
| `leadId` | `String` | `?` |
| `subject` | `String` | `?` |
| `lastMessageAt` | `DateTime` | `?` |
| `messageCount` | `Int` | `@default(0)` |
| `isRead` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `emailAccount` → `EmailAccount`
- `messages` → `EmailMessage[]`

**Indexes/constraints:** `@@index([emailAccountId])` · `@@index([gmailThreadId])` · `@@index([leadId])` · `@@index([lastMessageAt])`

## `EmailMessage`
*Category: Outreach & Email · defined at schema line 931*

**Purpose:** Individual email in a thread (direction, content, read status).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `threadId` | `String` |  |
| `gmailMessageId` | `String` | `?   @unique` |
| `fromEmail` | `String` |  |
| `toEmail` | `String` |  |
| `subject` | `String` | `?` |
| `bodyPlain` | `String` | `?` |
| `bodyHtml` | `String` | `?` |
| `direction` | `String` | `@default("inbound")` — inbound, outbound |
| `isRead` | `Boolean` | `@default(false)` |
| `openedAt` | `DateTime` | `?` |
| `labels` | `String` | `?` — JSON array of Gmail labels |
| `leadId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `thread` → `EmailThread`

**Indexes/constraints:** `@@index([threadId])` · `@@index([gmailMessageId])` · `@@index([fromEmail])` · `@@index([leadId])` · `@@index([direction])`

## `EmailBounce`
*Category: Outreach & Email · defined at schema line 957*

**Purpose:** Bounce record for a sent email with type/reason.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `leadId` | `String` | `?` |
| `email` | `String` |  |
| `bounceType` | `String` | `?` — hard, soft |
| `bounceReason` | `String` | `?` |
| `messageId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([email])` · `@@index([leadId])`

## `EmailUnsubscribe`
*Category: Outreach & Email · defined at schema line 975*

**Purpose:** Per-lead/user unsubscribe record honoring opt-out.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `email` | `String` |  |
| `leadId` | `String` | `?` |
| `token` | `String` | `@unique` |
| `reason` | `String` | `?` |
| `ipAddress` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@unique([email])` · `@@index([email])` · `@@index([token])` · `@@index([userId])`

## `Conversation`
*Category: Conversations & Messaging · defined at schema line 1000*

**Purpose:** Messaging conversation with a lead (cross-channel).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `orgId` | `String` | `?` |
| `channel` | `String` | email, whatsapp, telegram, linkedin, instagram |
| `subject` | `String` | `?` |
| `status` | `String` | `@default("active")` — active, closed, archived |
| `lastMessageAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `userId` | `String` | `?` |

**Relations:**
- `lead` → `Lead`
- `organization` → `Organization`
- `messages` → `ConversationMessage[]`

**Indexes/constraints:** `@@index([leadId])` · `@@index([channel])` · `@@index([status])` · `@@index([lastMessageAt])` · `@@index([orgId])`

## `ConversationMessage`
*Category: Conversations & Messaging · defined at schema line 1024*

**Purpose:** Message inside a conversation.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `conversationId` | `String` |  |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `senderType` | `String` | user, lead, ai |
| `content` | `String` |  |
| `channel` | `String` |  |
| `direction` | `String` | `@default("inbound")` |
| `intent` | `String` | `?` — positive, neutral, negative, objection |
| `buyingSignals` | `String` | `?` — JSON |
| `hesitationReasons` | `String` | `?` — JSON |
| `aiGenerated` | `Boolean` | `@default(false)` |
| `metadata` | `String` | `?` — JSON |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `conversation` → `Conversation`
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([conversationId])` · `@@index([userId])` · `@@index([senderType])` · `@@index([createdAt])` · `@@index([orgId])`

## `TelegramConfig`
*Category: Integrations · defined at schema line 1057*

**Purpose:** User Telegram integration: bot token/chat id, link code, notification prefs.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `chatId` | `String` |  |
| `username` | `String` | `?` |
| `isConnected` | `Boolean` | `@default(false)` |
| `isPaused` | `Boolean` | `@default(false)` |
| `linkCode` | `String` | `?` |
| `linkCodeExpiresAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `webhookSecret` | `String` | `?` |
| `lastWebhookAt` | `DateTime` | `?` |
| `botToken` | `String` | `?` |
| `healthStatus` | `String` | `?` |
| `mode` | `String` | `?` |
| `webhookUrl` | `String` | `?` |
| `reconnectAttempts` | `Int` | `@default(0)` |
| `botId` | `String` | `?` |
| `webhookVerified` | `Boolean` | `@default(false)` |
| `lastHealthCheckAt` | `DateTime` | `?` |
| `metaVerifyToken` | `String` | `?` |
| `twilioAuthToken` | `String` | `?` |
| `twilioPhoneNumber` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([chatId])` · `@@index([linkCode])`

## `WhatsappConfig`
*Category: Integrations · defined at schema line 1090*

**Purpose:** User WhatsApp integration (Twilio or Meta Cloud API): credentials, verified number, OTP state, prefs.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `phoneNumber` | `String` |  |
| `provider` | `String` | `?` — twilio, meta |
| `isConnected` | `Boolean` | `@default(false)` |
| `isPaused` | `Boolean` | `@default(false)` |
| `verificationOtp` | `String` | `?` |
| `otpExpiresAt` | `DateTime` | `?` |
| `monthlyQuota` | `Int` | `@default(100)` |
| `monthlyUsed` | `Int` | `@default(0)` |
| `quotaResetAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `metaVerifyToken` | `String` | `?` |
| `metaWebhookVerified` | `Boolean` | `@default(false)` |
| `metaPhoneNumberId` | `String` | `?` |
| `metaWabaId` | `String` | `?` |
| `twilioAccountSid` | `String` | `?` |
| `lastTemplateSyncAt` | `DateTime` | `?` |
| `metaAccessToken` | `String` | `?` |
| `healthStatus` | `String` | `?` |
| `reconnectAttempts` | `Int` | `@default(0)` |
| `lastWebhookAt` | `DateTime` | `?` |
| `twilioAuthToken` | `String` | `?` |
| `twilioPhoneNumber` | `String` | `?` |
| `lastHealthCheckAt` | `DateTime` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([phoneNumber])`

## `Notification`
*Category: Notifications · defined at schema line 1131*

**Purpose:** In-app notification row (type, title, body, read/archived).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `type` | `String` | email_reply, deal_won, credit_low, payment_success, etc. |
| `title` | `String` |  |
| `message` | `String` |  |
| `read` | `Boolean` | `@default(false)` |
| `actionUrl` | `String` | `?` |
| `metadata` | `String` | `?` — JSON |
| `deliveredVia` | `String` | `?` — in_app, telegram, whatsapp, email |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([read])` · `@@index([type])` · `@@index([createdAt])` · `@@index([userId, read])` · `@@index([userId, createdAt])`

## `NotificationPreferences`
*Category: Notifications · defined at schema line 1154*

**Purpose:** Per-user channel preferences (in-app/email/telegram/whatsapp/push) per event type.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `inAppEnabled` | `Boolean` | `@default(true)` |
| `emailEnabled` | `Boolean` | `@default(true)` |
| `telegramEnabled` | `Boolean` | `@default(false)` |
| `whatsappEnabled` | `Boolean` | `@default(false)` |
| `dndStartTime` | `String` | `?` — "22:00" |
| `dndEndTime` | `String` | `?` — "07:00" |
| `dndTimezone` | `String` | `?` — "Asia/Kolkata" |
| `typePreferences` | `String` | `?` — JSON: { email_reply: { inApp: true, telegram: true }, ... } |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `pushEnabled` | `Boolean` | `@default(false)` |
| `pushSubscriptions` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])`

## `AiChatSession`
*Category: AI · defined at schema line 1182*

**Purpose:** AI assistant chat session (title, context lead).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `title` | `String` | `?` |
| `salesCoachMode` | `Boolean` | `@default(false)` |
| `currentPage` | `String` | `?` |
| `leadContext` | `String` | `?` |
| `isActive` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `messages` → `AiChatMessage[]`
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([isActive])`

## `AiChatMessage`
*Category: AI · defined at schema line 1202*

**Purpose:** Message in an AI chat session (role, content, tokens).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `sessionId` | `String` |  |
| `role` | `String` | user, assistant, system |
| `content` | `String` |  |
| `metadata` | `String` | `?` — JSON: { intent, buyingSignals, hesitationFactors, recommendedResponse, closingStrategy } |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `session` → `AiChatSession`

**Indexes/constraints:** `@@index([sessionId])` · `@@index([createdAt])`

## `WorkflowDefinition`
*Category: Workflows · defined at schema line 1223*

**Purpose:** Automation workflow: trigger config + steps JSON, enabled state.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `name` | `String` |  |
| `description` | `String` | `?` |
| `status` | `String` | `@default("draft")` — draft, active, paused, archived |
| `triggerType` | `String` | lead_stage_change, lead_reply, score_change, manual, scheduled, payment_received |
| `triggerConfig` | `String` | `?` — JSON: { stage: "replied", scoreThreshold: 80, schedule: "daily", ... } |
| `nodes` | `String` | `@default("[]")` — JSON array of workflow node definitions |
| `edges` | `String` | `@default("[]")` — JSON array of edge connections |
| `version` | `Int` | `@default(1)` |
| `isTemplate` | `Boolean` | `@default(false)` |
| `templateCategory` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `runCount` | `Int` | `@default(0)` |
| `successCount` | `Int` | `@default(0)` |
| `failureCount` | `Int` | `@default(0)` |
| `avgRuntimeMs` | `Float` | `?` |
| `lastRunAt` | `DateTime` | `?` |
| `webhookPath` | `String` | `?` |
| `maxRetries` | `Int` | `?` |
| `maxConcurrency` | `Int` | `?` |

**Relations:**
- `executions` → `WorkflowExecution[]`
- `workflowSteps` → `WorkflowStep[]`
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([triggerType])` · `@@index([orgId])`

## `WorkflowStep`
*Category: Workflows · defined at schema line 1261*

**Purpose:** Ordered step rows composing a workflow.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `workflowId` | `String` |  |
| `type` | `String` | action, condition, delay, ai_action |
| `name` | `String` |  |
| `config` | `String` | JSON: step-specific configuration |
| `order` | `Int` |  |
| `nextStepId` | `String` | `?` — For linear workflows |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `workflow` → `WorkflowDefinition`

**Indexes/constraints:** `@@index([workflowId])` · `@@index([order])`

## `WorkflowExecution`
*Category: Workflows · defined at schema line 1279*

**Purpose:** One run of a workflow with status, timings, output/error.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `workflowId` | `String` |  |
| `status` | `String` | `@default("running")` — running, completed, failed, cancelled, paused |
| `triggerData` | `String` | `?` — JSON: data that triggered this execution |
| `logs` | `String` | `?` — JSON array of execution logs |
| `currentStep` | `Int` | `@default(0)` |
| `totalSteps` | `Int` | `@default(0)` |
| `startedAt` | `DateTime` | `@default(now())` |
| `completedAt` | `DateTime` | `?` |
| `error` | `String` | `?` |
| `retryCount` | `Int` | `@default(0)` |
| `maxRetries` | `Int` | `@default(3)` |
| `timeoutMs` | `Int` | `@default(300000)` |
| `idempotencyKey` | `String` | `?` |
| `pausedAt` | `DateTime` | `?` |
| `resumedAt` | `DateTime` | `?` |
| `triggerEvent` | `String` | `?` — JSON: the event that triggered this execution |
| `deadLettered` | `Boolean` | `@default(false)` |
| `deadLetterReason` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `durationMs` | `Int` | `?` |
| `isDeadLetter` | `Boolean` | `@default(false)` |
| `lastRetryAt` | `DateTime` | `?` |
| `userId` | `String` | `?` |

**Relations:**
- `workflow` → `WorkflowDefinition`
- `stepLogs` → `WorkflowLog[]`

**Indexes/constraints:** `@@index([workflowId])` · `@@index([status])` · `@@index([startedAt])` · `@@index([idempotencyKey])` · `@@index([deadLettered])`

## `WorkflowLog`
*Category: Workflows · defined at schema line 1316*

**Purpose:** Log lines for a workflow execution (level, message, data).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `executionId` | `String` |  |
| `stepName` | `String` |  |
| `stepType` | `String` |  |
| `status` | `String` | success, failed, skipped |
| `input` | `String` | `?` — JSON |
| `output` | `String` | `?` — JSON |
| `error` | `String` | `?` |
| `durationMs` | `Int` | `?` |
| `userId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `retryAttempt` | `Int` | `?` |

**Relations:**
- `execution` → `WorkflowExecution`
- `user` → `User`

**Indexes/constraints:** `@@index([executionId])` · `@@index([status])`

## `WorkflowTemplate`
*Category: Workflows · defined at schema line 1338*

**Purpose:** Reusable prebuilt workflow templates.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `name` | `String` |  |
| `description` | `String` |  |
| `category` | `String` | nurture, follow_up, alert, onboarding, enrichment, outreach |
| `triggerType` | `String` |  |
| `triggerConfig` | `String` | `?` |
| `nodes` | `String` | `@default("[]")` — JSON |
| `edges` | `String` | `@default("[]")` — JSON |
| `isPremium` | `Boolean` | `@default(false)` |
| `usageCount` | `Int` | `@default(0)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([category])`

## `CompetitorData`
*Category: Competitor Intelligence · defined at schema line 1359*

**Purpose:** Raw scraped competitor datapoint.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `competitorName` | `String` |  |
| `competitorUrl` | `String` |  |
| `websiteHtml` | `String` | `?` — Raw HTML stored for analysis |
| `screenshotUrl` | `String` | `?` — S3 URL |
| `lastScrapedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `description` | `String` | `?` |
| `techStackData` | `String` | `?` |
| `pageSpeedScore` | `Float` | `?` |
| `seoMetadata` | `String` | `?` |
| `socialProfiles` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([competitorUrl])` · `@@index([lastScrapedAt])`

## `CompetitorAnalysis`
*Category: Competitor Intelligence · defined at schema line 1383*

**Purpose:** AI competitor analysis for a user: competitors list, SWOT/pricing/SEO/social insights JSON.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `leadId` | `String` | `?` |
| `competitorName` | `String` |  |
| `competitorUrl` | `String` |  |
| `techStack` | `String` | `?` — JSON array |
| `seoScore` | `Int` | `?` |
| `socialScore` | `Int` | `?` |
| `strengths` | `String` | `?` — JSON array |
| `weaknesses` | `String` | `?` — JSON array |
| `opportunities` | `String` | `?` — JSON array |
| `threats` | `String` | `?` — JSON array |
| `threatLevel` | `String` | `?` — low, medium, high |
| `pricingModel` | `String` | `?` |
| `estimatedTrafficTier` | `String` | `?` — low, medium, high |
| `differentiationOpportunities` | `String` | `?` — JSON array |
| `analysisData` | `String` | `?` — Full JSON analysis result |
| `competitorDataId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `opportunityScore` | `Float` | `?` |
| `pricingDetails` | `String` | `?` |
| `socialProfiles` | `String` | `?` |
| `reviewsData` | `String` | `?` |
| `pageSpeedData` | `String` | `?` |
| `aiComparisonData` | `String` | `?` |
| `lighthouseData` | `String` | `?` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([userId])` · `@@index([leadId])` · `@@index([competitorUrl])` · `@@index([threatLevel])` · `@@index([orgId])`

## `AuditLog`
*Category: Audit & Compliance · defined at schema line 1428*

**Purpose:** Security-relevant action audit (who, what, target, IP).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `action` | `String` | login, logout, plan_change, gmail_connect, email_sent, etc. |
| `details` | `String` | `?` — JSON |
| `ipAddress` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `resource` | `String` | `?` — lead, deal, user, etc. |
| `resourceId` | `String` | `?` — ID of the affected resource |
| `createdAt` | `DateTime` | `@default(now())` |
| `metadata` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([action])` · `@@index([resource])` · `@@index([createdAt])` · `@@index([userId, createdAt])`

## `SystemEvent`
*Category: Audit & Compliance · defined at schema line 1450*

**Purpose:** System-level event stream entries (startup, errors, jobs).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `type` | `String` | error, warning, info, critical |
| `source` | `String` | backend, celery, websocket, etc. |
| `message` | `String` |  |
| `details` | `String` | `?` — JSON |
| `resolved` | `Boolean` | `@default(false)` |
| `resolvedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([type])` · `@@index([source])` · `@@index([resolved])` · `@@index([createdAt])`

## `ApiKey`
*Category: Audit & Compliance · defined at schema line 1471*

**Purpose:** User-generated API keys (hashed) with scopes, rotation and expiry.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` — Organization ID for team keys |
| `name` | `String` |  |
| `keyPrefix` | `String` | First 8 chars for identification (e.g. aq_live_) |
| `keyHash` | `String` | SHA-256 hash of the full key — NEVER store plaintext |
| `environment` | `String` | `@default("live")` — "live" or "test" |
| `scopes` | `String` | `@default("leads.read,leads.write")` — Comma-separated: leads.read,leads.write,workflows.read,etc. |
| `status` | `String` | `@default("active")` — active, disabled, revoked, expired |
| `isActive` | `Boolean` | `@default(true)` |
| `lastUsedAt` | `DateTime` | `?` |
| `expiresAt` | `DateTime` | `?` |
| `revokedAt` | `DateTime` | `?` |
| `rateLimitPerHour` | `Int` | `@default(1000)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `usage` → `ApiKeyUsage[]`

**Indexes/constraints:** `@@index([userId])` · `@@index([keyPrefix])` · `@@index([keyHash])` · `@@index([isActive])` · `@@index([status])` · `@@index([environment])`

## `ApiKeyUsage`
*Category: Audit & Compliance · defined at schema line 1501*

**Purpose:** Per-request usage rows for API keys.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `apiKeyId` | `String` |  |
| `userId` | `String` |  |
| `endpoint` | `String` |  |
| `method` | `String` |  |
| `statusCode` | `Int` |  |
| `responseTime` | `Int` | `?` — ms |
| `ipAddress` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `apiKey` → `ApiKey`
- `user` → `User`

**Indexes/constraints:** `@@index([apiKeyId])` · `@@index([userId])` · `@@index([endpoint])` · `@@index([createdAt])`

## `GdprRequest`
*Category: Audit & Compliance · defined at schema line 1526*

**Purpose:** GDPR data subject requests (export/delete) and their processing state.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `requestType` | `String` | access, deletion, portability, rectification |
| `status` | `String` | `@default("pending")` — pending, processing, completed, failed |
| `completedAt` | `DateTime` | `?` |
| `downloadUrl` | `String` | `?` |
| `expiresAt` | `DateTime` | `?` |
| `notes` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([requestType])` · `@@index([status])`

## `DataExport`
*Category: Audit & Compliance · defined at schema line 1545*

**Purpose:** Generated user data export files (GDPR Art. 20).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `exportType` | `String` | leads_csv, leads_pdf, deals_csv, full_json |
| `status` | `String` | `@default("pending")` — pending, processing, completed, failed |
| `fileUrl` | `String` | `?` |
| `fileSize` | `Int` | `?` |
| `recordCount` | `Int` | `?` |
| `error` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `completedAt` | `DateTime` | `?` |
| `type` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([exportType])`

## `OnboardingProgress`
*Category: Audit & Compliance · defined at schema line 1570*

**Purpose:** Step-by-step onboarding checklist state per user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `currentStep` | `Int` | `@default(0)` |
| `completed` | `Boolean` | `@default(false)` |
| `profileCompleted` | `Boolean` | `@default(false)` |
| `nichesSelected` | `Boolean` | `@default(false)` |
| `countriesSelected` | `Boolean` | `@default(false)` |
| `channelsSelected` | `Boolean` | `@default(false)` |
| `toolsConnected` | `Boolean` | `@default(false)` |
| `firstLeadAdded` | `Boolean` | `@default(false)` |
| `firstAnalysisRun` | `Boolean` | `@default(false)` |
| `bonusCreditsAwarded` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([completed])`

## `Communication`
*Category: CRM (Legacy Compatibility) · defined at schema line 1597*

**Purpose:** Legacy CRM communication log entry tied to a lead (kept for existing UI).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `orgId` | `String` | `?` |
| `channel` | `String` | `@default("email")` |
| `direction` | `String` | `@default("outbound")` |
| `content` | `String` |  |
| `messageGeneratedByAI` | `Boolean` | `@default(false)` |
| `responseSummary` | `String` | `?` |
| `intent` | `String` | `?` |
| `buyingSignals` | `String` | `?` |
| `hesitationReasons` | `String` | `?` |
| `userId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`
- `lead` → `Lead`

**Indexes/constraints:** `@@index([leadId])` · `@@index([channel])` · `@@index([userId])` · `@@index([orgId])`

## `Deal`
*Category: CRM (Legacy Compatibility) · defined at schema line 1625*

**Purpose:** Deal/opportunity record with value and stage linked to lead.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `orgId` | `String` | `?` |
| `status` | `String` | `@default("draft")` |
| `projectType` | `String` | `?` |
| `projectScope` | `String` | `?` |
| `proposedPrice` | `Float` | `?` |
| `finalPrice` | `Float` | `?` |
| `currency` | `String` | `@default("USD")` |
| `implementationTimeline` | `String` | `?` |
| `maintenancePlan` | `String` | `?` |
| `proposalContent` | `String` | `?` |
| `notes` | `String` | `?` |
| `userId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `title` | `String` | `?` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`
- `lead` → `Lead`
- `meetings` → `Meeting[]`

**Indexes/constraints:** `@@index([leadId])` · `@@index([status])` · `@@index([userId])` · `@@index([userId, status])` · `@@index([orgId])`

## `LeadActivity`
*Category: CRM (Legacy Compatibility) · defined at schema line 1658*

**Purpose:** Activity timeline entries for leads.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `orgId` | `String` | `?` |
| `type` | `String` |  |
| `description` | `String` |  |
| `metadata` | `String` | `?` |
| `userId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`
- `lead` → `Lead`

**Indexes/constraints:** `@@index([leadId])` · `@@index([type])` · `@@index([userId])` · `@@index([userId, type])` · `@@index([orgId])`

## `FollowUpReminder`
*Category: CRM (Legacy Compatibility) · defined at schema line 1681*

**Purpose:** Reminder to follow up on a lead at a future time.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` |  |
| `orgId` | `String` | `?` |
| `message` | `String` |  |
| `dueAt` | `DateTime` |  |
| `completed` | `Boolean` | `@default(false)` |
| `userId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`
- `lead` → `Lead`

**Indexes/constraints:** `@@index([leadId])` · `@@index([completed])` · `@@index([dueAt])` · `@@index([userId])` · `@@index([orgId])`

## `Insight`
*Category: CRM (Legacy Compatibility) · defined at schema line 1704*

**Purpose:** Simple stored insight strings shown in UI.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `type` | `String` |  |
| `content` | `String` |  |
| `data` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

## `UserSettings`
*Category: CRM (Legacy Compatibility) · defined at schema line 1714*

**Purpose:** Wide per-user settings table (profile, notifications, integrations flags, meeting provider, autonomy mode...).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `@unique` |
| `telegramChatId` | `String` | `?` |
| `telegramConnected` | `Boolean` | `@default(false)` |
| `whatsappNumber` | `String` | `?` |
| `whatsappConnected` | `Boolean` | `@default(false)` |
| `whatsappProvider` | `String` | `?` |
| `notificationPreferences` | `String` | `@default("{}")` |
| `dndStartTime` | `String` | `?` |
| `dndEndTime` | `String` | `?` |
| `onboardingCompleted` | `Boolean` | `@default(false)` |
| `onboardingStep` | `Int` | `@default(0)` |
| `targetNiches` | `String` | `@default("[]")` |
| `targetCountries` | `String` | `@default("[]")` |
| `targetChannels` | `String` | `@default("[]")` |
| `companyName` | `String` | `?` |
| `reminderCheckInterval` | `Int` | `@default(60)` |
| `gmailConnected` | `Boolean` | `@default(false)` |
| `gmailEmail` | `String` | `?` |
| `googleCalendarConnected` | `Boolean` | `@default(false)` |
| `meetingPlatform` | `String` | `@default("google_meet")` — google_meet, zoom, teams, custom |
| `meetingDurationDefault` | `Int` | `@default(30)` — minutes |
| `meetingBufferMinutes` | `Int` | `@default(15)` — buffer between meetings |
| `meetingWorkingHoursStart` | `String` | `@default("09:00")` |
| `meetingWorkingHoursEnd` | `String` | `@default("18:00")` |
| `meetingWorkingDays` | `String` | `@default("[1,2,3,4,5]")` — Mon-Fri |
| `meetingTimezone` | `String` | `@default("UTC")` |
| `meetingAutoSchedule` | `Boolean` | `@default(false)` — approval mode by default |
| `meetingAutonomyMode` | `String` | `@default("approval")` — approval, assisted, autonomous |
| `meetingRemindersEnabled` | `Boolean` | `@default(true)` |
| `meetingReminderMinutes` | `String` | `@default("[10,60]")` — JSON array of minutes before meeting |
| `meetingEmailConfirmation` | `Boolean` | `@default(true)` — Send confirmation email to client |
| `meetingEmailReminder` | `Boolean` | `@default(true)` — Send reminder emails |
| `calendarSyncEnabled` | `Boolean` | `@default(true)` — Sync meetings with Google Calendar |
| `calendarWatchEnabled` | `Boolean` | `@default(false)` — Google Calendar push notifications |
| `outreachAutonomyMode` | `String` | `@default("manual")` — manual, assisted, autonomous |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `theme` | `String` | `?` |
| `compactMode` | `Boolean` | `@default(false)` |
| `defaultNiche` | `String` | `?` |
| `defaultCountry` | `String` | `?` |
| `timezone` | `String` | `?` |
| `businessDescription` | `String` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])`

## `GoogleCalendarToken`
*Category: Calendar & Meetings · defined at schema line 1770*

**Purpose:** OAuth tokens for a user's Google Calendar (access/refresh, scopes, expiry).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `calendarEmail` | `String` |  |
| `accessToken` | `String` |  |
| `refreshToken` | `String` |  |
| `tokenExpiry` | `DateTime` | `?` |
| `scope` | `String` | `?` |
| `status` | `String` | `@default("active")` — active, expired, revoked |
| `lastSyncAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `isConnected` | `Boolean` | `@default(false)` |
| `lastSyncedAt` | `DateTime` | `?` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([calendarEmail])` · `@@index([status])`

## `CalendarWatch`
*Category: Calendar & Meetings · defined at schema line 1793*

**Purpose:** Google Calendar push-notification watch channels (channel id, expiry).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `channelId` | `String` |  |
| `resourceId` | `String` |  |
| `calendarEmail` | `String` |  |
| `expiration` | `DateTime` | `?` |
| `status` | `String` | `@default("active")` — active, stopped, expired |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([channelId])`

## `Meeting`
*Category: Calendar & Meetings · defined at schema line 1815*

**Purpose:** Meeting orchestrated by the platform: lead, proposed/confirmed slots, provider link, status lifecycle, AI prep/notes.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `leadId` | `String` | `?` |
| `dealId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `title` | `String` |  |
| `description` | `String` | `?` |
| `meetingType` | `String` | `@default("video")` — video, phone, in-person |
| `platform` | `String` | `@default("google_meet")` — google_meet, zoom, teams, custom |
| `meetingUrl` | `String` | `?` — Google Meet link, Zoom link, etc. |
| `calendarEventId` | `String` | `?` — Google Calendar event ID |
| `status` | `String` | `@default("scheduled")` — pending_approval, scheduled, confirmed, completed, cancelled, rescheduled |
| `startDateTime` | `DateTime` |  |
| `endDateTime` | `DateTime` |  |
| `durationMinutes` | `Int` | `@default(30)` |
| `timezone` | `String` | `@default("UTC")` |
| `agenda` | `String` | `?` — JSON: agenda items |
| `attendees` | `String` | `@default("[]")` — JSON: [{ email, name, status }] |
| `location` | `String` | `?` — Physical location for in-person |
| `conferenceData` | `String` | `?` — JSON: Google Meet/Zoom conference data |
| `reminders` | `String` | `@default("[]")` — JSON: [{ minutesBefore, type }] |
| `followUpActions` | `String` | `?` — JSON: action items after meeting |
| `notes` | `String` | `?` — Post-meeting notes |
| `recordingUrl` | `String` | `?` — Meeting recording URL |
| `createdBy` | `String` | `@default("user")` — user, ai_suggestion, ai_auto |
| `approvalStatus` | `String` | `@default("approved")` — pending, approved, rejected |
| `cancellationReason` | `String` | `?` |
| `rescheduledFrom` | `String` | `?` — ID of original meeting if rescheduled |
| `metadata` | `String` | `?` — JSON: additional data |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `actionItems` → `Json`
- `user` → `User`
- `lead` → `Lead`
- `deal` → `Deal`
- `organization` → `Organization`
- `meetingReminders` → `MeetingReminder[]`

**Indexes/constraints:** `@@index([userId])` · `@@index([leadId])` · `@@index([dealId])` · `@@index([status])` · `@@index([startDateTime])` · `@@index([calendarEventId])` · `@@index([platform])` · `@@index([createdBy])` · `@@index([userId, status])` · `@@index([orgId])`

## `MeetingIntentLog`
*Category: Calendar & Meetings · defined at schema line 1868*

**Purpose:** Detected scheduling intent from lead replies with confidence and extracted entities.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `leadId` | `String` | `?` |
| `sourceType` | `String` | email, chat, whatsapp, telegram, manual |
| `sourceId` | `String` | `?` — message/conversation ID |
| `detectedIntent` | `String` | schedule_call, book_meeting, discuss, connect, available, interested |
| `confidence` | `Float` | `@default(0)` |
| `originalText` | `String` | `?` |
| `suggestedAction` | `String` | `?` — JSON: { action, suggestedTimes, meetingType } |
| `status` | `String` | `@default("detected")` — detected, dismissed, actioned, expired |
| `actionedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([userId])` · `@@index([leadId])` · `@@index([status])` · `@@index([detectedIntent])` · `@@index([createdAt])` · `@@index([orgId])`

## `DiscoveryJob`
*Category: Lead Discovery · defined at schema line 1899*

**Purpose:** A lead-discovery run: query params, status, counts found/analyzed/qualified, error.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `status` | `String` | `@default("pending")` — pending, running, completed, failed |
| `source` | `String` | google_maps, google_business, justdial, indiamart, yelp, yellow_pages, sulekha, linkedin, instagram, facebook, ai_search |
| `niche` | `String` |  |
| `country` | `String` |  |
| `city` | `String` | `?` |
| `totalFound` | `Int` | `@default(0)` |
| `imported` | `Int` | `@default(0)` |
| `duplicates` | `Int` | `@default(0)` |
| `failed` | `Int` | `@default(0)` |
| `errorMessage` | `String` | `?` |
| `resultData` | `String` | `?` — JSON: { leads: [...] } |
| `startedAt` | `DateTime` | `?` |
| `completedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `total` | `Int` | `@default(0)` |
| `progress` | `Int` | `@default(0)` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([source])` · `@@index([orgId])`

## `SecurityAlert`
*Category: Security · defined at schema line 1935*

**Purpose:** Raised security alerts for a user (new device, suspicious login, lock).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `alertType` | `String` | suspicious_login, new_device, impossible_travel, brute_force, account_locked |
| `ipAddress` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `country` | `String` | `?` |
| `city` | `String` | `?` |
| `isResolved` | `Boolean` | `@default(false)` |
| `resolvedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([alertType])` · `@@index([isResolved])` · `@@index([createdAt])`

## `KnownDevice`
*Category: Security · defined at schema line 1957*

**Purpose:** Fingerprinted trusted devices per user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `deviceFingerprint` | `String` |  |
| `deviceName` | `String` |  |
| `lastSeenAt` | `DateTime` | `@default(now())` |
| `isTrusted` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@unique([userId, deviceFingerprint])` · `@@index([userId])` · `@@index([deviceFingerprint])` · `@@index([lastSeenAt])`

## `SystemMetrics`
*Category: Monitoring · defined at schema line 1980*

**Purpose:** Point-in-time system metrics (memory, latency, counts) for monitoring.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `source` | `String` | nextjs, fastapi, redis, celery, system |
| `metricType` | `String` | cpu, memory, disk, request_rate, error_rate, latency, connections, queue_length |
| `metricName` | `String` | specific metric name (e.g., http_requests_total, cpu_usage_percent) |
| `value` | `Float` |  |
| `unit` | `String` | `?` — percent, bytes, requests, milliseconds, count |
| `labels` | `String` | `?` — JSON: additional labels for the metric (method, path, status, etc.) |
| `hostname` | `String` | `?` |
| `environment` | `String` | `?` — production, staging, development |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([source])` · `@@index([metricType])` · `@@index([metricName])` · `@@index([createdAt])` · `@@index([environment])`

## `AiCostRecord`
*Category: AI · defined at schema line 2004*

**Purpose:** Per-call AI cost accounting: provider, model, tokens, estimated cost, feature.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `feature` | `String` | discovery, enrichment, chat, sales_coach, proposal, competitor, vector_search, rag |
| `model` | `String` | auto, gpt-4, gpt-4-turbo, gpt-3.5-turbo, claude-3, unknown |
| `inputTokens` | `Int` | `@default(0)` |
| `outputTokens` | `Int` | `@default(0)` |
| `costUsd` | `Float` | `@default(0)` |
| `requestId` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([feature])` · `@@index([model])` · `@@index([costUsd])` · `@@index([createdAt])`

## `PromptTemplate`
*Category: AI · defined at schema line 2029*

**Purpose:** Reusable AI prompt templates per user/feature.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `name` | `String` |  |
| `version` | `Int` |  |
| `content` | `String` |  |
| `isActive` | `Boolean` | `@default(true)` |
| `metadata` | `String` | `@default("{}")` — JSON |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([name])` · `@@index([version])` · `@@index([isActive])` · `@@index([createdAt])`

## `FileContext`
*Category: AI · defined at schema line 2054*

**Purpose:** Files uploaded to give AI chat additional context (parsed text).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `leadId` | `String` | `?` |
| `fileName` | `String` |  |
| `fileType` | `String` | text, csv, json, markdown, pdf_text |
| `content` | `String` |  |
| `chunks` | `String` | `@default("[]")` — JSON array of DocumentChunk objects |
| `embedding` | `String` | `?` — JSON: document-level embedding vector |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([leadId])` · `@@index([fileType])` · `@@index([createdAt])`

## `ProxyEndpoint`
*Category: Scraping Infrastructure · defined at schema line 2079*

**Purpose:** Rotating proxy pool endpoints with health stats for scraping.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `url` | `String` | `@unique` |
| `type` | `String` | `@default("datacenter")` — datacenter, residential, mobile, isp |
| `isActive` | `Boolean` | `@default(true)` |
| `successRate` | `Float` | `@default(1.0)` |
| `avgLatency` | `Int` | `@default(0)` |
| `lastUsedAt` | `DateTime` | `?` |
| `failureCount` | `Int` | `@default(0)` |
| `totalRequests` | `Int` | `@default(0)` |
| `successCount` | `Int` | `@default(0)` |
| `lastError` | `String` | `?` |
| `rateLimitPerMinute` | `Int` | `@default(60)` |
| `currentMinuteRequests` | `Int` | `@default(0)` |
| `minuteResetAt` | `DateTime` | `?` |
| `country` | `String` | `?` |
| `provider` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([isActive])` · `@@index([type])` · `@@index([successRate])` · `@@index([lastUsedAt])`

## `ScrapingMetric`
*Category: Scraping Infrastructure · defined at schema line 2106*

**Purpose:** Scrape attempt outcomes for observability (success, duration, blocks).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `source` | `String` | ai_search, google_maps, justdial, etc. |
| `totalRequests` | `Int` | `@default(0)` |
| `successCount` | `Int` | `@default(0)` |
| `failCount` | `Int` | `@default(0)` |
| `avgResponseTime` | `Int` | `@default(0)` |
| `rateLimitHits` | `Int` | `@default(0)` |
| `date` | `DateTime` |  |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@unique([source, date])` · `@@index([source])` · `@@index([date])` · `@@index([rateLimitHits])`

## `RealtimeEvent`
*Category: Realtime · defined at schema line 2129*

**Purpose:** Persisted realtime events delivered over WebSocket/SSE.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `channel` | `String` | lead_events, payment_events, notification_events, message_events, workflow_events, ai_events |
| `eventType` | `String` | specific event type within the channel |
| `payload` | `String` | JSON event data |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `eventId` | `String` | `@unique` — deduplication ID |
| `deliveredAt` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`
- `organization` → `Organization`

**Indexes/constraints:** `@@index([channel])` · `@@index([eventType])` · `@@index([userId])` · `@@index([orgId])` · `@@index([eventId])` · `@@index([deliveredAt])` · `@@index([createdAt])`

## `WsConnection`
*Category: Realtime · defined at schema line 2153*

**Purpose:** Active WebSocket connection registry.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `socketId` | `String` |  |
| `rooms` | `String` | `@default("[]")` — JSON array of room names |
| `connectedAt` | `DateTime` | `@default(now())` |
| `lastHeartbeat` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([socketId])` · `@@index([lastHeartbeat])`

## `SseConnection`
*Category: Realtime · defined at schema line 2168*

**Purpose:** Active Server-Sent-Events connection registry.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `channel` | `String` | notifications, payments, messages, ai |
| `lastEventId` | `String` | `?` |
| `connectedAt` | `DateTime` | `@default(now())` |
| `lastActivity` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([channel])` · `@@index([lastActivity])`

## `MediaFile`
*Category: Messaging Hub · defined at schema line 2187*

**Purpose:** Uploaded media for messaging (images/docs) with metadata.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `fileName` | `String` |  |
| `fileType` | `String` | image, document, audio, video |
| `fileSize` | `Int` |  |
| `mimeType` | `String` |  |
| `filePath` | `String` |  |
| `thumbnailPath` | `String` | `?` |
| `metadata` | `String` | `?` — JSON: { width, height, duration, originalName, etc. } |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([fileType])` · `@@index([mimeType])` · `@@index([createdAt])`

## `MessageBroadcast`
*Category: Messaging Hub · defined at schema line 2209*

**Purpose:** Bulk message campaign across channels with scheduling.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `orgId` | `String` | `?` |
| `name` | `String` |  |
| `channel` | `String` | whatsapp, telegram, email |
| `audienceFilter` | `String` | `?` — JSON: { tags, stage, lastContactedBefore, minScore, country, niche, etc. } |
| `messageContent` | `String` |  |
| `templateId` | `String` | `?` |
| `status` | `String` | `@default("draft")` — draft, scheduled, running, paused, completed, cancelled |
| `scheduledAt` | `DateTime` | `?` |
| `totalTargets` | `Int` | `@default(0)` |
| `deliveredCount` | `Int` | `@default(0)` |
| `readCount` | `Int` | `@default(0)` |
| `respondedCount` | `Int` | `@default(0)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `targets` → `BroadcastTarget[]`

**Indexes/constraints:** `@@index([userId])` · `@@index([channel])` · `@@index([status])` · `@@index([scheduledAt])` · `@@index([createdAt])`

## `BroadcastTarget`
*Category: Messaging Hub · defined at schema line 2238*

**Purpose:** Per-recipient row of a broadcast with delivery state.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `broadcastId` | `String` |  |
| `leadId` | `String` |  |
| `status` | `String` | `@default("pending")` — pending, sent, delivered, read, responded, failed, opted_out |
| `sentAt` | `DateTime` | `?` |
| `deliveredAt` | `DateTime` | `?` |
| `readAt` | `DateTime` | `?` |
| `respondedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `broadcast` → `MessageBroadcast`
- `lead` → `Lead`

**Indexes/constraints:** `@@index([broadcastId])` · `@@index([leadId])` · `@@index([status])` · `@@index([sentAt])`

## `MessageTemplateApproval`
*Category: Messaging Hub · defined at schema line 2260*

**Purpose:** Approval workflow for message templates (esp. WhatsApp).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `name` | `String` |  |
| `category` | `String` | marketing, utility, authentication |
| `content` | `String` |  |
| `status` | `String` | `@default("pending")` — pending, approved, rejected, active, disabled |
| `rejectionReason` | `String` | `?` |
| `submittedAt` | `DateTime` | `?` |
| `approvedAt` | `DateTime` | `?` |
| `version` | `Int` | `@default(1)` |
| `metadata` | `String` | `?` — JSON: { language, variables, channel, previousVersion, etc. } |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([category])` · `@@index([status])` · `@@index([name])` · `@@index([createdAt])`

## `ScheduledEmail`
*Category: Email Scheduling & Tracking · defined at schema line 2289*

**Purpose:** Email scheduled for future sending with status and send attempt info.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `leadId` | `String` | `?` |
| `to` | `String` |  |
| `subject` | `String` |  |
| `body` | `String` |  |
| `scheduledAt` | `DateTime` |  |
| `status` | `String` | `@default("pending")` — pending, sending, sent, failed, cancelled |
| `emailAccountId` | `String` | `?` |
| `trackingPixelId` | `String` | `?` |
| `metadata` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`
- `emailAccount` → `EmailAccount`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([scheduledAt])` · `@@index([leadId])` · `@@index([emailAccountId])` · `@@index([trackingPixelId])`

## `EmailOpenEvent`
*Category: Email Scheduling & Tracking · defined at schema line 2316*

**Purpose:** Tracking-pixel open events (timestamp, UA, IP).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `trackingPixelId` | `String` |  |
| `ipAddress` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `country` | `String` | `?` |
| `city` | `String` | `?` |
| `openedAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([trackingPixelId])` · `@@index([openedAt])` · `@@index([country])` · `@@index([city])`

## `EmailClickEvent`
*Category: Email Scheduling & Tracking · defined at schema line 2331*

**Purpose:** Link click events from tracked links.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `trackingLinkId` | `String` |  |
| `url` | `String` |  |
| `ipAddress` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `clickedAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([trackingLinkId])` · `@@index([clickedAt])` · `@@index([url])`

## `EmailTrackingLink`
*Category: Email Scheduling & Tracking · defined at schema line 2344*

**Purpose:** Wrapped tracking links generated for emails.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `emailMessageId` | `String` | `?` |
| `originalUrl` | `String` |  |
| `trackingId` | `String` | `@unique` |
| `clickCount` | `Int` | `@default(0)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([emailMessageId])` · `@@index([trackingId])` · `@@index([originalUrl])`

## `MeetingReminder`
*Category: Calendar & Meetings · defined at schema line 2363*

**Purpose:** Queued reminder for a meeting (channel, scheduledFor, sent).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `meetingId` | `String` |  |
| `userId` | `String` |  |
| `remindAt` | `DateTime` |  |
| `type` | `String` | `@default("popup")` — popup, email, both |
| `minutesBefore` | `Int` |  |
| `sent` | `Boolean` | `@default(false)` |
| `sentAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `meeting` → `Meeting`
- `user` → `User`

**Indexes/constraints:** `@@index([meetingId])` · `@@index([userId])` · `@@index([remindAt])` · `@@index([sent])`

## `MessageDelivery`
*Category: Messaging Hub · defined at schema line 2391*

**Purpose:** Cross-channel delivery record with full lifecycle (pending->queued->sent->delivered->read / failed->bounced) and provider receipts.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `conversationId` | `String` | `?` |
| `leadId` | `String` | `?` |
| `channel` | `String` | `@default("email")` — email, telegram, whatsapp, linkedin, instagram |
| `provider` | `String` | `?` — gmail, telegram_bot, meta, twilio, etc. |
| `providerMessageId` | `String` | `?   @unique` — External message ID from provider (dedup key) |
| `direction` | `String` | `@default("outbound")` — inbound, outbound |
| `status` | `String` | `@default("pending")` — pending, queued, sent, delivered, read, failed, bounced |
| `content` | `String` | `?` — Message content |
| `contentMetadata` | `String` | `?` — JSON: extra content info (media type, template vars, etc.) |
| `recipientId` | `String` | `?` — Recipient identifier (email, phone, chat ID) |
| `recipientName` | `String` | `?` |
| `senderId` | `String` | `?` |
| `templateId` | `String` | `?` |
| `templateName` | `String` | `?` |
| `metadata` | `String` | `?` — JSON: arbitrary metadata (workflow step, tracking, etc.) |
| `errorMessage` | `String` | `?` — Latest error message |
| `errorCategory` | `String` | `?` — Categorized error: rate_limit, auth_failure, network_error, content_rejected, recipient_invalid, provider_error, unknown |
| `retryCount` | `Int` | `@default(0)` |
| `maxRetries` | `Int` | `@default(3)` |
| `nextRetryAt` | `DateTime` | `?` |
| `lastRetryAt` | `DateTime` | `?` |
| `sentAt` | `DateTime` | `?` |
| `deliveredAt` | `DateTime` | `?` |
| `readAt` | `DateTime` | `?` |
| `failedAt` | `DateTime` | `?` |
| `deadLettered` | `Boolean` | `@default(false)` |
| `deadLetterReason` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([conversationId])` · `@@index([leadId])` · `@@index([channel])` · `@@index([status])` · `@@index([direction])` · `@@index([templateName])` · `@@index([createdAt])` · `@@index([status, nextRetryAt])` · `@@index([deadLettered])` · `@@index([userId, status])`

## `DeliveryDeadLetter`
*Category: Messaging Hub · defined at schema line 2445*

**Purpose:** Dead-letter queue for failed message deliveries after retries.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `deliveryId` | `String` | `@unique` — Original delivery record ID |
| `userId` | `String` |  |
| `channel` | `String` |  |
| `recipientId` | `String` | `?` |
| `recipientName` | `String` | `?` |
| `content` | `String` | `?` |
| `errorCategory` | `String` | `?` |
| `failureSummary` | `String` | Concatenated error history |
| `retryCount` | `Int` |  |
| `maxRetries` | `Int` |  |
| `originalCreatedAt` | `DateTime` |  |
| `deadLetteredAt` | `DateTime` | `@default(now())` |
| `resolved` | `Boolean` | `@default(false)` |
| `resolvedAt` | `DateTime` | `?` |
| `resolutionNote` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `user` → `User`

**Indexes/constraints:** `@@index([userId])` · `@@index([channel])` · `@@index([errorCategory])` · `@@index([resolved])` · `@@index([deadLetteredAt])`

## `FeedbackReport`
*Category: Feedback & Support · defined at schema line 2478*

**Purpose:** User-submitted feedback/bug report with category, severity, screenshots, admin status + assignment.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `ticketNumber` | `String` | `@unique` |
| `type` | `String` |  |
| `title` | `String` |  |
| `description` | `String` |  |
| `severity` | `String` | `@default("medium")` |
| `priority` | `String` | `@default("medium")` |
| `status` | `String` | `@default("new")` |
| `assignedTo` | `String` | `?` |
| `pageUrl` | `String` | `?` |
| `previousPageUrl` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `browserName` | `String` | `?` |
| `browserVersion` | `String` | `?` |
| `osName` | `String` | `?` |
| `osVersion` | `String` | `?` |
| `screenResolution` | `String` | `?` |
| `timezone` | `String` | `?` |
| `locale` | `String` | `?` |
| `networkType` | `String` | `?` |
| `appVersion` | `String` | `?` |
| `sessionId` | `String` | `?` |
| `stackTrace` | `String` | `?` |
| `duplicateOf` | `String` | `?` |
| `reproSteps` | `String` | `?` |
| `expectedBehavior` | `String` | `?` |
| `actualBehavior` | `String` | `?` |
| `aiSeverity` | `String` | `?` |
| `aiModule` | `String` | `?` |
| `aiDuplicateScore` | `Float` | `?` |
| `resolutionNotes` | `String` | `?` |
| `resolvedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations:**
- `navigationHistory` → `Json`
- `lastApiRequests` → `Json`
- `errorLogs` → `Json`
- `performanceData` → `Json`
- `attachments` → `Json`
- `tags` → `Json`
- `labels` → `Json`
- `aiClassification` → `Json`
- `user` → `User`
- `comments` → `FeedbackComment[]`
- `statusHistory` → `FeedbackStatusLog[]`

**Indexes/constraints:** `@@index([userId])` · `@@index([status])` · `@@index([type])` · `@@index([severity])` · `@@index([priority])` · `@@index([assignedTo])` · `@@index([createdAt])`

## `FeedbackComment`
*Category: Feedback & Support · defined at schema line 2536*

**Purpose:** Discussion comments on a feedback report.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `feedbackId` | `String` |  |
| `authorId` | `String` |  |
| `authorRole` | `String` | `@default("user")` |
| `content` | `String` |  |
| `isInternal` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `feedback` → `FeedbackReport`

**Indexes/constraints:** `@@index([feedbackId])` · `@@index([authorId])`

## `FeedbackStatusLog`
*Category: Feedback & Support · defined at schema line 2551*

**Purpose:** Status change history of a feedback report.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `feedbackId` | `String` |  |
| `fromStatus` | `String` |  |
| `toStatus` | `String` |  |
| `changedBy` | `String` |  |
| `note` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `feedback` → `FeedbackReport`

**Indexes/constraints:** `@@index([feedbackId])`

## `CrashReport`
*Category: Feedback & Support · defined at schema line 2565*

**Purpose:** Client crash reports (stack, browser, url) for debugging.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `errorMessage` | `String` |  |
| `stackTrace` | `String` | `?` |
| `componentName` | `String` | `?` |
| `pageUrl` | `String` | `?` |
| `userAgent` | `String` | `?` |
| `resolved` | `Boolean` | `@default(false)` |
| `createdAt` | `DateTime` | `@default(now())` |

**Relations:**
- `sessionData` → `Json`

**Indexes/constraints:** `@@index([errorMessage])` · `@@index([userId])` · `@@index([createdAt])` · `@@index([resolved])`

## `AcquisitionCampaign`
*Category: Campaigns & Reporting · defined at schema line 2590*

**Purpose:** Campaign grouping discovery+outreach efforts with budget/goals.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `status` | `String` | `@default("pending")` |
| `niche` | `String` | `?` |
| `country` | `String` | `?` |
| `city` | `String` | `?` |
| `source` | `String` | `?` |
| `channel` | `String` | `?` |
| `tone` | `String` | `?` |
| `maxLeads` | `Int` | `?` |
| `customInstructions` | `String` | `?` |
| `errorMessage` | `String` | `?` |
| `discoveryJobId` | `String` | `?` |
| `autoSend` | `Boolean` | `@default(false)` |
| `discovered` | `Int` | `@default(0)` |
| `totalLeads` | `Int` | `@default(0)` |
| `analyzed` | `Int` | `@default(0)` |
| `outreachGenerated` | `Int` | `@default(0)` |
| `sent` | `Int` | `@default(0)` |
| `errors` | `Int` | `@default(0)` |
| `completedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([userId])` · `@@index([status])`

## `Report`
*Category: Campaigns & Reporting · defined at schema line 2620*

**Purpose:** Saved report definition + last result (scheduled or on-demand).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `name` | `String` | `?` |
| `description` | `String` | `?` |
| `type` | `String` | `?` |
| `dashboard` | `String` | `?` |
| `filters` | `String` | `?` |
| `chartConfig` | `String` | `?` |
| `scheduleCron` | `String` | `?` |
| `exportFormat` | `String` | `?` |
| `lastExportUrl` | `String` | `?` |
| `isPublic` | `Boolean` | `@default(false)` |
| `lastRunAt` | `DateTime` | `?` |
| `nextRunAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([userId])`

## `CompetitorSnapshot`
*Category: Campaigns & Reporting · defined at schema line 2642*

**Purpose:** Point-in-time snapshot of a competitor website/pricing.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `competitorId` | `String` |  |
| `userId` | `String` | `?` |
| `snapshotType` | `String` | `?` |
| `seoScore` | `Float` | `?` |
| `socialScore` | `Float` | `?` |
| `pricingModel` | `String` | `?` |
| `techStack` | `String` | `?` |
| `strengths` | `String` | `?` |
| `weaknesses` | `String` | `?` |
| `estimatedTraffic` | `Int` | `?` |
| `rawData` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([competitorId])`

## `MessageTemplate`
*Category: Campaigns & Reporting · defined at schema line 2660*

**Purpose:** Reusable message templates for outreach/messaging.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `name` | `String` | `?` |
| `channel` | `String` | `?` |
| `category` | `String` | `?` |
| `subject` | `String` | `?` |
| `body` | `String` | `?` |
| `variables` | `String` | `?` |
| `usageCount` | `Int` | `@default(0)` |
| `isAiGenerated` | `Boolean` | `@default(false)` |
| `isDefault` | `Boolean` | `@default(false)` |
| `lastUsedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `content` | `String` | `?` |

**Indexes/constraints:** `@@index([userId])`

## `AnalyticsPrediction`
*Category: Analytics Engine · defined at schema line 2681*

**Purpose:** ML-style predictions (revenue, churn, pipeline) with confidence.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `category` | `String` | `?` |
| `predictionType` | `String` | `?` |
| `targetEntityId` | `String` | `?` |
| `predictedValue` | `Float` | `?` |
| `actualValue` | `Float` | `?` |
| `confidence` | `Float` | `?` |
| `modelVersion` | `String` | `?` |
| `inputData` | `String` | `?` |
| `predictionHorizon` | `String` | `?` |
| `expiresAt` | `DateTime` | `?` |
| `actualizedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([userId])`

## `AnalyticsInsight`
*Category: Analytics Engine · defined at schema line 2702*

**Purpose:** Auto-generated insights for dashboards.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `category` | `String` | `?` |
| `insightType` | `String` | `?` |
| `title` | `String` | `?` |
| `description` | `String` | `?` |
| `impact` | `String` | `?` |
| `metricName` | `String` | `?` |
| `metricBefore` | `Float` | `?` |
| `metricAfter` | `Float` | `?` |
| `changePercent` | `Float` | `?` |
| `dataSource` | `String` | `?` |
| `isActionable` | `Boolean` | `@default(false)` |
| `isRead` | `Boolean` | `@default(false)` |
| `actionSuggestion` | `String` | `?` |
| `validUntil` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([userId])`

## `AnalyticsAnomaly`
*Category: Analytics Engine · defined at schema line 2725*

**Purpose:** Detected anomalies in metrics with severity.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `category` | `String` | `?` |
| `anomalyType` | `String` | `?` |
| `severity` | `String` | `?` |
| `metricName` | `String` | `?` |
| `expectedValue` | `Float` | `?` |
| `actualValue` | `Float` | `?` |
| `deviation` | `Float` | `?` |
| `description` | `String` | `?` |
| `status` | `String` | `@default("open")` |
| `resolvedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([userId])`

## `DashboardShare`
*Category: Analytics Engine · defined at schema line 2744*

**Purpose:** Shared dashboard links (token, scope, expiry).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `dashboardId` | `String` | `?` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `allowedUsers` | `String` | `?` |
| `orgSharing` | `Boolean` | `@default(false)` |
| `accessCount` | `Int` | `@default(0)` |
| `isActive` | `Boolean` | `@default(true)` |
| `expiresAt` | `DateTime` | `?` |
| `lastAccessedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |
| `dashboardType` | `String` | `?` |
| `shareToken` | `String` | `?` |
| `permissions` | `String` | `?` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes/constraints:** `@@index([dashboardId])`

## `AnalyticsFormula`
*Category: Analytics Engine · defined at schema line 2764*

**Purpose:** Custom metric formulas defined by user.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `name` | `String` | `?` |
| `description` | `String` | `?` |
| `formula` | `String` | `?` |
| `variables` | `String` | `?` |
| `resultType` | `String` | `?` |
| `category` | `String` | `?` |
| `isPublic` | `Boolean` | `@default(false)` |
| `lastResult` | `Float` | `?` |
| `lastComputedAt` | `DateTime` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([userId])`

## `RagDocument`
*Category: Analytics Engine · defined at schema line 2782*

**Purpose:** Documents ingested for RAG context (source, chunks, embeddings meta).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `leadId` | `String` | `?` |
| `userId` | `String` | `?` |
| `title` | `String` | `?` |
| `type` | `String` | `?` |
| `content` | `String` | `?` |
| `chunkIndex` | `Int` | `?` |
| `keywords` | `String` | `?` |
| `source` | `String` | `?` |
| `metadata` | `String` | `?` |
| `tfidfScores` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([leadId])`

## `AnalyticsBenchmark`
*Category: Analytics Engine · defined at schema line 2799*

**Purpose:** Benchmark comparisons (industry/region).

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` | `?` |
| `orgId` | `String` | `?` |
| `category` | `String` | `?` |
| `benchmarkType` | `String` | `?` |
| `metricName` | `String` | `?` |
| `yourValue` | `Float` | `?` |
| `benchmarkValue` | `Float` | `?` |
| `percentile` | `Float` | `?` |
| `comparisonGroup` | `String` | `?` |
| `periodStart` | `DateTime` | `?` |
| `periodEnd` | `DateTime` | `?` |
| `dataPoints` | `Int` | `?` |
| `metadata` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@index([userId])`

## `AnalyticsSnapshot`
*Category: Analytics Engine · defined at schema line 2819*

**Purpose:** Periodic snapshot of dashboard metrics for trend history.

| Field | Type | Attributes / Default |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `userId` | `String` |  |
| `category` | `String` |  |
| `period` | `String` |  |
| `periodStart` | `DateTime` |  |
| `periodEnd` | `DateTime` | `?` |
| `metrics` | `String` | `?` |
| `createdAt` | `DateTime` | `@default(now())` |

**Indexes/constraints:** `@@unique([userId, category, period, periodStart])` · `@@index([userId])`
