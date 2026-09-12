// Persistent dev server runner for AcquisitionOS
const { spawn } = require('child_process');
const http = require('http');

let child = null;
let isShuttingDown = false;

process.on('unhandledRejection', (reason) => {
  console.error('[runner] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[runner] Uncaught Exception:', error);
});

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[runner] Received ${signal}, shutting down...`);
  if (child) {
    try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      process.exit(0);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function startServer() {
  if (isShuttingDown) return;
  
  console.log('[runner] Starting Next.js dev server on port 3000...');
  
  child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, PORT: '3000' },
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
    console.log(`[runner] Server exited code=${code} signal=${signal}`);
    child = null;
    if (isShuttingDown) return;
    console.log('[runner] Restarting in 5s...');
    setTimeout(startServer, 5000);
  });

  child.on('error', (err) => {
    console.error(`[runner] Spawn error: ${err.message}`);
    child = null;
    if (isShuttingDown) return;
    console.log('[runner] Restarting in 5s...');
    setTimeout(startServer, 5000);
  });
}

// Health check
let consecutiveFailures = 0;
setInterval(() => {
  if (!child || child.exitCode !== null) {
    console.log('[runner] Server not running, restarting...');
    if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
    child = null;
    startServer();
    return;
  }

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/health',
    method: 'GET',
    timeout: 5000,
  }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.log(`[runner] Health check returned ${res.statusCode} (${consecutiveFailures}/3)`);
      if (consecutiveFailures >= 3) {
        console.log('[runner] Too many failures, restarting...');
        if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
        child = null;
        consecutiveFailures = 0;
      }
    }
    res.resume();
  });

  req.on('error', () => {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      console.log('[runner] Too many errors, restarting...');
      if (child) { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      child = null;
      consecutiveFailures = 0;
    }
  });

  req.on('timeout', () => { req.destroy(); });
  req.end();
}, 15000);

startServer();
