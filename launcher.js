const { spawn } = require('child_process');
const fs = require('fs');

const LOG_FILE = '/home/z/my-project/dev.log';
const PID_FILE = '/home/z/my-project/.next.pid';

let child = null;
let restartCount = 0;
const MAX_RESTARTS = 50;

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function startServer() {
  if (restartCount >= MAX_RESTARTS) {
    log('Max restarts reached. Exiting.');
    process.exit(1);
  }

  restartCount++;
  log(`Starting Next.js dev server (attempt ${restartCount})...`);

  child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: '/home/z/my-project',
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=1024',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Write PID
  fs.writeFileSync(PID_FILE, String(child.pid));

  child.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      fs.appendFileSync(LOG_FILE, msg + '\n');
    }
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      fs.appendFileSync(LOG_FILE, msg + '\n');
    }
  });

  child.on('exit', (code, signal) => {
    log(`Server exited code=${code} signal=${signal}`);
    child = null;
    restartCount = Math.max(0, restartCount - 1); // Allow more restarts
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    log(`Error: ${err.message}`);
    child = null;
    setTimeout(startServer, 3000);
  });

  log(`Server PID: ${child.pid}`);
}

// Health check every 15s
setInterval(() => {
  if (!child || child.exitCode !== null) {
    log('Health check: server not running, restarting...');
    if (child) {
      try { child.kill('SIGKILL'); } catch(e) {}
      child = null;
    }
    startServer();
  }
}, 15000);

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  if (child) child.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  if (child) child.kill('SIGINT');
  process.exit(0);
});

// Clear old log
fs.writeFileSync(LOG_FILE, '');
log('Launcher starting...');
startServer();
