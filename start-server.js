const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFd = fs.openSync('/home/z/my-project/dev.log', 'a');

const child = spawn('node', [
  path.join(__dirname, 'node_modules/.bin/next'),
  'dev', '-p', '3000'
], {
  cwd: __dirname,
  stdio: ['ignore', logFd, logFd],
  detached: true,
  env: { ...process.env }
});

child.unref();
console.log('Server PID:', child.pid);
process.exit(0);
