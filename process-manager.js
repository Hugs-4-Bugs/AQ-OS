// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Process Manager
// Phase 10: DevOps + Deployment — Hardened
// Auto-restart with exponential backoff, max restart limit, health checks
// ═══════════════════════════════════════════════════════════════════

const { spawn } = require('child_process');
const http = require('http');

let child = null;
let restartCount = 0;
const MAX_RESTARTS = 10;
const BASE_RESTART_DELAY = 2000;
const MAX_RESTART_DELAY = 60000;
let isShuttingDown = false;

// ── Unhandled Exception / Rejection Handlers ──────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[manager] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[manager] Uncaught Exception:', error);
  // The manager itself should stay alive — it supervises the child
});

// ── Graceful Shutdown ─────────────────────────────────────────────
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[manager] Received ${signal}, shutting down...`);

  if (child) {
    try {
      child.kill('SIGTERM');
      // Force kill after 10s if child doesn't exit
      setTimeout(() => {
        if (child) {
          try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
        }
        process.exit(0);
      }, 10000);
    } catch (e) {
      process.exit(0);
    }
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start Server ──────────────────────────────────────────────────
function startServer() {
  if (isShuttingDown) return;

  restartCount++;
  const delay = Math.min(BASE_RESTART_DELAY * Math.pow(2, restartCount - 1), MAX_RESTART_DELAY);

  if (restartCount > MAX_RESTARTS) {
    console.error(`[manager] Exceeded maximum restart attempts (${MAX_RESTARTS}). Giving up.`);
    process.exit(1);
  }

  console.log(`[manager] Starting custom server (attempt ${restartCount}/${MAX_RESTARTS})...`);

  child = spawn('node', ['/home/z/my-project/custom-server.js'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, PORT: '3001', NODE_OPTIONS: '--max-old-space-size=2048' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[next] ${msg}`);
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[next:err] ${msg}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`[manager] Server exited code=${code} signal=${signal}`);
    child = null;

    if (isShuttingDown) return;

    // Reset restart count on clean exit
    if (code === 0) {
      restartCount = 0;
    }

    // Restart with exponential backoff
    const nextDelay = Math.min(BASE_RESTART_DELAY * Math.pow(2, restartCount - 1), MAX_RESTART_DELAY);
    console.log(`[manager] Restarting in ${nextDelay}ms...`);
    setTimeout(startServer, nextDelay);
  });

  child.on('error', (err) => {
    console.error(`[manager] Spawn error: ${err.message}`);
    child = null;
    if (isShuttingDown) return;

    const nextDelay = Math.min(BASE_RESTART_DELAY * Math.pow(2, restartCount - 1), MAX_RESTART_DELAY);
    console.log(`[manager] Restarting in ${nextDelay}ms...`);
    setTimeout(startServer, nextDelay);
  });
}

// ── Health Check ──────────────────────────────────────────────────
const HEALTH_CHECK_INTERVAL = 10000; // 10s
const HEALTH_CHECK_TIMEOUT = 5000;   // 5s
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;

setInterval(() => {
  if (!child || child.exitCode !== null) {
    console.log('[manager] Server not running, restarting...');
    if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
    child = null;
    startServer();
    return;
  }

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/health',
    method: 'GET',
    timeout: HEALTH_CHECK_TIMEOUT,
  }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      consecutiveFailures = 0;
      // Reset restart count on successful health check
      if (restartCount > 0) restartCount = Math.max(0, restartCount - 1);
    } else {
      consecutiveFailures++;
      console.log(`[manager] Health check returned ${res.statusCode} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[manager] Too many health check failures, restarting...');
        if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
        child = null;
        consecutiveFailures = 0;
      }
    }
    res.resume(); // Drain response
  });

  req.on('error', () => {
    consecutiveFailures++;
    console.log(`[manager] Health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log('[manager] Too many health check failures, restarting...');
      if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      child = null;
      consecutiveFailures = 0;
    }
  });

  req.on('timeout', () => {
    req.destroy();
    consecutiveFailures++;
    console.log(`[manager] Health check timed out (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log('[manager] Too many health check timeouts, restarting...');
      if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      child = null;
      consecutiveFailures = 0;
    }
  });

  req.end();
}, HEALTH_CHECK_INTERVAL);

startServer();
