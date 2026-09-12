const { createServer } = require('http');
const { parse } = require('url');
const { existsSync, createReadStream, statSync } = require('fs');
const { join, extname } = require('path');

// Use the standalone server
const standaloneDir = join(__dirname, '.next', 'standalone');
const port = parseInt(process.env.PORT, 10) || 3000;
const hostname = '0.0.0.0';

// Set up the standalone server environment
process.env.NODE_ENV = 'production';
process.chdir(standaloneDir);

const { startServer } = require('next/dist/server/lib/start-server');

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
};

async function main() {
  // Start the Next.js server
  const server = await startServer({
    dir: standaloneDir,
    isDev: false,
    hostname,
    port,
    allowRetry: false,
  });

  console.log('> Custom standalone server with static file support started');
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
