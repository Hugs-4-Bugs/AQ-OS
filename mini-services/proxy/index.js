const http = require('http');

const PROXY_PORT = 3000;
const TARGET_PORT = 3001;
const TARGET_HOST = '127.0.0.1';

function forwardRequest(req, res) {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'connection': 'close',
      host: `localhost:${TARGET_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'connection': 'close',
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[proxy] Error for ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway' }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer(forwardRequest);
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[proxy] Running on port ${PROXY_PORT}, forwarding to ${TARGET_HOST}:${TARGET_PORT}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
