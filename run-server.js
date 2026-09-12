const { spawn } = require('child_process');
const fs = require('fs');

const PID_FILE = '/home/z/my-project/server.pid';
const LOG_FILE = '/tmp/next-server.log';

// Start the Next.js server
const child = spawn('node', ['--max-old-space-size=1024', './node_modules/.bin/next', 'start', '-p', '3000'], {
  cwd: '/home/z/my-project',
  detached: true,
  stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
});

child.unref();

// Write PID file
fs.writeFileSync(PID_FILE, String(child.pid));
console.log(`Server started with PID ${child.pid}`);
