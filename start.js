// ═══════════════════════════════════════════════════════════════════
// start.js — Universal production start script
// ═══════════════════════════════════════════════════════════════════
// This script works with Node.js only (no bun dependency) so it runs
// on any cloud platform (GLM cloud, Vercel, Docker, etc).
//
// It:
// 1. Verifies the standalone build exists
// 2. Copies .next/static into the standalone directory (required by
//    the standalone server to serve CSS/JS/images)
// 3. Copies public/ into the standalone directory (for static assets)
// 4. Starts the standalone server
//
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// 0. Boot-time recovery (P1 fix, root-cause report Sep 2026):
//    restore credentials/db BEFORE the server needs them. Idempotent,
//    non-fatal: if recovery cannot run the server still boots and reports
//    via /api/health. Covers supervisors that invoke `node start.js`
//    directly (npm start is additionally covered via package.json).
try {
  const bootRecoveryPath = path.join(__dirname, 'scripts', 'boot-recovery.mjs');
  if (fs.existsSync(bootRecoveryPath)) {
    // spawnSync (not require) — .mjs cannot be require()d from CJS on all
    // Node versions; a subprocess is universally safe and still fast.
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [bootRecoveryPath], { stdio: 'inherit' });
    if (r.error) throw r.error;
  }
} catch (err) {
  console.warn('⚠ boot-recovery failed (non-fatal):', err && err.message);
}

const standaloneDir = path.join(__dirname, '.next', 'standalone');
const staticSrc = path.join(__dirname, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
const publicSrc = path.join(__dirname, 'public');
const publicDest = path.join(standaloneDir, 'public');

// 1. Verify standalone build exists
if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('');
  console.error('✗ Standalone build not found at .next/standalone/server.js');
  console.error('  Run "npm run build" first to create the production build.');
  console.error('');
  process.exit(1);
}

// 2. Copy .next/static into standalone (if not already there)
//    The standalone server looks for ./​.next/static relative to server.js
try {
  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log('✓ Copied .next/static → .next/standalone/.next/static');
  }
} catch (err) {
  console.warn('⚠ Could not copy .next/static:', err.message);
}

// 3. Copy public/ into standalone (if not already there)
try {
  if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log('✓ Copied public/ → .next/standalone/public');
  }
} catch (err) {
  console.warn('⚠ Could not copy public/:', err.message);
}

// 4. Set production environment defaults
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('  AcquisitionOS — Starting production server');
console.log('  Port: ' + process.env.PORT);
console.log('  Host: ' + process.env.HOSTNAME);
console.log('═══════════════════════════════════════════════════════');
console.log('');

// 5. Start the standalone server
//    Use require() so the server.js runs in this process (keeps signals working)
require(path.join(standaloneDir, 'server.js'));
