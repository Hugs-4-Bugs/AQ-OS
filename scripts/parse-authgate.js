// Parse auth-gate.tsx with the TypeScript parser API:
// 1. list ALL parse diagnostics (syntax errors)
// 2. dump the AST shape of the useEffect call near line 893
const ts = require('typescript');
const fs = require('fs');

const path = '/home/z/my-project/src/components/dashboard/auth-gate.tsx';
const text = fs.readFileSync(path, 'utf8');
const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2020, /*setParentNodes*/ true, ts.ScriptKind.TSX);

console.log('=== parse diagnostics ===');
console.log(JSON.stringify(sf.parseDiagnostics.map(d => ({
  code: d.code,
  msg: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  line: sf.getLineAndCharacterOfPosition(d.start).line + 1,
})), null, 2));

console.log('=== AST around line 893-899 ===');
const visit = (node) => {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  if (start.line + 1 >= 890 && start.line + 1 <= 900) {
    console.log(`line ${start.line + 1}: ${ts.SyntaxKind[node.kind]} — ${node.getText(sf).slice(0, 120).replace(/\n/g, '\\n')}`);
    if (node.arguments) {
      console.log(`   args count: ${node.arguments.length}`);
      node.arguments.forEach((a, i) => {
        const p = sf.getLineAndCharacterOfPosition(a.getStart(sf));
        console.log(`   arg[${i}] line ${p.line + 1}: ${ts.SyntaxKind[a.kind]}`);
      });
    }
  }
  ts.forEachChild(node, visit);
};
visit(sf);
