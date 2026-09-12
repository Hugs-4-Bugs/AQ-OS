const { spawn } = require('child_process');
const fs = require('fs');
const log = fs.openSync('/home/z/my-project/server.log', 'a');
const child = spawn('bun', ['run', 'dev'], { cwd: '/home/z/my-project', detached: true, stdio: ['ignore', log, log] });
child.unref();
console.log('Started daemon PID:', child.pid);
