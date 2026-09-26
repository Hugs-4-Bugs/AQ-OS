// READ-ONLY runtime probe: replicates the EXACT z-ai SDK calls made by
//   (a) lead discovery ai_search (web_search + LLM extraction)
//   (b) Quick Assistant (chat.completions with thinking disabled)
// NO database access. NO secrets printed.
import ZAI from 'z-ai-web-dev-sdk';
import os from 'node:os';
import fs from 'node:fs';

const now = () => new Date().toISOString();

console.log(`[${now()}] === PROBE A: ZAI.create() ===`);
let zai;
try {
  zai = await ZAI.create();
  console.log('ZAI.create(): OK');
  // Safe metadata: config file location + baseUrl host only
  const cfgRaw = fs.readFileSync('/etc/.z-ai-config', 'utf-8');
  const cfg = JSON.parse(cfgRaw);
  try { console.log('config source: /etc/.z-ai-config, baseUrl host:', new URL(cfg.baseUrl).host); }
  catch { console.log('config source: /etc/.z-ai-config, baseUrl present:', !!cfg.baseUrl); }
  console.log('apiKey present:', !!cfg.apiKey, '(value not shown)');
  console.log('chatId present:', !!cfg.chatId, 'userId present:', !!cfg.userId, 'token present:', !!cfg.token);
} catch (e) {
  console.error('ZAI.create() FAILED:', e.message);
  process.exit(1);
}

// ── PROBE B: web_search with the EXACT first query of hospital/usa ai_search
console.log(`\n[${now()}] === PROBE B: web_search "hospital businesses in usa" (num=10) ===`);
try {
  const res = await zai.functions.invoke('web_search', { query: 'hospital businesses in usa', num: 10 });
  const arr = Array.isArray(res) ? res : [];
  console.log('web_search returned:', arr.length, 'results');
  for (const r of arr.slice(0, 5)) {
    console.log(`  - name=${(r.name || '').slice(0, 60)} | url=${(r.url || '').slice(0, 70)}`);
  }
} catch (e) {
  console.error('web_search FAILED:', e.constructor.name, '-', e.message.slice(0, 500));
}

// ── PROBE C: LLM extraction shape (model auto, temperature 0, JSON array output)
console.log(`\n[${now()}] === PROBE C: chat.completions extraction-shape (model=auto, temp=0) ===`);
try {
  const t0 = Date.now();
  const response = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON arrays. No markdown, no explanations.' },
      { role: 'user', content: 'From the text below extract businesses as a JSON array with fields businessName, website, employeeCount (null if unknown).\n\nText: "Mayo Clinic Rochester MN, 76000 employees, www.mayoclinic.org. Cleveland Clinic Ohio, www.clevelandclinic.org."\n\nReturn ONLY a JSON array.' },
    ],
    model: 'auto',
    temperature: 0,
  });
  const dt = Date.now() - t0;
  const content = response.choices?.[0]?.message?.content || '';
  console.log(`chat OK in ${dt}ms; content length=${content.length}`);
  console.log('content preview:', content.slice(0, 300).replace(/\n/g, ' '));
} catch (e) {
  console.error('extraction-shape chat FAILED:', e.constructor.name, '-', e.message.slice(0, 500));
}

// ── PROBE D: assistant-shape call with the Quick Assistant's exact pattern
//    (system prompt as role:'assistant', thinking disabled, "hi" message)
console.log(`\n[${now()}] === PROBE D: assistant-shape chat (thinking disabled, message "hi") ===`);
try {
  const t0 = Date.now();
  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: `You are an elite sales strategist and deal-closing expert. You help salespeople navigate complex B2B conversations by analyzing prospect messages and providing actionable, psychologically-informed guidance.

When given a prospect's message, ANALYZE intent, buying signals, hesitation; SUGGEST the best next response, psychological approach and closing strategy.

Return your analysis as a JSON object with these EXACT fields:
{
  "analysis": { "intent": "string", "buyingSignals": ["..."], "hesitationPoints": ["..."], "trustLevel": "low|medium|high", "priceSensitivity": "low|medium|high", "decisionAuthority": "decision_maker|influencer|unknown", "emotionalState": "string" },
  "suggestedResponse": "string",
  "psychologicalApproach": { "framework": "string", "lever": "string", "framing": "string", "rationale": "string" },
  "closingStrategy": { "type": "string", "timing": "string", "nextMilestone": "string", "riskAssessment": "string" }
}

Be specific, practical, and actionable. Return ONLY valid JSON.`,
      },
      { role: 'user', content: `The prospect just sent this message:\n"hi"\n\nHelp me respond and close this deal.` },
    ],
    thinking: { type: 'disabled' },
  });
  const dt = Date.now() - t0;
  const content = response.choices?.[0]?.message?.content || '';
  console.log(`chat OK in ${dt}ms; content length=${content.length}`);
  console.log('has choices:', Array.isArray(response.choices), 'count:', response.choices?.length);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  console.log('JSON extractable by route regex (/{\\\\s\\\\S*}/):', !!jsonMatch);
  console.log('content preview:', content.slice(0, 400).replace(/\n/g, ' '));
  if (jsonMatch) {
    try { const parsed = JSON.parse(jsonMatch[0]); console.log('JSON.parse: OK — top-level keys:', Object.keys(parsed).join(', ')); }
    catch (pe) { console.log('JSON.parse FAILED:', pe.message.slice(0, 200)); }
  }
} catch (e) {
  console.error('assistant-shape chat FAILED:', e.constructor.name, '-', e.message.slice(0, 500));
}

console.log(`\n[${now()}] === PROBES COMPLETE ===`);
