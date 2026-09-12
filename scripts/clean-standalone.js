/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Postbuild cleanup for Next.js standalone output.
 *
 * PROBLEM: Next.js standalone mode copies .env* files and other project-root
 * artifacts into .next/standalone/. On the space-z.ai platform, the baked-in
 * .env may contain dev-only paths that don't exist on the production server.
 *
 * FIX: After `next build`, use a WHITELIST approach — keep only the files
 * that the standalone server.js actually needs to run, and remove everything
 * else. For .env, keep credentials and critical config (DATABASE_URL,
 * APP_PUBLIC_URL) so the app works on platforms that don't auto-load .env
 * (like Aliyun Function Compute).
 *
 * CRITICAL: DATABASE_URL and APP_PUBLIC_URL are KEPT in .env because:
 *   - Aliyun FC does NOT auto-load .env files; our instrumentation.ts
 *     loads them at startup. If these vars are stripped, the app has no
 *     DB path and no public URL → all auth routes 500.
 *   - The DB path is sanitized to use a relative path (./db/custom.db)
 *     which the db.ts module redirects to /tmp/custom.db on read-only
 *     filesystems (FC).
 *
 * Whitelist (kept):
 *   server.js        — the standalone Next.js server entry point
 *   package.json     — needed by server.js for module resolution
 *   node_modules/    — runtime dependencies (traced by Next.js)
 *   .next/           — compiled server chunks + static assets
 *   public/          — static public assets (if present)
 *   .env             — kept (credentials + DATABASE_URL + APP_PUBLIC_URL)
 *   db/              — SQLite database file (custom.db) — bundled so the
 *                      app has data on first deploy; db.ts copies it to
 *                      /tmp on read-only filesystems
 */

const fs = require('fs');
const path = require('path');

const standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
const projectRoot = path.join(__dirname, '..');

if (!fs.existsSync(standaloneDir)) {
  console.log('[clean-standalone] .next/standalone not found, skipping cleanup');
  process.exit(0);
}

// ── Sanitize .env before cleanup ────────────────────────────────────
// Keep ALL credentials and critical config. Only remove dev-specific
// NEXTAUTH_URL and NEXT_PUBLIC_APP_URL (getAppUrl uses Origin/Referer
// headers and APP_PUBLIC_URL env var, which are more reliable).
const envPath = path.join(standaloneDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    const sanitizedLines = lines.filter((line) => {
      const trimmed = line.trim();
      // Remove NEXTAUTH_URL (getAppUrl uses APP_PUBLIC_URL + Origin header)
      if (trimmed.startsWith('NEXTAUTH_URL=')) return false;
      // Remove NEXT_PUBLIC_APP_URL (getAppUrl uses APP_PUBLIC_URL + Origin header)
      if (trimmed.startsWith('NEXT_PUBLIC_APP_URL=')) return false;
      // Keep ALL other lines including:
      //   - DATABASE_URL (sanitized below to use relative path)
      //   - APP_PUBLIC_URL (critical for FC where forwarded Host is internal)
      //   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SMTP_*, JWT_SECRET, etc.
      return true;
    });

    // Sanitize DATABASE_URL to use a relative path instead of absolute.
    // On FC, /home/z/my-project/db/custom.db doesn't exist. The db.ts
    // module will resolve the relative path and copy to /tmp if needed.
    for (let i = 0; i < sanitizedLines.length; i++) {
      const line = sanitizedLines[i];
      if (line.trim().startsWith('DATABASE_URL=file:')) {
        // Extract the current path and make it relative to the standalone dir
        const match = line.match(/DATABASE_URL=file:(.+)/);
        if (match) {
          const currentPath = match[1].trim();
          const dbFileName = path.basename(currentPath);
          // Use a relative path — db.ts will resolve it relative to CWD
          sanitizedLines[i] = `DATABASE_URL=file:./db/${dbFileName}`;
        }
      }
    }

    // Add a comment explaining the sanitization
    sanitizedLines.unshift(
      '# .env sanitized by clean-standalone.js for production deployment',
      '# NEXTAUTH_URL, NEXT_PUBLIC_APP_URL removed — getAppUrl uses APP_PUBLIC_URL + Origin/Referer headers',
      '# DATABASE_URL kept (relative path) — db.ts redirects to /tmp on read-only filesystems',
      '# APP_PUBLIC_URL kept — critical for FC where forwarded Host is internal hostname',
      ''
    );
    fs.writeFileSync(envPath, sanitizedLines.join('\n'));
    console.log('[clean-standalone] sanitized .env (removed NEXTAUTH_URL, NEXT_PUBLIC_APP_URL; kept DATABASE_URL, APP_PUBLIC_URL, credentials)');
  } catch (e) {
    console.warn(`[clean-standalone] could not sanitize .env: ${e.message}`);
  }
}

// ── Copy SQLite DB file into standalone build ──────────────────────
// The DB file is NOT automatically traced by Next.js (it's read at runtime
// via DATABASE_URL, not imported). We copy it explicitly so the app has
// data on first deploy. On read-only filesystems (FC), db.ts copies it
// to /tmp/custom.db at startup.
const sourceDbPath = path.join(projectRoot, 'db', 'custom.db');
const targetDbDir = path.join(standaloneDir, 'db');
const targetDbPath = path.join(targetDbDir, 'custom.db');

if (fs.existsSync(sourceDbPath)) {
  try {
    if (!fs.existsSync(targetDbDir)) {
      fs.mkdirSync(targetDbDir, { recursive: true });
    }
    fs.copyFileSync(sourceDbPath, targetDbPath);
    const sizeKB = Math.round(fs.statSync(targetDbPath).size / 1024);
    console.log(`[clean-standalone] copied db/custom.db (${sizeKB}KB) to standalone`);
  } catch (e) {
    console.warn(`[clean-standalone] could not copy DB file: ${e.message}`);
  }
} else {
  console.warn('[clean-standalone] source db/custom.db not found — standalone will start with empty DB');
}

// Whitelist: only these entries are kept in the standalone root
const KEEP = new Set([
  'server.js',
  'package.json',
  'node_modules',
  '.next',
  'public',
  '.env',
  'package-lock.json',
  'db',  // SQLite database file
]);

let removedCount = 0;
let keptCount = 0;

const entries = fs.readdirSync(standaloneDir);
for (const entry of entries) {
  if (KEEP.has(entry)) {
    keptCount++;
    continue;
  }

  const fullPath = path.join(standaloneDir, entry);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removedCount++;
      console.log(`[clean-standalone] removed dir:  ${entry}/`);
    } else {
      fs.rmSync(fullPath, { force: true });
      removedCount++;
      console.log(`[clean-standalone] removed file: ${entry}`);
    }
  } catch (e) {
    console.warn(`[clean-standalone] could not remove ${entry}: ${e.message}`);
  }
}

console.log('');
console.log(`[clean-standalone] cleanup complete`);
console.log(`  Removed: ${removedCount} item(s)`);
console.log(`  Kept:    ${keptCount} item(s) (server.js, package.json, node_modules/, .next/, public/, .env, db/)`);

// Verify server.js still exists
const serverJs = path.join(standaloneDir, 'server.js');
if (!fs.existsSync(serverJs)) {
  console.error('[clean-standalone] FATAL: server.js missing after cleanup!');
  process.exit(1);
}
console.log('  ✓ server.js verified');

// Verify .env exists with credentials
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const hasGoogle = envContent.includes('GOOGLE_CLIENT_ID=') && !envContent.includes('GOOGLE_CLIENT_ID=your-');
  const hasSmtp = envContent.includes('SMTP_USER=');
  const hasDb = envContent.includes('DATABASE_URL=');
  const hasAppUrl = envContent.includes('APP_PUBLIC_URL=');
  console.log(`  ✓ .env verified (Google: ${hasGoogle ? 'present' : 'MISSING'}, SMTP: ${hasSmtp ? 'present' : 'MISSING'}, DATABASE_URL: ${hasDb ? 'present' : 'MISSING'}, APP_PUBLIC_URL: ${hasAppUrl ? 'present' : 'MISSING'})`);
} else {
  console.warn('  ⚠ .env not found in standalone — credentials must be set via platform env vars');
}

// Verify DB file exists
if (fs.existsSync(targetDbPath)) {
  console.log('  ✓ db/custom.db verified');
} else {
  console.warn('  ⚠ db/custom.db not found in standalone — app will start with empty DB');
}
