const { spawn } = require('child_process');
const fs = require('fs');

const log = fs.openSync('/home/z/my-project/server.log', 'a');

const child = spawn('node', ['/home/z/my-project/node_modules/.bin/next', 'start', '-p', '3000'], {
  cwd: '/home/z/my-project',
  detached: true,
  stdio: ['ignore', log, log]
});

child.unref();

console.log(`Server daemon started with PID ${child.pid}`);
process.exit(0);
