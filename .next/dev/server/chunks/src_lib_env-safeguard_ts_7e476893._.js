module.exports = [
"[project]/src/lib/env-safeguard.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createBackup",
    ()=>createBackup,
    "validateAndLogEnv",
    ()=>validateAndLogEnv,
    "validateEnv",
    ()=>validateEnv
]);
/**
 * AcquisitionOS — Environment Variable Safeguard
 *
 * Protects against .env corruption by:
 *   1. Creating a backup of .env on first healthy load
 *   2. Detecting corruption (missing critical vars) and auto-restoring
 *   3. Validating all auth-critical environment variables at startup
 *   4. Providing a health report for logging/monitoring
 *
 * This module is designed to be called from instrumentation.ts at startup.
 */ var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
;
;
const ENV_VARS = [
    {
        key: 'DATABASE_URL',
        label: 'Database URL',
        required: true,
        degrades: false
    },
    {
        key: 'JWT_SECRET',
        label: 'JWT Secret',
        required: true,
        degrades: false
    },
    {
        key: 'NEXT_PUBLIC_APP_URL',
        label: 'App URL',
        required: true,
        degrades: false,
        isPlaceholder: (v)=>v.includes('localhost') && ("TURBOPACK compile-time value", "development") === 'production'
    },
    {
        key: 'NEXTAUTH_URL',
        label: 'NextAuth URL',
        required: false,
        degrades: true
    },
    {
        key: 'AUTH_DEV_MODE',
        label: 'Auth Dev Mode',
        required: false,
        degrades: false
    },
    {
        key: 'SMTP_HOST',
        label: 'SMTP Host',
        required: false,
        degrades: true
    },
    {
        key: 'SMTP_PORT',
        label: 'SMTP Port',
        required: false,
        degrades: true
    },
    {
        key: 'SMTP_USER',
        label: 'SMTP User',
        required: false,
        degrades: true
    },
    {
        key: 'SMTP_PASSWORD',
        label: 'SMTP Password',
        required: false,
        degrades: true
    },
    {
        key: 'SMTP_PASS',
        label: 'SMTP Pass (alias)',
        required: false,
        degrades: true
    },
    {
        key: 'GMAIL_USER',
        label: 'Gmail User (alias)',
        required: false,
        degrades: true
    },
    {
        key: 'GMAIL_APP_PASSWORD',
        label: 'Gmail App Password (alias)',
        required: false,
        degrades: true
    },
    {
        key: 'GMAIL_PASSWORD',
        label: 'Gmail Password (alias)',
        required: false,
        degrades: true
    },
    {
        key: 'SMTP_FROM',
        label: 'SMTP From',
        required: false,
        degrades: true
    },
    {
        key: 'RESEND_API_KEY',
        label: 'Resend API Key',
        required: false,
        degrades: true
    },
    {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Google Client ID',
        required: false,
        degrades: true,
        isPlaceholder: (v)=>!v || v.startsWith('your-') || v === 'placeholder' || !v.includes('.apps.googleusercontent.com')
    },
    {
        key: 'GOOGLE_CLIENT_SECRET',
        label: 'Google Client Secret',
        required: false,
        degrades: true,
        // Real Google secrets start with "GOCSPX-" — do NOT flag that as placeholder.
        // Only flag empty/placeholder/your-* values.
        isPlaceholder: (v)=>!v || v.startsWith('your-') || v === 'placeholder'
    },
    {
        key: 'CRON_SECRET',
        label: 'Cron Secret',
        required: false,
        degrades: true
    },
    {
        key: 'STRIPE_SECRET_KEY',
        label: 'Stripe Secret Key',
        required: false,
        degrades: false
    },
    {
        key: 'STRIPE_PUBLISHABLE_KEY',
        label: 'Stripe Publishable Key',
        required: false,
        degrades: false
    },
    {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Stripe Webhook Secret',
        required: false,
        degrades: false
    }
];
// ---------------------------------------------------------------------------
// .env corruption detection and auto-restore
// ---------------------------------------------------------------------------
const PROJECT_ROOT = process.cwd();
const ENV_FILE = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(PROJECT_ROOT, '.env');
const BACKUP_FILE = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(PROJECT_ROOT, '.env.backup');
/**
 * Count the number of non-empty, non-comment lines in the .env file.
 * A healthy .env should have 15+ lines. A corrupted one (just DATABASE_URL) has ~2.
 */ function countEnvLines(content) {
    return content.split('\n').filter((line)=>{
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
    }).length;
}
/**
 * Check if the .env file appears corrupted (too few actual variable assignments).
 * The pattern we've seen: file gets wiped to just `DATABASE_URL=file:...`
 */ function isEnvCorrupted(content) {
    const lines = countEnvLines(content);
    // Healthy .env has 15+ variable lines. Corrupted has 1-3.
    return lines < 5;
}
/**
 * Attempt to restore .env from backup.
 * Returns true if restoration was successful.
 */ function restoreFromBackup() {
    try {
        if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(BACKUP_FILE)) {
            const backupContent = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(BACKUP_FILE, 'utf-8');
            if (!isEnvCorrupted(backupContent)) {
                (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["writeFileSync"])(ENV_FILE, backupContent, 'utf-8');
                console.error('[env-safeguard] ⚠️  .env CORRUPTION DETECTED — restored from .env.backup');
                return true;
            } else {
                console.error('[env-safeguard] ⚠️  .env AND .env.backup both appear corrupted!');
                return false;
            }
        } else {
            console.error('[env-safeguard] ⚠️  .env CORRUPTION DETECTED — no .env.backup available for restoration');
            return false;
        }
    } catch (err) {
        console.error('[env-safeguard] Failed to restore .env from backup:', err);
        return false;
    }
}
function createBackup() {
    try {
        if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(ENV_FILE)) {
            const content = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(ENV_FILE, 'utf-8');
            if (!isEnvCorrupted(content)) {
                // If backup exists and is read-only, make it writable first.
                try {
                    if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(BACKUP_FILE)) {
                        const { chmodSync } = __turbopack_context__.r("[externals]/fs [external] (fs, cjs)");
                        chmodSync(BACKUP_FILE, 0o644);
                    }
                } catch  {
                // ignore chmod errors
                }
                (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["copyFileSync"])(ENV_FILE, BACKUP_FILE);
                console.log('[env-safeguard] .env.backup created/updated');
            } else if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(BACKUP_FILE)) {
                console.warn('[env-safeguard] Current .env appears corrupted — keeping existing .env.backup');
            }
        }
    } catch (err) {
        // Never throw — backup is best-effort only.
        console.warn('[env-safeguard] Skipping .env.backup (non-fatal):', err instanceof Error ? err.message : String(err));
    }
}
function validateEnv() {
    let restored = false;
    // ── Step 1: Check for .env file corruption ──────────────────────
    try {
        if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(ENV_FILE)) {
            const envContent = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(ENV_FILE, 'utf-8');
            if (isEnvCorrupted(envContent)) {
                restored = restoreFromBackup();
                if (restored) {
                    // Re-read env vars after restore — note: process.env won't update
                    // automatically in a running Node process, but this is for logging
                    console.warn('[env-safeguard] .env restored. Server restart required to pick up new values.');
                }
            }
        } else if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(BACKUP_FILE)) {
            console.error('[env-safeguard] .env file MISSING — attempting restore from backup');
            restored = restoreFromBackup();
        }
    } catch  {
    // .env check is best-effort
    }
    // ── Step 2: Validate each environment variable ───────────────────
    const report = {
        status: 'healthy',
        missing: [],
        placeholders: [],
        degraded: [],
        details: [],
        restored
    };
    for (const def of ENV_VARS){
        const value = process.env[def.key];
        const isMissing = !value;
        const isPlaceholderValue = isMissing ? false : !!(def.isPlaceholder?.(value) ?? false);
        const status = isMissing ? 'missing' : isPlaceholderValue ? 'placeholder' : 'ok';
        report.details.push({
            key: def.key,
            label: def.label,
            status,
            required: def.required,
            degrades: def.degrades
        });
        if (isMissing) {
            if (def.required) {
                report.missing.push(def.label);
            } else if (def.degrades) {
                report.degraded.push(def.label);
            }
        } else if (isPlaceholderValue) {
            if (def.required) {
                report.placeholders.push(def.label);
            } else if (def.degrades) {
                report.degraded.push(`${def.label} (placeholder)`);
            }
        }
    }
    // ── Step 3: Determine overall health status ─────────────────────
    if (report.missing.length > 0) {
        report.status = 'critical';
    } else if (report.placeholders.length > 0 || report.degraded.length > 0) {
        report.status = 'degraded';
    }
    return report;
}
function validateAndLogEnv() {
    const report = validateEnv();
    console.log('─────────────────────────────────────────────────');
    console.log('[env-safeguard] Environment Variable Health Report');
    console.log(`  Status: ${report.status.toUpperCase()}`);
    if (report.restored) {
        console.log('  ⚠️  .env was corrupted and restored from backup');
    }
    // Log critical issues
    if (report.missing.length > 0) {
        console.error(`  CRITICAL — Missing required: ${report.missing.join(', ')}`);
    }
    if (report.placeholders.length > 0) {
        console.error(`  WARNING — Placeholder values: ${report.placeholders.join(', ')}`);
    }
    if (report.degraded.length > 0) {
        console.warn(`  DEGRADED — Missing/degraded: ${report.degraded.join(', ')}`);
    }
    // Log auth-specific summary
    const authDevMode = process.env.AUTH_DEV_MODE === 'true';
    const emailConfigured = report.details.find((d)=>d.key === 'SMTP_HOST')?.status === 'ok';
    const googleConfigured = report.details.find((d)=>d.key === 'GOOGLE_CLIENT_ID')?.status === 'ok' && report.details.find((d)=>d.key === 'GOOGLE_CLIENT_SECRET')?.status === 'ok';
    console.log('  Auth Summary:');
    console.log(`    Dev Mode: ${authDevMode ? 'ENABLED ⚠️' : 'DISABLED ✓'}`);
    console.log(`    Email (SMTP): ${emailConfigured ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗'}`);
    console.log(`    Google OAuth: ${googleConfigured ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗'}`);
    console.log('─────────────────────────────────────────────────');
    // Create backup if healthy and no backup exists yet
    if (report.status === 'healthy' || report.status === 'degraded') {
        createBackup();
    }
    return report;
}
}),
];

//# sourceMappingURL=src_lib_env-safeguard_ts_7e476893._.js.map