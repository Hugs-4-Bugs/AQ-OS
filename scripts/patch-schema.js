#!/usr/bin/env node
/* Patch prisma/schema.prisma:
   1. Append missing models (additive, standalone, JSON-as-String convention)
   2. Insert missing fields into existing model blocks
   Idempotent: skips fields/models already present. */
const fs = require('fs');
const SCHEMA = '/home/z/my-project/prisma/schema.prisma';
let src = fs.readFileSync(SCHEMA, 'utf8');

const N = '\n';

// ── 1. New models ─────────────────────────────────────────────────
const NEW_MODELS = `
// ═══════════════════════════════════════════════════════════════════
// EXTENDED FEATURE MODELS — added to align Prisma Client with the
// service-layer code (analytics engines, competitor intelligence,
// messaging integrations, reports, RAG, sharing). Additive only:
// standalone tables, no FK constraints, JSON stored as String (SQLite).
// ═══════════════════════════════════════════════════════════════════

model AcquisitionCampaign {
  id                 String    @id @default(cuid())
  userId             String?
  orgId              String?
  status             String    @default("pending")
  niche              String?
  country            String?
  city               String?
  source             String?
  channel            String?
  tone               String?
  maxLeads           Int?
  customInstructions String?
  errorMessage       String?
  discoveryJobId     String?
  autoSend           Boolean   @default(false)
  discovered         Int       @default(0)
  totalLeads         Int       @default(0)
  analyzed           Int       @default(0)
  outreachGenerated  Int       @default(0)
  sent               Int       @default(0)
  errors             Int       @default(0)
  completedAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@index([userId])
  @@index([status])
}

model Report {
  id            String    @id @default(cuid())
  userId        String?
  orgId         String?
  name          String?
  description   String?
  type          String?
  dashboard     String?
  filters       String?
  chartConfig   String?
  scheduleCron  String?
  exportFormat  String?
  lastExportUrl String?
  isPublic      Boolean   @default(false)
  lastRunAt     DateTime?
  nextRunAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([userId])
}

model CompetitorSnapshot {
  id              String   @id @default(cuid())
  competitorId    String
  userId          String?
  snapshotType    String?
  seoScore        Float?
  socialScore     Float?
  pricingModel    String?
  techStack       String?
  strengths       String?
  weaknesses      String?
  estimatedTraffic Int?
  rawData         String?
  createdAt       DateTime @default(now())

  @@index([competitorId])
}

model MessageTemplate {
  id            String    @id @default(cuid())
  userId        String?
  orgId         String?
  name          String?
  channel       String?
  category      String?
  subject       String?
  body          String?
  variables     String?
  usageCount    Int       @default(0)
  isAiGenerated Boolean   @default(false)
  isDefault     Boolean   @default(false)
  lastUsedAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([userId])
}

model AnalyticsPrediction {
  id               String    @id @default(cuid())
  userId           String?
  orgId            String?
  category         String?
  predictionType   String?
  targetEntityId   String?
  predictedValue   Float?
  actualValue      Float?
  confidence       Float?
  modelVersion     String?
  inputData        String?
  predictionHorizon String?
  expiresAt        DateTime?
  actualizedAt     DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([userId])
}

model AnalyticsInsight {
  id               String    @id @default(cuid())
  userId           String?
  orgId            String?
  category         String?
  insightType      String?
  title            String?
  description      String?
  impact           String?
  metricName       String?
  metricBefore     Float?
  metricAfter      Float?
  changePercent    Float?
  dataSource       String?
  isActionable     Boolean   @default(false)
  isRead           Boolean   @default(false)
  actionSuggestion String?
  validUntil       DateTime?
  createdAt        DateTime  @default(now())

  @@index([userId])
}

model AnalyticsAnomaly {
  id            String    @id @default(cuid())
  userId        String?
  orgId         String?
  category      String?
  anomalyType   String?
  severity      String?
  metricName    String?
  expectedValue Float?
  actualValue   Float?
  deviation     Float?
  description   String?
  status        String    @default("open")
  resolvedAt    DateTime?
  createdAt     DateTime  @default(now())

  @@index([userId])
}

model DashboardShare {
  id             String    @id @default(cuid())
  dashboardId    String?
  userId         String?
  orgId          String?
  allowedUsers   String?
  orgSharing     Boolean   @default(false)
  accessCount    Int       @default(0)
  isActive       Boolean   @default(true)
  expiresAt      DateTime?
  lastAccessedAt DateTime?
  createdAt      DateTime  @default(now())

  @@index([dashboardId])
}

model AnalyticsFormula {
  id              String    @id @default(cuid())
  userId          String?
  orgId           String?
  name            String?
  description     String?
  formula         String?
  variables       String?
  resultType      String?
  category        String?
  isPublic        Boolean   @default(false)
  lastResult      Float?
  lastComputedAt  DateTime?
  createdAt       DateTime  @default(now())

  @@index([userId])
}

model RagDocument {
  id          String   @id @default(cuid())
  leadId      String?
  userId      String?
  title       String?
  type        String?
  content     String?
  chunkIndex  Int?
  keywords    String?
  source      String?
  metadata    String?
  tfidfScores String?
  createdAt   DateTime @default(now())

  @@index([leadId])
}

model AnalyticsBenchmark {
  id              String    @id @default(cuid())
  userId          String?
  orgId           String?
  category        String?
  benchmarkType   String?
  metricName      String?
  yourValue       Float?
  benchmarkValue  Float?
  percentile      Float?
  comparisonGroup String?
  periodStart     DateTime?
  periodEnd       DateTime?
  dataPoints      Int?
  metadata        String?
  createdAt       DateTime  @default(now())

  @@index([userId])
}

model AnalyticsSnapshot {
  id         String   @id @default(cuid())
  userId     String
  category   String
  period     String
  periodStart DateTime
  periodEnd  DateTime?
  metrics    String?
  createdAt  DateTime @default(now())

  @@unique([userId, category, period, periodStart])
  @@index([userId])
}
`;

if (!src.includes('model AcquisitionCampaign')) {
  src = src.replace(/\s*$/, N) + NEW_MODELS;
  console.log('appended new models block');
}

// ── 2. Fields to add to existing models ───────────────────────────
const ADDITIONS = {
  Deal: ['title String?'],
  Invoice: ['status String?'],
  GoogleCalendarToken: ['isConnected Boolean @default(false)', 'lastSyncedAt DateTime?'],
  WorkflowExecution: ['durationMs Int?', 'isDeadLetter Boolean @default(false)', 'lastRetryAt DateTime?', 'userId String?'],
  WorkflowDefinition: ['runCount Int @default(0)', 'successCount Int @default(0)', 'failureCount Int @default(0)', 'avgRuntimeMs Float?', 'lastRunAt DateTime?', 'webhookPath String?'],
  DiscoveryJob: ['total Int @default(0)', 'progress Int @default(0)'],
  UserSettings: ['theme String?'],
  User: ['bio String?', 'consecutivePaymentFailures Int @default(0)'],
  TelegramConfig: ['webhookSecret String?', 'lastWebhookAt DateTime?', 'botToken String?', 'healthStatus String?', 'mode String?', 'webhookUrl String?', 'reconnectAttempts Int @default(0)'],
  WhatsappConfig: ['metaVerifyToken String?', 'metaWebhookVerified Boolean @default(false)', 'metaPhoneNumberId String?', 'metaWabaId String?', 'twilioAccountSid String?', 'lastTemplateSyncAt DateTime?', 'metaAccessToken String?', 'healthStatus String?', 'reconnectAttempts Int @default(0)', 'lastWebhookAt DateTime?'],
  CompetitorAnalysis: ['opportunityScore Float?', 'pricingDetails String?', 'socialProfiles String?', 'reviewsData String?', 'pageSpeedData String?', 'aiComparisonData String?', 'lighthouseData String?'],
  CompetitorData: ['description String?', 'techStackData String?', 'pageSpeedScore Float?', 'seoMetadata String?', 'socialProfiles String?'],
  NotificationPreferences: ['pushEnabled Boolean @default(false)', 'pushSubscriptions String?'],
  AuditLog: ['metadata String?'],
  Conversation: ['userId String?'],
  DataExport: ['type String?'],
  WorkflowLog: ['retryAttempt Int?'],
};

let added = 0;
for (const [model, fields] of Object.entries(ADDITIONS)) {
  const startRe = new RegExp(`^model ${model} \\{`, 'm');
  const sm = src.match(startRe);
  if (!sm) { console.log(`!! model ${model} not found`); continue; }
  const start = sm.index + sm[0].length;
  const end = src.indexOf('\n}', start);
  if (end === -1) { console.log(`!! model ${model} closing brace not found`); continue; }
  const block = src.slice(start, end);
  const lines = [];
  for (const f of fields) {
    const fname = f.split(/\s+/)[0];
    if (!new RegExp(`^\\s*${fname}\\s`, 'm').test(block)) {
      lines.push(`  ${f}`);
      added++;
    }
  }
  if (lines.length) {
    src = src.slice(0, end) + N + lines.join(N) + src.slice(end);
    console.log(`${model}: +${lines.length} fields`);
  }
}
console.log(`total fields added: ${added}`);

fs.writeFileSync(SCHEMA, src);
console.log('schema written');
