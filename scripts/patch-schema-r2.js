#!/usr/bin/env node
/* Round-2 schema field additions (idempotent). */
const fs = require('fs');
const SCHEMA = '/home/z/my-project/prisma/schema.prisma';
let src = fs.readFileSync(SCHEMA, 'utf8');
const N = '\n';

const ADDITIONS = {
  WorkflowDefinition: ['maxRetries Int?', 'maxConcurrency Int?'],
  WhatsappConfig: ['twilioAuthToken String?', 'twilioPhoneNumber String?', 'lastHealthCheckAt DateTime?'],
  TelegramConfig: ['botId String?', 'webhookVerified Boolean @default(false)', 'lastHealthCheckAt DateTime?', 'metaVerifyToken String?', 'twilioAuthToken String?', 'twilioPhoneNumber String?'],
  UserSettings: ['compactMode Boolean @default(false)', 'defaultNiche String?', 'defaultCountry String?', 'timezone String?', 'businessDescription String?'],
  DashboardShare: ['dashboardType String?', 'shareToken String?', 'permissions String?', 'updatedAt DateTime @updatedAt'],
  MessageTemplate: ['content String?'],
  User: ['lastPaymentFailureAt DateTime?'],
};

let added = 0;
for (const [model, fields] of Object.entries(ADDITIONS)) {
  const sm = src.match(new RegExp(`^model ${model} \\{`, 'm'));
  if (!sm) { console.log(`!! model ${model} not found`); continue; }
  const start = sm.index + sm[0].length;
  const end = src.indexOf('\n}', start);
  const block = src.slice(start, end);
  const lines = [];
  for (const f of fields) {
    const fname = f.split(/\s+/)[0];
    if (!new RegExp(`^\\s*${fname}\\s`, 'm').test(block)) { lines.push(`  ${f}`); added++; }
  }
  if (lines.length) {
    src = src.slice(0, end) + N + lines.join(N) + src.slice(end);
    console.log(`${model}: +${lines.length} (${lines.map(l => l.trim().split(/\s+/)[0]).join(',')})`);
  }
}
fs.writeFileSync(SCHEMA, src);
console.log(`done, ${added} fields added`);
