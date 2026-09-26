// Verify exact display amounts: GST (existing arch: Math.round(base*0.18)) and savings/monthly-equivalents
const plans = {
  starter: { monthly: 499, yearly: 4999 },
  pro: { monthly: 1599, yearly: 14999 },
  elite: { monthly: 5199, yearly: 44999 },
};
const expected = {
  starter: { mGST: 90, mTotal: 589, yGST: 900, yTotal: 5899, save: 989, equiv: 416 },
  pro: { mGST: 288, mTotal: 1887, yGST: 2700, yTotal: 17699, save: 4189, equiv: 1249 },
  elite: { mGST: 936, mTotal: 6135, yGST: 8100, yTotal: 53099, save: 17389, equiv: 3749 },
};
let ok = true;
for (const [p, cfg] of Object.entries(plans)) {
  const e = expected[p];
  const mGST = Math.round(cfg.monthly * 0.18);
  const mTotal = cfg.monthly + mGST;
  const yGST = Math.round(cfg.yearly * 0.18);
  const yTotal = cfg.yearly + yGST;
  const save = cfg.monthly * 12 - cfg.yearly;
  const equiv = Math.floor(cfg.yearly / 12);
  const row = [p,
    ['mGST', mGST, e.mGST], ['mTotal', mTotal, e.mTotal],
    ['yGST', yGST, e.yGST], ['yTotal', yTotal, e.yTotal],
    ['save', save, e.save], ['equiv', equiv, e.equiv]];
  const bad = row.slice(1).filter(([, a, b]) => a !== b);
  if (bad.length) ok = false;
  console.log(row.map((r, i) => i === 0 ? r : (r[1] === r[2] ? `✔ ${r[0]}=${r[1]}` : `✘ ${r[0]} got ${r[1]} want ${r[2]}`)).join('  '));
}
console.log(ok ? 'ALL GST/SAVINGS/EQUIV VALUES MATCH SPEC' : 'MISMATCH FOUND');
process.exit(ok ? 0 : 1);
