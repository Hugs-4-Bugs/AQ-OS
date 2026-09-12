// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Seed Plan Entitlements Script
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Seeds the PlanEntitlement table with data from the
// entitlement-service ENTITLEMENTS config.
//
// Usage: bun run scripts/seed-entitlements.ts
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ===== ENTITLEMENT CONFIGURATION =====
// Mirrors the config from src/lib/entitlement-service.ts

type PlanType = 'free' | 'pro' | 'elite';
type FeatureKey =
  | 'lead_discovery'
  | 'deep_analysis'
  | 'outreach_messages'
  | 'outreach_sequences'
  | 'sales_coaching'
  | 'proposal_generation'
  | 'competitor_analysis'
  | 'data_export'
  | 'gmail_integration'
  | 'whatsapp_integration'
  | 'telegram_access'
  | 'workflow_access'
  | 'api_access'
  | 'chatbot_access'
  | 'team_members'
  | 'white_label'
  | 'custom_integrations';

interface EntitlementConfig {
  limit: number | null; // null = unlimited
  enabled: boolean;
}

const ENTITLEMENTS: Record<PlanType, Record<FeatureKey, EntitlementConfig>> = {
  free: {
    lead_discovery:       { limit: 10,  enabled: true },
    deep_analysis:        { limit: 0,   enabled: false },
    outreach_messages:    { limit: 50,  enabled: true },
    outreach_sequences:   { limit: 0,   enabled: false },
    sales_coaching:       { limit: 0,   enabled: false },
    proposal_generation:  { limit: 0,   enabled: false },
    competitor_analysis:  { limit: 0,   enabled: false },
    data_export:          { limit: 0,   enabled: false },
    gmail_integration:    { limit: 0,   enabled: false },
    whatsapp_integration: { limit: 0,   enabled: false },
    telegram_access:      { limit: 0,   enabled: false },
    workflow_access:      { limit: 0,   enabled: false },
    api_access:           { limit: 0,   enabled: false },
    chatbot_access:       { limit: 0,   enabled: false },
    team_members:         { limit: 1,   enabled: true },
    white_label:          { limit: 0,   enabled: false },
    custom_integrations:  { limit: 0,   enabled: false },
  },
  pro: {
    lead_discovery:       { limit: null, enabled: true },
    deep_analysis:        { limit: null, enabled: true },
    outreach_messages:    { limit: null, enabled: true },
    outreach_sequences:   { limit: null, enabled: true },
    sales_coaching:       { limit: null, enabled: true },
    proposal_generation:  { limit: null, enabled: true },
    competitor_analysis:  { limit: null, enabled: true },
    data_export:          { limit: null, enabled: true },
    gmail_integration:    { limit: null, enabled: true },
    whatsapp_integration: { limit: 0,   enabled: false },
    telegram_access:      { limit: 0,   enabled: false },
    workflow_access:      { limit: null, enabled: true },
    api_access:           { limit: null, enabled: true },
    chatbot_access:       { limit: null, enabled: true },
    team_members:         { limit: 3,   enabled: true },
    white_label:          { limit: 0,   enabled: false },
    custom_integrations:  { limit: 0,   enabled: false },
  },
  elite: {
    lead_discovery:       { limit: null, enabled: true },
    deep_analysis:        { limit: null, enabled: true },
    outreach_messages:    { limit: null, enabled: true },
    outreach_sequences:   { limit: null, enabled: true },
    sales_coaching:       { limit: null, enabled: true },
    proposal_generation:  { limit: null, enabled: true },
    competitor_analysis:  { limit: null, enabled: true },
    data_export:          { limit: null, enabled: true },
    gmail_integration:    { limit: null, enabled: true },
    whatsapp_integration: { limit: null, enabled: true },
    telegram_access:      { limit: null, enabled: true },
    workflow_access:      { limit: null, enabled: true },
    api_access:           { limit: null, enabled: true },
    chatbot_access:       { limit: null, enabled: true },
    team_members:         { limit: 10,  enabled: true },
    white_label:          { limit: null, enabled: true },
    custom_integrations:  { limit: null, enabled: true },
  },
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AcquisitionOS — Seed Plan Entitlements');
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  let seeded = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  const plans: PlanType[] = ['free', 'pro', 'elite'];

  for (const plan of plans) {
    console.log(`📋 Processing plan: ${plan}`);
    const entitlements = ENTITLEMENTS[plan];

    for (const [feature, config] of Object.entries(entitlements)) {
      try {
        // Check if entitlement already exists
        const existing = await prisma.planEntitlement.findUnique({
          where: {
            plan_feature: { plan, feature },
          },
        });

        if (existing) {
          // Check if values differ
          if (existing.limit !== config.limit || existing.enabled !== config.enabled) {
            await prisma.planEntitlement.update({
              where: { id: existing.id },
              data: {
                limit: config.limit,
                enabled: config.enabled,
              },
            });
            updated++;
            console.log(`  ↻ Updated ${plan}/${feature}: limit=${config.limit}, enabled=${config.enabled}`);
          } else {
            skipped++;
          }
        } else {
          // Create new entitlement
          await prisma.planEntitlement.create({
            data: {
              plan,
              feature,
              limit: config.limit,
              enabled: config.enabled,
            },
          });
          seeded++;
          console.log(`  ✓ Created ${plan}/${feature}: limit=${config.limit}, enabled=${config.enabled}`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to seed ${plan}/${feature}:`, error);
        errors++;
      }
    }
  }

  console.log();
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Results:`);
  console.log(`    Created: ${seeded}`);
  console.log(`    Updated: ${updated}`);
  console.log(`    Skipped (unchanged): ${skipped}`);
  console.log(`    Errors: ${errors}`);
  console.log(`    Total processed: ${seeded + updated + skipped + errors}`);
  console.log('───────────────────────────────────────────────────────');

  if (errors > 0) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
