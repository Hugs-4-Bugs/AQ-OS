const { execSync, spawn } = require('child_process');
const http = require('http');

const PORT = 3000;
const CHECK_INTERVAL = 30000; // Check every 30 seconds
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_COOLDOWN = 60000; // 1 minute between restart attempts

let restartAttempts = 0;
let lastRestartTime = 0;

function checkServer() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

function killExisting() {
  try {
    execSync('pkill -9 -f "next start" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -9 -f "next dev" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -9 -f "next-server" 2>/dev/null || true', { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
}

function startServer() {
  const now = Date.now();
  if (now - lastRestartTime < RESTART_COOLDOWN) {
    console.log(`[${new Date().toISOString()}] Cooldown active, skipping restart`);
    return;
  }
  
  if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
    console.log(`[${new Date().toISOString()}] Max restart attempts reached, resetting counter`);
    restartAttempts = 0;
  }
  
  console.log(`[${new Date().toISOString()}] Starting Next.js production server...`);
  killExisting();
  
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/z/my-project',
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) }
  });
  
  child.unref();
  restartAttempts++;
  lastRestartTime = now;
  
  console.log(`[${new Date().toISOString()}] Server process spawned (PID: ${child.pid})`);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Process Guard started - checking every ${CHECK_INTERVAL/1000}s`);
  
  while (true) {
    const isAlive = await checkServer();
    const timestamp = new Date().toISOString();
    
    if (isAlive) {
      console.log(`[${timestamp}] Server healthy on port ${PORT}`);
      restartAttempts = 0; // Reset on successful check
    } else {
      console.log(`[${timestamp}] Server DOWN on port ${PORT}, restarting...`);
      startServer();
      
      // Wait a bit longer after restart for server to come up
      await new Promise(r => setTimeout(r, 10000));
      const recheck = await checkServer();
      console.log(`[${timestamp}] After restart check: ${recheck ? 'HEALTHY' : 'STILL DOWN'}`);
    }
    
    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }
}

main().catch(console.error);
