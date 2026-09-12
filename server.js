// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Main Next.js Server
// Phase 10: DevOps + Deployment — Hardened
// Graceful shutdown, unhandled rejection/exception handlers
// ═══════════════════════════════════════════════════════════════════

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ── Unhandled Exception / Rejection Handlers ──────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  // In production, exit and let the process manager restart
  if (!dev) {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  // Uncaught exceptions leave the process in an unpredictable state
  // Always exit and let the process manager restart
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────────
let server = null;
let isShuttingDown = false;
const activeConnections = new Set();

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('[shutdown] HTTP server closed, no more connections');
      process.exit(0);
    });
  }

  // Force exit after 30 seconds if connections don't drain
  setTimeout(() => {
    console.error('[shutdown] Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Start Server ──────────────────────────────────────────────────
app.prepare().then(() => {
  server = createServer(async (req, res) => {
    // Track active connections for graceful shutdown
    const conn = req.socket;
    activeConnections.add(conn);
    conn.on('close', () => activeConnections.delete(conn));

    // During shutdown, send Connection: close to drain connections
    if (isShuttingDown) {
      res.setHeader('Connection', 'close');
    }

    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('internal server error');
      }
    }
  });

  // Connection timeouts
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.maxRequestsPerSocket = 0; // unlimited
  server.requestTimeout = 300000; // 5 minutes

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // Handle client errors gracefully
  server.on('clientError', (err, socket) => {
    console.error('Client error:', err.message);
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    }
  });
}).catch((err) => {
  console.error('Failed to prepare Next.js app:', err);
  process.exit(1);
});
