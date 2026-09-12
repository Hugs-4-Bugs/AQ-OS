/**
 * AcquisitionOS — Environment Variable Validation
 * Provides graceful handling of missing/invalid environment variables.
 * All checks are non-blocking — missing vars log warnings, not errors.
 */

interface EnvVarValidation {
  name: string;
  required: boolean;
  category: string;
}

const ENV_VARS: EnvVarValidation[] = [
  // Critical
  { name: 'DATABASE_URL', required: true, category: 'database' },
  { name: 'JWT_SECRET', required: true, category: 'auth' },
  { name: 'NEXT_PUBLIC_APP_URL', required: true, category: 'app' },
  // Auth
  { name: 'AUTH_DEV_MODE', required: false, category: 'auth' },
  { name: 'GOOGLE_CLIENT_ID', required: false, category: 'integrations' },
  { name: 'GOOGLE_CLIENT_SECRET', required: false, category: 'integrations' },
  { name: 'GOOGLE_API_KEY', required: false, category: 'integrations' },
  // Email
  { name: 'SMTP_HOST', required: false, category: 'email' },
  { name: 'SMTP_PORT', required: false, category: 'email' },
  { name: 'SMTP_USER', required: false, category: 'email' },
  { name: 'SMTP_PASSWORD', required: false, category: 'email' },
  // Push
  { name: 'VAPID_PUBLIC_KEY', required: false, category: 'push' },
  { name: 'VAPID_PRIVATE_KEY', required: false, category: 'push' },
  // PubSub
  { name: 'GMAIL_PUBSUB_TOPIC', required: false, category: 'gmail' },
  { name: 'GMAIL_PUBSUB_SUBSCRIPTION', required: false, category: 'gmail' },
  { name: 'GMAIL_PUBSUB_WEBHOOK_URL', required: false, category: 'gmail' },
];

export interface EnvValidationReport {
  valid: boolean;
  requiredMissing: string[];
  optionalMissing: string[];
  warnings: string[];
  categorySummary: Record<string, { configured: number; total: number }>;
}

/**
 * Validate all environment variables and return a report.
 * Called at startup to log warnings about missing configuration.
 */
export function validateEnvironment(): EnvValidationReport {
  const report: EnvValidationReport = {
    valid: true,
    requiredMissing: [],
    optionalMissing: [],
    warnings: [],
    categorySummary: {},
  };

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];
    
    // Track category summary
    if (!report.categorySummary[envVar.category]) {
      report.categorySummary[envVar.category] = { configured: 0, total: 0 };
    }
    report.categorySummary[envVar.category].total++;
    
    if (!value || value.trim() === '') {
      if (envVar.required) {
        report.requiredMissing.push(envVar.name);
        report.warnings.push(`[CRITICAL] Required env var missing: ${envVar.name} (${envVar.category})`);
        report.valid = false;
      } else {
        report.optionalMissing.push(envVar.name);
      }
    } else {
      report.categorySummary[envVar.category].configured++;
    }
  }

  // Log summary
  if (report.warnings.length > 0) {
    console.warn('\n╔══════════════════════════════════════════════════════╗');
    console.warn('║       AcquisitionOS — Environment Validation         ║');
    console.warn('╠══════════════════════════════════════════════════════╣');
    for (const w of report.warnings) {
      console.warn(`║ ${w.padEnd(52)}║`);
    }
    console.warn('╚══════════════════════════════════════════════════════╝\n');
  }

  if (report.optionalMissing.length > 0) {
    console.info(`[EnvValidation] ${report.optionalMissing.length} optional env vars not configured (non-critical):`);
    for (const name of report.optionalMissing) {
      console.info(`  - ${name}`);
    }
  }

  return report;
}

/**
 * Check if a specific feature is available based on env vars.
 * Returns true if all required vars for that feature are set.
 */
export function isFeatureAvailable(feature: 'calendar_freebusy' | 'gmail_push' | 'push_notifications' | 'telegram_webhook' | 'whatsapp' | 'stripe'): boolean {
  switch (feature) {
    case 'calendar_freebusy':
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case 'gmail_push':
      return !!(process.env.GMAIL_PUBSUB_TOPIC && process.env.GMAIL_PUBSUB_SUBSCRIPTION && process.env.GMAIL_PUBSUB_WEBHOOK_URL);
    case 'push_notifications':
      return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    case 'telegram_webhook':
      return !!(process.env.TELEGRAM_WEBHOOK_URL || process.env.NEXT_PUBLIC_APP_URL);
    case 'whatsapp':
      return true; // WhatsApp works via per-user credentials
    case 'stripe':
      return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
    default:
      return false;
  }
}
