-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "country" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "credits" INTEGER NOT NULL DEFAULT 50,
    "creditsMonthly" INTEGER NOT NULL DEFAULT 50,
    "rolloverCredits" INTEGER NOT NULL DEFAULT 0,
    "isTrial" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "orgId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'email',
    "emailVerificationOtp" TEXT,
    "emailVerificationOtpExpiry" DATETIME,
    "resetOtp" TEXT,
    "resetOtpExpiry" DATETIME,
    "loginOtp" TEXT,
    "loginOtpExpiry" DATETIME,
    "magicLinkToken" TEXT,
    "magicLinkTokenExpiry" DATETIME,
    "otpAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "otpLockedUntil" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "success" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MfaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MfaConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "customDomain" TEXT,
    "branding" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrgInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgInvitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrgInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "scheduledPlanChange" TEXT,
    "isTrial" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" DATETIME,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditsLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditAddon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "pricePaid" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentOrderId" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditAddon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "plan" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "couponCode" TEXT,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "gstNumber" TEXT,
    "isIndianUser" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentOrderId" TEXT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "PaymentWebhook_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentOrderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "taxRate" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "total" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "gstNumber" TEXT,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "pdfUrl" TEXT,
    "lineItems" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" REAL NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "applicablePlans" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "rate" REAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UsageTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "plans" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plan" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "limit" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "orgId" TEXT,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "linkedin" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "googleMapsListing" TEXT,
    "reviews" TEXT,
    "rating" REAL,
    "estimatedQuality" TEXT DEFAULT 'medium',
    "estimatedRevenue" TEXT DEFAULT 'medium',
    "city" TEXT,
    "country" TEXT,
    "niche" TEXT,
    "replyScore" REAL NOT NULL DEFAULT 0,
    "conversionScore" REAL NOT NULL DEFAULT 0,
    "urgencyScore" REAL NOT NULL DEFAULT 0,
    "revenuePotentialScore" REAL NOT NULL DEFAULT 0,
    "scoreReasoning" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'discovered',
    "emailStatus" TEXT,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "websiteQuality" TEXT DEFAULT 'none',
    "digitalWeaknesses" TEXT,
    "opportunityNotes" TEXT,
    "bestContactPerson" TEXT,
    "bestChannel" TEXT,
    "bestTiming" TEXT,
    "outreachStyle" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "followUpAt" DATETIME,
    "lastContactedAt" DATETIME,
    "websiteScreenshotUrl" TEXT,
    "techStack" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LeadAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "websiteQualityScore" INTEGER NOT NULL DEFAULT 0,
    "digitalMaturityScore" INTEGER NOT NULL DEFAULT 0,
    "weaknesses" TEXT,
    "replyScore" INTEGER NOT NULL DEFAULT 0,
    "dealConversionScore" INTEGER NOT NULL DEFAULT 0,
    "urgencyScore" INTEGER NOT NULL DEFAULT 0,
    "revenuePotentialScore" INTEGER NOT NULL DEFAULT 0,
    "scoreExplanations" TEXT,
    "decisionMaker" TEXT,
    "recommendedServices" TEXT,
    "estimatedDealValueInr" TEXT,
    "estimatedDealValueUsd" TEXT,
    "outreachMessages" TEXT,
    "closingStrategy" TEXT,
    "bestContactTime" TEXT,
    "analysisVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeadAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "scoreType" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "explanation" TEXT,
    "modelVersion" TEXT,
    "scoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PipelineCustomStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PipelineCustomStage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "openedAt" DATETIME,
    "repliedAt" DATETIME,
    "bouncedAt" DATETIME,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "sequenceStepId" TEXT,
    "trackingPixelId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutreachMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutreachSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutreachSequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "template" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 1,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SequenceEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" DATETIME,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "lastPollAt" DATETIME,
    "pubSubConfigured" BOOLEAN NOT NULL DEFAULT false,
    "labelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAccountId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "leadId" TEXT,
    "subject" TEXT,
    "lastMessageAt" DATETIME,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "isRead" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailThread_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "bodyPlain" TEXT,
    "bodyHtml" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" DATETIME,
    "labels" TEXT,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailBounce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "email" TEXT NOT NULL,
    "bounceType" TEXT,
    "bounceReason" TEXT,
    "messageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailBounce_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailUnsubscribe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "leadId" TEXT,
    "token" TEXT NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailUnsubscribe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "senderType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "intent" TEXT,
    "buyingSignals" TEXT,
    "hesitationReasons" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversationMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "linkCode" TEXT,
    "linkCodeExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsappConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "verificationOtp" TEXT,
    "otpExpiresAt" DATETIME,
    "monthlyQuota" INTEGER NOT NULL DEFAULT 100,
    "monthlyUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "metadata" TEXT,
    "deliveredVia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndStartTime" TEXT,
    "dndEndTime" TEXT,
    "dndTimezone" TEXT,
    "typePreferences" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "salesCoachMode" BOOLEAN NOT NULL DEFAULT false,
    "currentPage" TEXT,
    "leadContext" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "triggerType" TEXT NOT NULL,
    "triggerConfig" TEXT,
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "edges" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowDefinition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "nextStepId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggerData" TEXT,
    "logs" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "idempotencyKey" TEXT,
    "pausedAt" DATETIME,
    "resumedAt" DATETIME,
    "triggerEvent" TEXT,
    "deadLettered" BOOLEAN NOT NULL DEFAULT false,
    "deadLetterReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" TEXT,
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "edges" TEXT NOT NULL DEFAULT '[]',
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompetitorData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitorName" TEXT NOT NULL,
    "competitorUrl" TEXT NOT NULL,
    "websiteHtml" TEXT,
    "screenshotUrl" TEXT,
    "lastScrapedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompetitorAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "competitorName" TEXT NOT NULL,
    "competitorUrl" TEXT NOT NULL,
    "techStack" TEXT,
    "seoScore" INTEGER,
    "socialScore" INTEGER,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "opportunities" TEXT,
    "threats" TEXT,
    "threatLevel" TEXT,
    "pricingModel" TEXT,
    "estimatedTrafficTier" TEXT,
    "differentiationOpportunities" TEXT,
    "analysisData" TEXT,
    "competitorDataId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitorAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "resource" TEXT,
    "resourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "scopes" TEXT NOT NULL DEFAULT 'leads.read,leads.write',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "rateLimitPerHour" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKeyUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKeyUsage_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiKeyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GdprRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "downloadUrl" TEXT,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GdprRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "recordCount" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "DataExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "nichesSelected" BOOLEAN NOT NULL DEFAULT false,
    "countriesSelected" BOOLEAN NOT NULL DEFAULT false,
    "channelsSelected" BOOLEAN NOT NULL DEFAULT false,
    "toolsConnected" BOOLEAN NOT NULL DEFAULT false,
    "firstLeadAdded" BOOLEAN NOT NULL DEFAULT false,
    "firstAnalysisRun" BOOLEAN NOT NULL DEFAULT false,
    "bonusCreditsAwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "content" TEXT NOT NULL,
    "messageGeneratedByAI" BOOLEAN NOT NULL DEFAULT false,
    "responseSummary" TEXT,
    "intent" TEXT,
    "buyingSignals" TEXT,
    "hesitationReasons" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Communication_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "projectType" TEXT,
    "projectScope" TEXT,
    "proposedPrice" REAL,
    "finalPrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "implementationTimeline" TEXT,
    "maintenancePlan" TEXT,
    "proposalContent" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowUpReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpReminder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramConnected" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "whatsappConnected" BOOLEAN NOT NULL DEFAULT false,
    "whatsappProvider" TEXT,
    "notificationPreferences" TEXT NOT NULL DEFAULT '{}',
    "dndStartTime" TEXT,
    "dndEndTime" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "targetNiches" TEXT NOT NULL DEFAULT '[]',
    "targetCountries" TEXT NOT NULL DEFAULT '[]',
    "targetChannels" TEXT NOT NULL DEFAULT '[]',
    "companyName" TEXT,
    "reminderCheckInterval" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resultData" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiscoveryJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "labels" TEXT,
    "hostname" TEXT,
    "environment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiCostRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCostRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FileContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunks" TEXT NOT NULL DEFAULT '[]',
    "embedding" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FileContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProxyEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'datacenter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "successRate" REAL NOT NULL DEFAULT 1.0,
    "avgLatency" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "currentMinuteRequests" INTEGER NOT NULL DEFAULT 0,
    "minuteResetAt" DATETIME,
    "country" TEXT,
    "provider" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScrapingMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "eventId" TEXT NOT NULL,
    "deliveredAt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WsConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "socketId" TEXT NOT NULL,
    "rooms" TEXT NOT NULL DEFAULT '[]',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SseConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "lastEventId" TEXT,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MessageBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "audienceFilter" TEXT,
    "messageContent" TEXT NOT NULL,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" DATETIME,
    "totalTargets" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "respondedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BroadcastTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "broadcastId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BroadcastTarget_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "MessageBroadcast" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageTemplateApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "emailAccountId" TEXT,
    "trackingPixelId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailOpenEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingPixelId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailClickEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingLinkId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clickedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailTrackingLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailMessageId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_googleId_idx" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_plan_idx" ON "User"("plan");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_refreshToken_idx" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_idx" ON "LoginHistory"("userId");

-- CreateIndex
CREATE INDEX "LoginHistory_createdAt_idx" ON "LoginHistory"("createdAt");

-- CreateIndex
CREATE INDEX "LoginHistory_success_idx" ON "LoginHistory"("success");

-- CreateIndex
CREATE UNIQUE INDEX "MfaConfig_userId_key" ON "MfaConfig"("userId");

-- CreateIndex
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- CreateIndex
CREATE INDEX "Organization_customDomain_idx" ON "Organization"("customDomain");

-- CreateIndex
CREATE INDEX "OrgMember_orgId_idx" ON "OrgMember"("orgId");

-- CreateIndex
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_userId_key" ON "OrgMember"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_token_key" ON "OrgInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgInvitation_orgId_idx" ON "OrgInvitation"("orgId");

-- CreateIndex
CREATE INDEX "OrgInvitation_token_idx" ON "OrgInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgInvitation_email_idx" ON "OrgInvitation"("email");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_razorpaySubscriptionId_idx" ON "Subscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "CreditsLedger_userId_idx" ON "CreditsLedger"("userId");

-- CreateIndex
CREATE INDEX "CreditsLedger_action_idx" ON "CreditsLedger"("action");

-- CreateIndex
CREATE INDEX "CreditsLedger_createdAt_idx" ON "CreditsLedger"("createdAt");

-- CreateIndex
CREATE INDEX "CreditsLedger_referenceId_idx" ON "CreditsLedger"("referenceId");

-- CreateIndex
CREATE INDEX "CreditAddon_userId_idx" ON "CreditAddon"("userId");

-- CreateIndex
CREATE INDEX "CreditAddon_expiresAt_idx" ON "CreditAddon"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_idempotencyKey_key" ON "PaymentOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_idx" ON "PaymentOrder"("userId");

-- CreateIndex
CREATE INDEX "PaymentOrder_providerOrderId_idx" ON "PaymentOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "PaymentOrder_providerPaymentId_idx" ON "PaymentOrder"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- CreateIndex
CREATE INDEX "PaymentOrder_idempotencyKey_idx" ON "PaymentOrder"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhook_eventId_key" ON "PaymentWebhook"("eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhook_eventId_idx" ON "PaymentWebhook"("eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhook_provider_idx" ON "PaymentWebhook"("provider");

-- CreateIndex
CREATE INDEX "PaymentWebhook_processed_idx" ON "PaymentWebhook"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentOrderId_key" ON "Invoice"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_idx" ON "Coupon"("active");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_country_region_key" ON "TaxRate"("country", "region");

-- CreateIndex
CREATE INDEX "UsageTracking_userId_idx" ON "UsageTracking"("userId");

-- CreateIndex
CREATE INDEX "UsageTracking_feature_idx" ON "UsageTracking"("feature");

-- CreateIndex
CREATE INDEX "UsageTracking_periodStart_idx" ON "UsageTracking"("periodStart");

-- CreateIndex
CREATE INDEX "UsageTracking_periodEnd_idx" ON "UsageTracking"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "UsageTracking_userId_feature_periodStart_key" ON "UsageTracking"("userId", "feature", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_key_idx" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_enabled_idx" ON "FeatureFlag"("enabled");

-- CreateIndex
CREATE INDEX "PlanEntitlement_plan_idx" ON "PlanEntitlement"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_plan_feature_key" ON "PlanEntitlement"("plan", "feature");

-- CreateIndex
CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");

-- CreateIndex
CREATE INDEX "Lead_orgId_idx" ON "Lead"("orgId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_niche_idx" ON "Lead"("niche");

-- CreateIndex
CREATE INDEX "Lead_country_idx" ON "Lead"("country");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_replyScore_idx" ON "Lead"("replyScore");

-- CreateIndex
CREATE INDEX "Lead_conversionScore_idx" ON "Lead"("conversionScore");

-- CreateIndex
CREATE INDEX "Lead_urgencyScore_idx" ON "Lead"("urgencyScore");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_isActive_idx" ON "Lead"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAnalysis_leadId_key" ON "LeadAnalysis"("leadId");

-- CreateIndex
CREATE INDEX "LeadAnalysis_leadId_idx" ON "LeadAnalysis"("leadId");

-- CreateIndex
CREATE INDEX "LeadAnalysis_replyScore_idx" ON "LeadAnalysis"("replyScore");

-- CreateIndex
CREATE INDEX "LeadAnalysis_dealConversionScore_idx" ON "LeadAnalysis"("dealConversionScore");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_idx" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_scoreType_idx" ON "LeadScore"("scoreType");

-- CreateIndex
CREATE INDEX "LeadScore_scoredAt_idx" ON "LeadScore"("scoredAt");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_idx" ON "LeadNote"("leadId");

-- CreateIndex
CREATE INDEX "LeadNote_userId_idx" ON "LeadNote"("userId");

-- CreateIndex
CREATE INDEX "LeadNote_pinned_idx" ON "LeadNote"("pinned");

-- CreateIndex
CREATE INDEX "PipelineStage_order_idx" ON "PipelineStage"("order");

-- CreateIndex
CREATE INDEX "PipelineStage_orgId_idx" ON "PipelineStage"("orgId");

-- CreateIndex
CREATE INDEX "PipelineCustomStage_orgId_idx" ON "PipelineCustomStage"("orgId");

-- CreateIndex
CREATE INDEX "PipelineCustomStage_order_idx" ON "PipelineCustomStage"("order");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_trackingPixelId_key" ON "OutreachMessage"("trackingPixelId");

-- CreateIndex
CREATE INDEX "OutreachMessage_leadId_idx" ON "OutreachMessage"("leadId");

-- CreateIndex
CREATE INDEX "OutreachMessage_userId_idx" ON "OutreachMessage"("userId");

-- CreateIndex
CREATE INDEX "OutreachMessage_channel_idx" ON "OutreachMessage"("channel");

-- CreateIndex
CREATE INDEX "OutreachMessage_status_idx" ON "OutreachMessage"("status");

-- CreateIndex
CREATE INDEX "OutreachMessage_sentAt_idx" ON "OutreachMessage"("sentAt");

-- CreateIndex
CREATE INDEX "OutreachMessage_trackingPixelId_idx" ON "OutreachMessage"("trackingPixelId");

-- CreateIndex
CREATE INDEX "OutreachSequence_userId_idx" ON "OutreachSequence"("userId");

-- CreateIndex
CREATE INDEX "OutreachSequence_status_idx" ON "OutreachSequence"("status");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_idx" ON "SequenceStep"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceStep_order_idx" ON "SequenceStep"("order");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_sequenceId_idx" ON "SequenceEnrollment"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_leadId_idx" ON "SequenceEnrollment"("leadId");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_status_idx" ON "SequenceEnrollment"("status");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_nextSendAt_idx" ON "SequenceEnrollment"("nextSendAt");

-- CreateIndex
CREATE INDEX "EmailAccount_userId_idx" ON "EmailAccount"("userId");

-- CreateIndex
CREATE INDEX "EmailAccount_gmailEmail_idx" ON "EmailAccount"("gmailEmail");

-- CreateIndex
CREATE INDEX "EmailAccount_status_idx" ON "EmailAccount"("status");

-- CreateIndex
CREATE INDEX "EmailThread_emailAccountId_idx" ON "EmailThread"("emailAccountId");

-- CreateIndex
CREATE INDEX "EmailThread_gmailThreadId_idx" ON "EmailThread"("gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailThread_leadId_idx" ON "EmailThread"("leadId");

-- CreateIndex
CREATE INDEX "EmailThread_lastMessageAt_idx" ON "EmailThread"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_gmailMessageId_key" ON "EmailMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_gmailMessageId_idx" ON "EmailMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_fromEmail_idx" ON "EmailMessage"("fromEmail");

-- CreateIndex
CREATE INDEX "EmailMessage_leadId_idx" ON "EmailMessage"("leadId");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_idx" ON "EmailMessage"("direction");

-- CreateIndex
CREATE INDEX "EmailBounce_userId_idx" ON "EmailBounce"("userId");

-- CreateIndex
CREATE INDEX "EmailBounce_email_idx" ON "EmailBounce"("email");

-- CreateIndex
CREATE INDEX "EmailBounce_leadId_idx" ON "EmailBounce"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailUnsubscribe_token_key" ON "EmailUnsubscribe"("token");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_email_idx" ON "EmailUnsubscribe"("email");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_token_idx" ON "EmailUnsubscribe"("token");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_userId_idx" ON "EmailUnsubscribe"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailUnsubscribe_email_key" ON "EmailUnsubscribe"("email");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_channel_idx" ON "Conversation"("channel");

-- CreateIndex
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMessage_userId_idx" ON "ConversationMessage"("userId");

-- CreateIndex
CREATE INDEX "ConversationMessage_senderType_idx" ON "ConversationMessage"("senderType");

-- CreateIndex
CREATE INDEX "ConversationMessage_createdAt_idx" ON "ConversationMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConfig_userId_key" ON "TelegramConfig"("userId");

-- CreateIndex
CREATE INDEX "TelegramConfig_userId_idx" ON "TelegramConfig"("userId");

-- CreateIndex
CREATE INDEX "TelegramConfig_chatId_idx" ON "TelegramConfig"("chatId");

-- CreateIndex
CREATE INDEX "TelegramConfig_linkCode_idx" ON "TelegramConfig"("linkCode");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConfig_userId_key" ON "WhatsappConfig"("userId");

-- CreateIndex
CREATE INDEX "WhatsappConfig_userId_idx" ON "WhatsappConfig"("userId");

-- CreateIndex
CREATE INDEX "WhatsappConfig_phoneNumber_idx" ON "WhatsappConfig"("phoneNumber");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreferences_userId_idx" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE INDEX "AiChatSession_userId_idx" ON "AiChatSession"("userId");

-- CreateIndex
CREATE INDEX "AiChatSession_isActive_idx" ON "AiChatSession"("isActive");

-- CreateIndex
CREATE INDEX "AiChatMessage_sessionId_idx" ON "AiChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "AiChatMessage_createdAt_idx" ON "AiChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_userId_idx" ON "WorkflowDefinition"("userId");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_status_idx" ON "WorkflowDefinition"("status");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_triggerType_idx" ON "WorkflowDefinition"("triggerType");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowStep_order_idx" ON "WorkflowStep"("order");

-- CreateIndex
CREATE INDEX "WorkflowExecution_workflowId_idx" ON "WorkflowExecution"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_status_idx" ON "WorkflowExecution"("status");

-- CreateIndex
CREATE INDEX "WorkflowExecution_startedAt_idx" ON "WorkflowExecution"("startedAt");

-- CreateIndex
CREATE INDEX "WorkflowExecution_idempotencyKey_idx" ON "WorkflowExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowExecution_deadLettered_idx" ON "WorkflowExecution"("deadLettered");

-- CreateIndex
CREATE INDEX "WorkflowLog_executionId_idx" ON "WorkflowLog"("executionId");

-- CreateIndex
CREATE INDEX "WorkflowLog_status_idx" ON "WorkflowLog"("status");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_category_idx" ON "WorkflowTemplate"("category");

-- CreateIndex
CREATE INDEX "CompetitorData_competitorUrl_idx" ON "CompetitorData"("competitorUrl");

-- CreateIndex
CREATE INDEX "CompetitorData_lastScrapedAt_idx" ON "CompetitorData"("lastScrapedAt");

-- CreateIndex
CREATE INDEX "CompetitorAnalysis_userId_idx" ON "CompetitorAnalysis"("userId");

-- CreateIndex
CREATE INDEX "CompetitorAnalysis_leadId_idx" ON "CompetitorAnalysis"("leadId");

-- CreateIndex
CREATE INDEX "CompetitorAnalysis_competitorUrl_idx" ON "CompetitorAnalysis"("competitorUrl");

-- CreateIndex
CREATE INDEX "CompetitorAnalysis_threatLevel_idx" ON "CompetitorAnalysis"("threatLevel");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");

-- CreateIndex
CREATE INDEX "SystemEvent_source_idx" ON "SystemEvent"("source");

-- CreateIndex
CREATE INDEX "SystemEvent_resolved_idx" ON "SystemEvent"("resolved");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_isActive_idx" ON "ApiKey"("isActive");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "ApiKey_environment_idx" ON "ApiKey"("environment");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_apiKeyId_idx" ON "ApiKeyUsage"("apiKeyId");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_userId_idx" ON "ApiKeyUsage"("userId");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_endpoint_idx" ON "ApiKeyUsage"("endpoint");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_createdAt_idx" ON "ApiKeyUsage"("createdAt");

-- CreateIndex
CREATE INDEX "GdprRequest_userId_idx" ON "GdprRequest"("userId");

-- CreateIndex
CREATE INDEX "GdprRequest_requestType_idx" ON "GdprRequest"("requestType");

-- CreateIndex
CREATE INDEX "GdprRequest_status_idx" ON "GdprRequest"("status");

-- CreateIndex
CREATE INDEX "DataExport_userId_idx" ON "DataExport"("userId");

-- CreateIndex
CREATE INDEX "DataExport_status_idx" ON "DataExport"("status");

-- CreateIndex
CREATE INDEX "DataExport_exportType_idx" ON "DataExport"("exportType");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_completed_idx" ON "OnboardingProgress"("completed");

-- CreateIndex
CREATE INDEX "Communication_leadId_idx" ON "Communication"("leadId");

-- CreateIndex
CREATE INDEX "Communication_channel_idx" ON "Communication"("channel");

-- CreateIndex
CREATE INDEX "Deal_leadId_idx" ON "Deal"("leadId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");

-- CreateIndex
CREATE INDEX "LeadActivity_type_idx" ON "LeadActivity"("type");

-- CreateIndex
CREATE INDEX "FollowUpReminder_leadId_idx" ON "FollowUpReminder"("leadId");

-- CreateIndex
CREATE INDEX "FollowUpReminder_completed_idx" ON "FollowUpReminder"("completed");

-- CreateIndex
CREATE INDEX "FollowUpReminder_dueAt_idx" ON "FollowUpReminder"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "DiscoveryJob_userId_idx" ON "DiscoveryJob"("userId");

-- CreateIndex
CREATE INDEX "DiscoveryJob_status_idx" ON "DiscoveryJob"("status");

-- CreateIndex
CREATE INDEX "DiscoveryJob_source_idx" ON "DiscoveryJob"("source");

-- CreateIndex
CREATE INDEX "SecurityAlert_userId_idx" ON "SecurityAlert"("userId");

-- CreateIndex
CREATE INDEX "SecurityAlert_alertType_idx" ON "SecurityAlert"("alertType");

-- CreateIndex
CREATE INDEX "SecurityAlert_isResolved_idx" ON "SecurityAlert"("isResolved");

-- CreateIndex
CREATE INDEX "SecurityAlert_createdAt_idx" ON "SecurityAlert"("createdAt");

-- CreateIndex
CREATE INDEX "KnownDevice_userId_idx" ON "KnownDevice"("userId");

-- CreateIndex
CREATE INDEX "KnownDevice_deviceFingerprint_idx" ON "KnownDevice"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "KnownDevice_lastSeenAt_idx" ON "KnownDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_userId_deviceFingerprint_key" ON "KnownDevice"("userId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "SystemMetrics_source_idx" ON "SystemMetrics"("source");

-- CreateIndex
CREATE INDEX "SystemMetrics_metricType_idx" ON "SystemMetrics"("metricType");

-- CreateIndex
CREATE INDEX "SystemMetrics_metricName_idx" ON "SystemMetrics"("metricName");

-- CreateIndex
CREATE INDEX "SystemMetrics_createdAt_idx" ON "SystemMetrics"("createdAt");

-- CreateIndex
CREATE INDEX "SystemMetrics_environment_idx" ON "SystemMetrics"("environment");

-- CreateIndex
CREATE INDEX "AiCostRecord_userId_idx" ON "AiCostRecord"("userId");

-- CreateIndex
CREATE INDEX "AiCostRecord_feature_idx" ON "AiCostRecord"("feature");

-- CreateIndex
CREATE INDEX "AiCostRecord_model_idx" ON "AiCostRecord"("model");

-- CreateIndex
CREATE INDEX "AiCostRecord_costUsd_idx" ON "AiCostRecord"("costUsd");

-- CreateIndex
CREATE INDEX "AiCostRecord_createdAt_idx" ON "AiCostRecord"("createdAt");

-- CreateIndex
CREATE INDEX "PromptTemplate_name_idx" ON "PromptTemplate"("name");

-- CreateIndex
CREATE INDEX "PromptTemplate_version_idx" ON "PromptTemplate"("version");

-- CreateIndex
CREATE INDEX "PromptTemplate_isActive_idx" ON "PromptTemplate"("isActive");

-- CreateIndex
CREATE INDEX "PromptTemplate_createdAt_idx" ON "PromptTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "FileContext_userId_idx" ON "FileContext"("userId");

-- CreateIndex
CREATE INDEX "FileContext_leadId_idx" ON "FileContext"("leadId");

-- CreateIndex
CREATE INDEX "FileContext_fileType_idx" ON "FileContext"("fileType");

-- CreateIndex
CREATE INDEX "FileContext_createdAt_idx" ON "FileContext"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyEndpoint_url_key" ON "ProxyEndpoint"("url");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_isActive_idx" ON "ProxyEndpoint"("isActive");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_type_idx" ON "ProxyEndpoint"("type");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_successRate_idx" ON "ProxyEndpoint"("successRate");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_lastUsedAt_idx" ON "ProxyEndpoint"("lastUsedAt");

-- CreateIndex
CREATE INDEX "ScrapingMetric_source_idx" ON "ScrapingMetric"("source");

-- CreateIndex
CREATE INDEX "ScrapingMetric_date_idx" ON "ScrapingMetric"("date");

-- CreateIndex
CREATE INDEX "ScrapingMetric_rateLimitHits_idx" ON "ScrapingMetric"("rateLimitHits");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapingMetric_source_date_key" ON "ScrapingMetric"("source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RealtimeEvent_eventId_key" ON "RealtimeEvent"("eventId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_channel_idx" ON "RealtimeEvent"("channel");

-- CreateIndex
CREATE INDEX "RealtimeEvent_eventType_idx" ON "RealtimeEvent"("eventType");

-- CreateIndex
CREATE INDEX "RealtimeEvent_userId_idx" ON "RealtimeEvent"("userId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_orgId_idx" ON "RealtimeEvent"("orgId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_eventId_idx" ON "RealtimeEvent"("eventId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_deliveredAt_idx" ON "RealtimeEvent"("deliveredAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WsConnection_userId_idx" ON "WsConnection"("userId");

-- CreateIndex
CREATE INDEX "WsConnection_socketId_idx" ON "WsConnection"("socketId");

-- CreateIndex
CREATE INDEX "WsConnection_lastHeartbeat_idx" ON "WsConnection"("lastHeartbeat");

-- CreateIndex
CREATE INDEX "SseConnection_userId_idx" ON "SseConnection"("userId");

-- CreateIndex
CREATE INDEX "SseConnection_channel_idx" ON "SseConnection"("channel");

-- CreateIndex
CREATE INDEX "SseConnection_lastActivity_idx" ON "SseConnection"("lastActivity");

-- CreateIndex
CREATE INDEX "MediaFile_userId_idx" ON "MediaFile"("userId");

-- CreateIndex
CREATE INDEX "MediaFile_fileType_idx" ON "MediaFile"("fileType");

-- CreateIndex
CREATE INDEX "MediaFile_mimeType_idx" ON "MediaFile"("mimeType");

-- CreateIndex
CREATE INDEX "MediaFile_createdAt_idx" ON "MediaFile"("createdAt");

-- CreateIndex
CREATE INDEX "MessageBroadcast_userId_idx" ON "MessageBroadcast"("userId");

-- CreateIndex
CREATE INDEX "MessageBroadcast_channel_idx" ON "MessageBroadcast"("channel");

-- CreateIndex
CREATE INDEX "MessageBroadcast_status_idx" ON "MessageBroadcast"("status");

-- CreateIndex
CREATE INDEX "MessageBroadcast_scheduledAt_idx" ON "MessageBroadcast"("scheduledAt");

-- CreateIndex
CREATE INDEX "MessageBroadcast_createdAt_idx" ON "MessageBroadcast"("createdAt");

-- CreateIndex
CREATE INDEX "BroadcastTarget_broadcastId_idx" ON "BroadcastTarget"("broadcastId");

-- CreateIndex
CREATE INDEX "BroadcastTarget_leadId_idx" ON "BroadcastTarget"("leadId");

-- CreateIndex
CREATE INDEX "BroadcastTarget_status_idx" ON "BroadcastTarget"("status");

-- CreateIndex
CREATE INDEX "BroadcastTarget_sentAt_idx" ON "BroadcastTarget"("sentAt");

-- CreateIndex
CREATE INDEX "MessageTemplateApproval_userId_idx" ON "MessageTemplateApproval"("userId");

-- CreateIndex
CREATE INDEX "MessageTemplateApproval_category_idx" ON "MessageTemplateApproval"("category");

-- CreateIndex
CREATE INDEX "MessageTemplateApproval_status_idx" ON "MessageTemplateApproval"("status");

-- CreateIndex
CREATE INDEX "MessageTemplateApproval_name_idx" ON "MessageTemplateApproval"("name");

-- CreateIndex
CREATE INDEX "MessageTemplateApproval_createdAt_idx" ON "MessageTemplateApproval"("createdAt");

-- CreateIndex
CREATE INDEX "ScheduledEmail_userId_idx" ON "ScheduledEmail"("userId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_status_idx" ON "ScheduledEmail"("status");

-- CreateIndex
CREATE INDEX "ScheduledEmail_scheduledAt_idx" ON "ScheduledEmail"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledEmail_leadId_idx" ON "ScheduledEmail"("leadId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_emailAccountId_idx" ON "ScheduledEmail"("emailAccountId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_trackingPixelId_idx" ON "ScheduledEmail"("trackingPixelId");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_trackingPixelId_idx" ON "EmailOpenEvent"("trackingPixelId");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_openedAt_idx" ON "EmailOpenEvent"("openedAt");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_country_idx" ON "EmailOpenEvent"("country");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_city_idx" ON "EmailOpenEvent"("city");

-- CreateIndex
CREATE INDEX "EmailClickEvent_trackingLinkId_idx" ON "EmailClickEvent"("trackingLinkId");

-- CreateIndex
CREATE INDEX "EmailClickEvent_clickedAt_idx" ON "EmailClickEvent"("clickedAt");

-- CreateIndex
CREATE INDEX "EmailClickEvent_url_idx" ON "EmailClickEvent"("url");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTrackingLink_trackingId_key" ON "EmailTrackingLink"("trackingId");

-- CreateIndex
CREATE INDEX "EmailTrackingLink_emailMessageId_idx" ON "EmailTrackingLink"("emailMessageId");

-- CreateIndex
CREATE INDEX "EmailTrackingLink_trackingId_idx" ON "EmailTrackingLink"("trackingId");

-- CreateIndex
CREATE INDEX "EmailTrackingLink_originalUrl_idx" ON "EmailTrackingLink"("originalUrl");
