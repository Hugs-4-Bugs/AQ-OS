#!/usr/bin/env node
/**
 * AcquisitionOS Gateway Proxy
 * 
 * This is a lightweight Node.js reverse proxy that ALWAYS listens on port 3000.
 * - When Next.js (port 3001) is alive: proxies all requests to it
 * - When Next.js is down: serves a branded "reconnecting" page
 * 
 * This ensures Caddy NEVER shows its default Z.ai/GLM fallback page.
 * The proxy itself uses ~5MB RAM and is extremely stable.
 */

const http = require('http');
const { URL } = require('url');

const NEXT_PORT = 3001;
const PROXY_PORT = 3000;
const CONNECT_TIMEOUT = 3000; // 3s timeout for connecting to Next.js

// Branded "reconnecting" page - no GLM logo, pure AcquisitionOS branding
const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AcquisitionOS - Reconnecting...</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
  .container{text-align:center;padding:2rem;max-width:420px}
  .logo{width:48px;height:48px;margin:0 auto 1.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem;color:white;box-shadow:0 0 40px rgba(99,102,241,0.3)}
  h1{font-size:1.5rem;font-weight:700;margin-bottom:0.75rem;background:linear-gradient(to right,#a5b4fc,#d8b4fe,#ffffff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  p{color:#a1a1aa;font-size:0.95rem;line-height:1.6;margin-bottom:2rem}
  .spinner{width:32px;height:32px;border:3px solid #27272a;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1.5rem}
  @keyframes spin{to{transform:rotate(360deg)}}
  .status{display:inline-block;padding:0.5rem 1rem;background:#18181b;border:1px solid #27272a;border-radius:999px;font-size:0.8rem;color:#71717a}
  .dots::after{content:'';animation:dots 1.5s steps(4,end) infinite}
  @keyframes dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
</style>
</head>
<body>
<div class="container">
  <div class="logo">A</div>
  <h1>AcquisitionOS</h1>
  <div class="spinner"></div>
  <p>The server is restarting. This usually takes a few seconds. Your data is safe and nothing has been lost.</p>
  <span class="status">Reconnecting<span class="dots"></span></span>
</div>
<script>
// Auto-retry: reload the page once the server is back
let retries = 0;
const maxRetries = 30;
function checkServer() {
  if (retries >= maxRetries) return;
  retries++;
  fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    .then(r => { if (r.ok) window.location.reload(); })
    .catch(() => setTimeout(checkServer, 2000));
}
setTimeout(checkServer, 3000);
</script>
</body>
</html>`;

// Health endpoint - always returns 200 so the proxy itself is always "healthy"
function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'proxy_alive', nextjs: 'checking' }));
}

function handleRequest(req, res) {
  // Health check for the proxy itself
  if (req.url === '/api/health') {
    handleHealth(req, res);
    return;
  }

  // Parse URL for proxying
  const parsedUrl = new URL(req.url, `http://localhost:${NEXT_PORT}`);

  // Create proxy request to Next.js on port 3001
  const proxyReq = http.request({
    hostname: 'localhost',
    port: NEXT_PORT,
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${NEXT_PORT}`,
    },
    timeout: CONNECT_TIMEOUT,
  }, (proxyRes) => {
    // Forward the response from Next.js
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    serveFallback(res);
  });

  proxyReq.on('error', () => {
    serveFallback(res);
  });

  // Forward request body (POST/PUT etc.)
  req.on('error', () => {
    proxyReq.destroy();
    serveFallback(res);
  });

  req.pipe(proxyReq);
}

function serveFallback(res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(FALLBACK_HTML);
}

// Create server
const server = http.createServer(handleRequest);

// Handle keep-alive connections properly
server.on('connection', (socket) => {
  socket.setTimeout(120000); // 2min timeout
  socket.on('timeout', () => socket.destroy());
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] AcquisitionOS Gateway Proxy started on port ${PROXY_PORT}`);
  console.log(`[${ts}] Proxying to Next.js on port ${NEXT_PORT}`);
  console.log(`[${ts}] Serving branded fallback when Next.js is unavailable`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Gateway] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
  console.log('[Gateway] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on('uncaughtException', (err) => {
  console.error('[Gateway] Uncaught exception:', err.message);
});
