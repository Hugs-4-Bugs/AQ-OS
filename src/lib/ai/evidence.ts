// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2: Structured Evidence Model
//
// Every model result distinguishes:
//   · facts          — observable, verifiable statements
//   · evidence       — the source material supporting the facts
//   · inferences     — derived conclusions (model-authored, not raw)
//   · recommendations — actionable suggestions (lower default confidence)
//   · confidence     — 0..1 self-reported by the model (parsed if present)
//   · limitations    — what the model could NOT verify or reason about
//   · role           — Researcher | Critic | Verifier | Strategist | Synthesizer
//   · modelProvider   — actual serving provider
//   · modelId        — actual serving model id
//   · correlationId  — stable per-orchestration correlation
//   · timestamp      — model completion time
//
// Unsupported model claims MUST NOT silently become system facts.
// When models disagree, both results are preserved and the disagreement
// is recorded in the durable execution record.
//
// The extractor is HEURISTIC — it tries JSON-first, then falls back to
// a tagged-section parser. Models that emit unstructured prose degrade
// gracefully to "raw" evidence with low confidence.
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';

// ===== TYPES =====

export type ModelRole =
  | 'researcher'
  | 'critic'
  | 'verifier'
  | 'strategist'
  | 'synthesizer'
  | 'analyst'
  | 'generator'
  | 'reviewer'
  | string; // open-set — workflows may define their own roles

export interface StructuredEvidence {
  /** Observable, verifiable statements. These are NOT system facts yet —
   *  they must be cross-checked by another model or external tool before
   *  being promoted to system-stored facts. */
  facts: string[];
  /** Source material (URLs, document IDs, prior-model-output refs) that
   *  the model used to support its facts. Empty when the model had no
   *  external grounding. */
  evidence: string[];
  /** Derived conclusions. Treated as model-authored opinion, NOT as
   *  ground truth. Cross-model agreement increases weight. */
  inferences: string[];
  /** Actionable suggestions. These NEVER auto-execute — they require
   *  synthesizer review or human approval depending on the action's
   *  sensitivity. */
  recommendations: string[];
  /** Self-reported confidence 0..1. Parsed from the model's output
   *  when present (e.g. `{"confidence": 0.78}`). Defaults to 0.5 when
   *  unparsable — neither trusted nor dismissed. */
  confidence: number;
  /** Explicit limitations the model flagged (e.g. "could not verify
   *  the company's funding stage"). Persists so the synthesizer can
   *  decide whether to seek more evidence or proceed with caveats. */
  limitations: string[];
  /** The role this model was assigned (Researcher/Critic/etc.). */
  role: ModelRole;
  /** Actual serving provider (post-fallback). */
  modelProvider?: string;
  /** Actual serving model id (post-fallback). */
  modelId?: string;
  /** Stable correlation id — same id shared by every model slot
   *  in one orchestration, so the synthesizer can group results. */
  correlationId: string;
  /** Model completion time (epoch ms). */
  timestamp: number;
  /** Raw model output, preserved verbatim for audit/debugging. */
  raw?: string;
}

// ===== EXTRACTION =====

/**
 * Extract a StructuredEvidence object from a model's text output.
 *
 * Strategy (in priority order):
 *   1. JSON-parse the entire output if it is a JSON object containing
 *      the expected keys. Most reliable.
 *   2. Find a fenced ```json ... ``` block and parse that.
 *   3. Tagged-section fallback: parse lines matching `<section>:` patterns.
 *   4. Last-resort degrade: treat the entire output as a single inference
 *      with confidence 0.5 and no supporting evidence.
 *
 * The extractor is deliberately PERMISSIVE — a model that returns prose
 * still produces a valid StructuredEvidence (with degraded confidence),
 * so downstream code never has to special-case "no evidence available".
 */
export function extractEvidenceFromContent(
  content: string,
  opts: {
    role?: ModelRole;
    modelProvider?: string;
    modelId?: string;
    correlationId?: string;
  } = {}
): StructuredEvidence {
  const correlationId = opts.correlationId ?? randomUUID();
  const timestamp = Date.now();
  const role = opts.role ?? 'analyst';

  const trimmed = (content ?? '').trim();
  if (trimmed.length === 0) {
    return emptyEvidence(role, opts.modelProvider, opts.modelId, correlationId);
  }

  // Strategy 1 — whole-output JSON
  const wholeJson = tryParseJson(trimmed);
  if (wholeJson && isEvidenceShaped(wholeJson)) {
    return normalizeEvidence(wholeJson, {
      role,
      modelProvider: opts.modelProvider,
      modelId: opts.modelId,
      correlationId,
      timestamp,
      raw: trimmed,
    });
  }

  // Strategy 2 — fenced JSON block
  const fenced = extractFencedJson(trimmed);
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed && isEvidenceShaped(parsed)) {
      return normalizeEvidence(parsed, {
        role,
        modelProvider: opts.modelProvider,
        modelId: opts.modelId,
        correlationId,
        timestamp,
        raw: trimmed,
      });
    }
  }

  // Strategy 3 — tagged sections
  const tagged = parseTaggedSections(trimmed);
  if (tagged.facts.length > 0 || tagged.inferences.length > 0 || tagged.recommendations.length > 0) {
    return {
      facts: tagged.facts,
      evidence: tagged.evidence,
      inferences: tagged.inferences,
      recommendations: tagged.recommendations,
      confidence: clampConfidence(tagged.confidence ?? 0.5),
      limitations: tagged.limitations,
      role,
      modelProvider: opts.modelProvider,
      modelId: opts.modelId,
      correlationId,
      timestamp,
      raw: trimmed,
    };
  }

  // Strategy 4 — degraded fallback (prose with no parseable structure)
  return {
    facts: [],
    evidence: [],
    inferences: [truncate(trimmed, 800)],
    recommendations: [],
    confidence: 0.5,
    limitations: ['Model output was unstructured prose — confidence defaulting to 0.5'],
    role,
    modelProvider: opts.modelProvider,
    modelId: opts.modelId,
    correlationId,
    timestamp,
    raw: trimmed,
  };
}

// ===== AGGREGATION =====

/**
 * Merge multiple StructuredEvidence objects into one aggregate view.
 *
 * Used by the synthesizer to summarize what the parallel models
 * collectively said. Facts are deduplicated; evidence is unioned;
 * inferences are tagged with their origin role.
 *
 * The merged `confidence` is the MINIMUM across inputs — the synthesizer
 * is only as confident as its least-confident source.
 */
export function mergeEvidence(inputs: StructuredEvidence[]): StructuredEvidence {
  if (inputs.length === 0) {
    return emptyEvidence('synthesizer', undefined, undefined, randomUUID());
  }
  if (inputs.length === 1) {
    return { ...inputs[0], role: 'synthesizer' };
  }

  const facts = dedupe(inputs.flatMap((e) => e.facts));
  const evidence = dedupe(inputs.flatMap((e) => e.evidence));
  const inferences = dedupe(
    inputs.flatMap((e) => e.inferences.map((inf) => `[${e.role}] ${inf}`))
  );
  const recommendations = dedupe(inputs.flatMap((e) => e.recommendations));
  const limitations = dedupe(inputs.flatMap((e) => e.limitations));
  const minConfidence = Math.min(...inputs.map((e) => e.confidence));
  const correlationId = inputs[0].correlationId;

  return {
    facts,
    evidence,
    inferences,
    recommendations,
    confidence: minConfidence,
    limitations,
    role: 'synthesizer',
    correlationId,
    timestamp: Date.now(),
  };
}

/**
 * Compute the disagreement level between two evidence objects.
 *
 * Returns a 0..1 score where 1 = maximum disagreement. Uses Jaccard
 * similarity of fact sets (case-insensitive token overlap). Two models
 * that produce the SAME fact set have 0 disagreement.
 *
 * Unlike the existing `detectDisagreement` (which uses raw content
 * Jaccard), this operates on the EXTRACTED facts — models may phrase
 * the same fact differently in prose but converge on the same fact
 * set after extraction. This is the evidence-first view.
 */
export function evidenceDisagreementLevel(
  a: StructuredEvidence,
  b: StructuredEvidence
): number {
  // If both have no facts, we can't measure fact-level disagreement —
  // fall back to inference overlap.
  if (a.facts.length === 0 && b.facts.length === 0) {
    return jaccardDistance(tokenizeSet(a.inferences), tokenizeSet(b.inferences));
  }
  return jaccardDistance(tokenizeSet(a.facts), tokenizeSet(b.facts));
}

// ===== HELPERS =====

function emptyEvidence(
  role: ModelRole,
  provider: string | undefined,
  model: string | undefined,
  correlationId: string
): StructuredEvidence {
  return {
    facts: [],
    evidence: [],
    inferences: [],
    recommendations: [],
    confidence: 0,
    limitations: ['No model output produced — evidence is empty.'],
    role,
    modelProvider: provider,
    modelId: model,
    correlationId,
    timestamp: Date.now(),
  };
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractFencedJson(text: string): string | null {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  return m ? m[1].trim() : null;
}

function isEvidenceShaped(obj: Record<string, unknown>): boolean {
  // Accept any object that has at least one of the canonical keys.
  // Models may emit partial evidence objects (e.g. just `facts` + `confidence`).
  const keys = new Set(Object.keys(obj));
  return (
    keys.has('facts') ||
    keys.has('evidence') ||
    keys.has('inferences') ||
    keys.has('recommendations') ||
    keys.has('confidence')
  );
}

function normalizeEvidence(
  obj: Record<string, unknown>,
  ctx: {
    role: ModelRole;
    modelProvider?: string;
    modelId?: string;
    correlationId: string;
    timestamp: number;
    raw?: string;
  }
): StructuredEvidence {
  const asStrArr = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' || typeof x === 'boolean' ? String(x) : null))
        .filter((x): x is string => !!x && x.length > 0);
    }
    if (typeof v === 'string' && v.trim().length > 0) return [v.trim()];
    return [];
  };
  const asNum = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };
  return {
    facts: asStrArr(obj.facts),
    evidence: asStrArr(obj.evidence),
    inferences: asStrArr(obj.inferences),
    recommendations: asStrArr(obj.recommendations),
    confidence: clampConfidence(asNum(obj.confidence) ?? 0.5),
    limitations: asStrArr(obj.limitations),
    role: typeof obj.role === 'string' ? obj.role : ctx.role,
    modelProvider: ctx.modelProvider,
    modelId: ctx.modelId,
    correlationId: ctx.correlationId,
    timestamp: ctx.timestamp,
    raw: ctx.raw,
  };
}

function parseTaggedSections(text: string): {
  facts: string[];
  evidence: string[];
  inferences: string[];
  recommendations: string[];
  limitations: string[];
  confidence?: number;
} {
  // Recognizes headers like:
  //   Facts:
  //   ## Evidence
  //   **Recommendations**:
  //   - Inference: ...
  // Bullet items under a section are collected into that section's array.
  const sections: Record<string, string[]> = {
    facts: [],
    evidence: [],
    inferences: [],
    recommendations: [],
    limitations: [],
  };
  let current: keyof typeof sections | null = null;
  let confidence: number | undefined;

  const lines = text.split(/\r?\n/);
  // Header matches forms like:
  //   "Facts: ..."            (colon-separated)
  //   "## Facts"              (markdown header, no colon)
  //   "**Recommendations**:"  (bold + colon)
  //   "- Inferences:"         (bullet + colon)
  const headerRe = /^\s*(?:[#*\-]*\s*)?(facts|evidence|inferences?|recommendations?|limitations?|confidence)\b\s*[:\-]?\s*(.*)$/i;

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      const key = m[1].toLowerCase();
      const rest = m[2] ?? '';
      if (key.startsWith('fact')) {
        current = 'facts';
      } else if (key.startsWith('evidence')) {
        current = 'evidence';
      } else if (key.startsWith('inference')) {
        current = 'inferences';
      } else if (key.startsWith('recommendation')) {
        current = 'recommendations';
      } else if (key.startsWith('limitation')) {
        current = 'limitations';
      } else if (key.startsWith('confidence')) {
        const n = Number(rest.replace(/[^0-9.]/g, ''));
        if (Number.isFinite(n)) {
          // Accept 0..1 or 0..100 — scale if it looks like a percentage.
          confidence = n > 1 ? n / 100 : n;
        }
        current = null;
        continue;
      }
      // The remainder of the header line is content too (e.g.
      // "Facts: company has 50 employees" pushes that single fact).
      if (rest.trim().length > 0 && current) {
        sections[current].push(rest.trim());
      }
      continue;
    }
    // Bullet / dash line under the current section
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bullet && current) {
      sections[current].push(bullet[1].trim());
      continue;
    }
    // Plain text line under the current section
    const plain = line.trim();
    if (plain.length > 0 && current) {
      // Only collect if it doesn't look like a new section header
      if (!headerRe.test(plain)) {
        sections[current].push(plain);
      }
    } else if (plain.length === 0) {
      // blank line — keep current section context
    }
  }

  return {
    facts: sections.facts,
    evidence: sections.evidence,
    inferences: sections.inferences,
    recommendations: sections.recommendations,
    limitations: sections.limitations,
    confidence,
  };
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const key = x.toLowerCase().trim();
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function tokenizeSet(arr: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of arr) {
    for (const tok of s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
      if (tok.length > 0) out.add(tok);
    }
  }
  return out;
}

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0; // both empty = agree
  if (a.size === 0 || b.size === 0) return 1; // one empty = total disagreement
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}
