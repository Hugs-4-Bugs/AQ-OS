/**
 * AcquisitionOS Server Watchdog
 *
 * Keeps the Next.js dev server running on port 3000.
 * If the server dies, it automatically restarts it.
 * Runs on port 3001 as a lightweight health-check endpoint.
 */

import { spawn, type Subprocess } from "bun";

const PORT = 3000;
const WATCHDOG_PORT = 3001;
const PROJECT_DIR = "/home/z/my-project";
const MAX_RESTARTS = 10;
const RESTART_COOLDOWN_MS = 5000;

let child: Subprocess | null = null;
let restartCount = 0;
let lastRestartTime = 0;

function startServer(): void {
  if (restartCount >= MAX_RESTARTS) {
    console.error(`[watchdog] Max restarts (${MAX_RESTARTS}) reached. Giving up.`);
    return;
  }

  const now = Date.now();
  if (now - lastRestartTime < RESTART_COOLDOWN_MS) {
    console.log(`[watchdog] Cooldown: waiting ${RESTART_COOLDOWN_MS}ms before restart...`);
    setTimeout(startServer, RESTART_COOLDOWN_MS);
    return;
  }

  lastRestartTime = now;
  restartCount++;
  console.log(`[watchdog] Starting Next.js dev server (attempt ${restartCount}/${MAX_RESTARTS})...`);

  // Spawn the dev server under NODE, not bun.
  // FIX 20260920 (runtime): `bun --bun next dev` breaks Turbopack's
  // hashed-external resolution hook (e.g. @prisma/client-<hash>,
  // nodemailer-<hash>) in the bun-spawned server process — every API route
  // importing @prisma/client returns 500 and the UI shows "Network error".
  // Starting the same CLI under node applies the alias hook correctly and
  // matches how package.json's "dev" script runs since fe912e0.
  child = spawn({
    cmd: ["node", "node_modules/next/dist/bin/next", "dev", "-p", String(PORT)],
    cwd: PROJECT_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Stream stdout
  const readStdout = async () => {
    const reader = child!.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      process.stdout.write(text);
    }
  };

  // Stream stderr
  const readStderr = async () => {
    const reader = child!.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      process.stderr.write(text);
    }
  };

  readStdout();
  readStderr();

  child.exited.then((code) => {
    console.log(`[watchdog] Server exited with code ${code}`);
    child = null;
    // Auto-restart after a short delay
    setTimeout(startServer, 3000);
  });
}

// Health check HTTP server on WATCHDOG_PORT
Bun.serve({
  port: WATCHDOG_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        status: child ? "running" : "restarting",
        port: PORT,
        restartCount,
        pid: child?.pid || null,
      });
    }
    return new Response("AcquisitionOS Server Watchdog", { status: 200 });
  },
});

console.log(`[watchdog] Watchdog HTTP server on :${WATCHDOG_PORT}`);
console.log(`[watchdog] Health check: http://localhost:${WATCHDOG_PORT}/health`);

// ─── Adopt mode ────────────────────────────────────────────────────
// If a healthy dev server is ALREADY listening on PORT (e.g. the one
// started by .zscripts/dev.sh in this workspace), do NOT spawn a
// competing `next dev`. A blind spawn would die with EADDRINUSE and
// churn restarts, and two compilers writing .next can corrupt state.
// We adopt the running server instead; the periodic health check
// below still restarts the server if it genuinely goes down.
async function adoptOrStart(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/auth/config`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      console.log(
        `[watchdog] Port ${PORT} already served by an external process — adopting it (no spawn).`
      );
      return;
    }
  } catch {
    // Port 3000 not reachable yet — fall through and spawn normally.
  }
  startServer();
}

adoptOrStart();

// Periodic health check — restart if the HTTP server is unresponsive
setInterval(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/auth/config`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      // Server is healthy — reset restart count
      restartCount = 0;
    } else {
      console.warn(`[watchdog] Health check returned ${res.status}`);
    }
  } catch {
    console.warn("[watchdog] Health check FAILED — server may be down");
    if (!child) {
      console.log("[watchdog] Attempting restart...");
      startServer();
    }
  }
}, 30000); // Every 30 seconds
