const fs = require('fs');
const d = fs.readFileSync('/home/z/my-project/node_modules/.prisma/client/index.d.ts', 'utf8');
function dumpModel(name) {
  const marker = 'export type $' + name + 'Payload';
  const i = d.indexOf(marker);
  if (i < 0) { console.log(name + ': NOT FOUND'); return; }
  const start = d.indexOf('scalars: {', i);
  const end = d.indexOf('\n  }', start);
  console.log('=== ' + name + ' ===');
  console.log(d.slice(start, end + 4));
}
process.argv.slice(2).forEach(dumpModel);
