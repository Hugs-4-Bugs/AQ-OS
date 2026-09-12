# Task 1-a: Fix Prisma Schema - Add Missing Models and Fields

## Work Log

### Existing Models Modified (5 models):

1. **WhatsappConfig** — Added 9 fields before `createdAt`:
   - `healthStatus` (String?, default "unknown")
   - `twilioAccountSid` (String?)
   - `twilioAuthToken` (String?)
   - `metaAccessToken` (String?)
   - `metaPhoneNumberId` (String?)
   - `metaWabaId` (String?)
   - `reconnectAttempts` (Int, default 0)
   - `lastHealthCheckAt` (DateTime?)
   - `lastWebhookAt` (DateTime?)
   - `errorMessage` (String?)

2. **TelegramConfig** — Added 5 fields before `createdAt`:
   - `botToken` (String?)
   - `botUsername` (String?)
   - `healthStatus` (String?, default "unknown")
   - `lastWebhookAt` (DateTime?)
   - `errorMessage` (String?)

3. **WorkflowDefinition** — Added 8 fields before `createdAt`:
   - `maxConcurrency` (Int, default 1)
   - `maxRetries` (Int, default 3)
   - `runCount` (Int, default 0)
   - `successCount` (Int, default 0)
   - `failureCount` (Int, default 0)
   - `avgRuntimeMs` (Int, default 0)
   - `lastRunAt` (DateTime?)
   - `webhookPath` (String?)

4. **WorkflowExecution** — Added 2 fields before `createdAt`:
   - `durationMs` (Int?)
   - `lastRetryAt` (DateTime?)

5. **DataExport** — Added 1 field:
   - `type` (String, default "full_export")

6. **MessageDelivery** — Added 6 fields + 2 indexes to existing model (already existed at line 965):
   - `providerRef` (String?)
   - `attempts` (Int, default 0)
   - `maxAttempts` (Int, default 3)
   - `lastAttemptAt` (DateTime?)
   - `errorJson` (String?)
   - `metadataJson` (String?)
   - Added `@@index([recipientId])`
   - Added `@@index([nextRetryAt])`

### New Models Added (3 models — MessageDelivery already existed):

1. **CompetitorSnapshot** — For competitor intelligence service
   - Fields: id, competitorDataId, snapshotDate, seoScore, socialScore, trafficEstimate, metricsJson, createdAt, updatedAt
   - Indexes: competitorDataId, snapshotDate

2. **AnalyticsAnomaly** — For analytics engine and anomaly detection
   - Fields: id, userId, metric, value, expectedMin, expectedMax, severity, status, detectedAt, resolvedAt, contextJson, dataSource, createdAt, updatedAt
   - Indexes: userId, metric, severity, status, detectedAt

3. **GoogleCalendarToken** — For calendar intelligence
   - Fields: id, userId (unique), email, accessToken, refreshToken, tokenExpiry, scope, tokenType, createdAt, updatedAt
   - Indexes: userId, email

### Validation Results:
- `npx prisma validate` → **Valid** ✅
- `bun run db:push` → **Synced** ✅ (74ms)
- `npx prisma generate` → **Generated** ✅ (Prisma Client v6.19.2)

### Important Notes:
- **MessageDelivery** already existed in the schema (line 965). Instead of creating a duplicate, added the missing fields (`providerRef`, `attempts`, `maxAttempts`, `lastAttemptAt`, `errorJson`, `metadataJson`) and indexes to the existing model.
- **Auth models** (User, UserSession, LoginHistory, MfaConfig) were NOT touched per instructions.
