// SAFETY CONTRACT: prints line numbers and MASKED line content only.
// Any potential secret substring is replaced with ***MASKED*** before printing.
const fs = require('fs');
const lines = fs.readFileSync('/home/z/my-project/scripts/tmp/recovery-20261020/worklog.md.full', 'utf8').split('\n');

const mask = (s) => s
  .replace(/GOCSPX-[A-Za-z0-9_-]+/g, 'GOCSPX-***MASKED***')
  .replace(/[a-z]{4}( [a-z]{4}){3}/g, '***MASKED-4x4***')
  .replace(/[A-Za-z0-9+/]{50,}={0,2}/g, '***MASKED-B64***');

const checks = {
  GOCSPX: /GOCSPX-[A-Za-z0-9_-]+/,
  appPw: /[a-z]{4}( [a-z]{4}){3}/,
  b64: /[A-Za-z0-9+/]{50,}={0,2}/,
};

for (const [name, re] of Object.entries(checks)) {
  console.log(`\n=== ${name} occurrences (masked context) ===`);
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      n++;
      if (n <= 6) console.log(`L${i + 1}: ${mask(lines[i]).slice(0, 160)}`);
    }
  }
  console.log(`total: ${n}`);
}
