const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const PORT = 3000;
const SELF_PING_INTERVAL = 15000; // Self-ping every 15 seconds

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  server.listen(PORT, () => {
    console.log(`> Server listening on http://localhost:${PORT}`);
    
    // Self-ping mechanism to keep process alive
    const selfPing = setInterval(() => {
      const req = require('http').request({
        hostname: 'localhost',
        port: PORT,
        path: '/',
        method: 'GET',
        timeout: 5000,
      }, (res) => {
        console.log(`[Self-Ping] OK (${res.statusCode}) at ${new Date().toISOString()}`);
      });
      req.on('error', (e) => {
        console.error(`[Self-Ping] FAILED: ${e.message} at ${new Date().toISOString()}`);
      });
      req.on('timeout', () => {
        req.destroy();
        console.error(`[Self-Ping] TIMEOUT at ${new Date().toISOString()}`);
      });
      req.end();
    }, SELF_PING_INTERVAL);

    // Keep process alive
    process.on('SIGTERM', () => {
      clearInterval(selfPing);
      server.close();
      process.exit(0);
    });
  });
});
