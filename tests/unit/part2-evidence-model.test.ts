// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Evidence Model
//
// Pure-logic tests for src/lib/ai/evidence.ts:
//   · extractEvidenceFromContent — JSON, fenced JSON, tagged sections,
//     prose fallback
//   · mergeEvidence — dedup, min confidence, synthesizer role
//   · evidenceDisagreementLevel — Jaccard on facts, fallback to inferences
//
// No DB, no network. Tests are deterministic and run in milliseconds.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  extractEvidenceFromContent,
  mergeEvidence,
  evidenceDisagreementLevel,
  type StructuredEvidence,
} from '@/lib/ai/evidence';
import { assertEvidenceShape } from '../helpers/part2-test-utils';

describe('[Part 2] Evidence Model', () => {
  describe('extractEvidenceFromContent', () => {
    it('parses a full JSON evidence object', () => {
      const content = JSON.stringify({
        facts: ['Company has 50 employees', 'Series A funded'],
        evidence: ['https://example.com/crunchbase'],
        inferences: ['Likely enterprise customer'],
        recommendations: ['Send enterprise demo offer'],
        confidence: 0.82,
        limitations: ['Could not verify funding stage'],
      });
      const e = extractEvidenceFromContent(content, {
        role: 'researcher',
        modelProvider: 'z-ai',
        modelId: 'glm-4.6',
        correlationId: 'test-corr-1',
      });
      assertEvidenceShape(e);
      expect(e.facts).toHaveLength(2);
      expect(e.facts[0]).toContain('50 employees');
      expect(e.evidence).toHaveLength(1);
      expect(e.confidence).toBeCloseTo(0.82);
      expect(e.role).toBe('researcher');
      expect(e.modelProvider).toBe('z-ai');
      expect(e.modelId).toBe('glm-4.6');
      expect(e.correlationId).toBe('test-corr-1');
      expect(e.limitations).toHaveLength(1);
    });

    it('parses a fenced ```json block within prose', () => {
      const content = `Here is my analysis:\n\n\`\`\`json\n{"facts": ["Lead responded positively"], "confidence": 0.7}\n\`\`\`\n\nHope this helps.`;
      const e = extractEvidenceFromContent(content, { role: 'critic' });
      expect(e.facts).toHaveLength(1);
      expect(e.facts[0]).toBe('Lead responded positively');
      expect(e.confidence).toBeCloseTo(0.7);
    });

    it('parses tagged sections (Facts: ...)', () => {
      // Each fact on its own line (bullet or sentence-form). The
      // parser pushes one entry per content line under the active
      // section header.
      const content = `Facts:
- Company uses Salesforce.
- Company has 200 employees.
Evidence: crunchbase.com/company
Inferences: Likely Salesforce-native
Recommendations: Pitch CRM integration
Confidence: 0.75
Limitations: Funding data unavailable`;
      const e = extractEvidenceFromContent(content, { role: 'analyst' });
      expect(e.facts.length).toBeGreaterThanOrEqual(2);
      expect(e.evidence.length).toBeGreaterThanOrEqual(1);
      expect(e.inferences.length).toBeGreaterThanOrEqual(1);
      expect(e.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(e.confidence).toBeCloseTo(0.75);
      expect(e.limitations.length).toBeGreaterThanOrEqual(1);
    });

    it('parses bullet-style tagged sections', () => {
      const content = `## Facts
- The company is hiring
- They raised Series B

## Recommendations
- Reach out to VP of Eng
- Mention their recent raise`;
      const e = extractEvidenceFromContent(content, { role: 'researcher' });
      expect(e.facts.length).toBe(2);
      expect(e.recommendations.length).toBe(2);
    });

    it('degrades to prose fallback with 0.5 confidence', () => {
      const content = 'This is just plain prose with no structure at all, just rambling about a company.';
      const e = extractEvidenceFromContent(content, { role: 'analyst' });
      expect(e.facts).toHaveLength(0);
      expect(e.inferences.length).toBe(1);
      expect(e.inferences[0]).toContain('plain prose');
      expect(e.confidence).toBeCloseTo(0.5);
      expect(e.limitations[0]).toContain('unstructured');
    });

    it('handles empty content as empty evidence with confidence 0', () => {
      const e = extractEvidenceFromContent('', { role: 'verifier' });
      expect(e.facts).toHaveLength(0);
      expect(e.confidence).toBe(0);
      expect(e.limitations[0]).toContain('No model output');
    });

    it('clamps confidence above 1 to 1', () => {
      const content = JSON.stringify({ facts: ['x'], confidence: 1.5 });
      const e = extractEvidenceFromContent(content, {});
      expect(e.confidence).toBe(1);
    });

    it('clamps confidence below 0 to 0', () => {
      const content = JSON.stringify({ facts: ['x'], confidence: -0.3 });
      const e = extractEvidenceFromContent(content, {});
      expect(e.confidence).toBe(0);
    });

    it('accepts partial evidence objects (just facts + confidence)', () => {
      const content = JSON.stringify({ facts: ['fact1', 'fact2'], confidence: 0.6 });
      const e = extractEvidenceFromContent(content, {});
      expect(e.facts).toHaveLength(2);
      expect(e.confidence).toBeCloseTo(0.6);
      expect(e.evidence).toHaveLength(0);
      expect(e.inferences).toHaveLength(0);
    });

    it('parses confidence as a percentage (e.g. 75) into 0.75', () => {
      const content = `Confidence: 75\nFacts: One fact`;
      const e = extractEvidenceFromContent(content, {});
      expect(e.confidence).toBeCloseTo(0.75);
    });

    it('auto-generates a correlationId when none is provided', () => {
      const e = extractEvidenceFromContent('test', {});
      expect(e.correlationId).toBeTruthy();
      expect(typeof e.correlationId).toBe('string');
      expect(e.correlationId.length).toBeGreaterThan(5);
    });

    it('preserves raw content in the .raw field', () => {
      const content = 'Raw prose preserved verbatim for audit purposes.';
      const e = extractEvidenceFromContent(content, {});
      expect(e.raw).toBe(content);
    });
  });

  describe('mergeEvidence', () => {
    it('merges multiple evidence objects and deduplicates facts', () => {
      const a: StructuredEvidence = {
        facts: ['Company A', 'Has funding'],
        evidence: ['url1'],
        inferences: ['Growing'],
        recommendations: ['Outreach'],
        confidence: 0.8,
        limitations: [],
        role: 'researcher',
        correlationId: 'corr-1',
        timestamp: 1,
      };
      const b: StructuredEvidence = {
        facts: ['Has funding', 'Company B'],
        evidence: ['url2'],
        inferences: ['Scaling'],
        recommendations: ['Demo'],
        confidence: 0.6,
        limitations: ['No data'],
        role: 'critic',
        correlationId: 'corr-1',
        timestamp: 2,
      };
      const merged = mergeEvidence([a, b]);
      expect(merged.role).toBe('synthesizer');
      // dedup: "Has funding" appears once
      expect(merged.facts).toHaveLength(3); // Company A, Has funding, Company B
      expect(merged.facts).toContain('Company A');
      expect(merged.facts).toContain('Company B');
      expect(merged.facts).toContain('Has funding');
      // min confidence wins
      expect(merged.confidence).toBeCloseTo(0.6);
      // evidence unioned
      expect(merged.evidence).toHaveLength(2);
      // inferences tagged with role
      expect(merged.inferences.some((i) => i.includes('[researcher]'))).toBe(true);
      expect(merged.inferences.some((i) => i.includes('[critic]'))).toBe(true);
      // limitations unioned
      expect(merged.limitations).toContain('No data');
    });

    it('returns empty synthesizer evidence for empty input', () => {
      const merged = mergeEvidence([]);
      expect(merged.role).toBe('synthesizer');
      expect(merged.facts).toHaveLength(0);
      expect(merged.confidence).toBe(0);
    });

    it('returns the single input with synthesizer role when only one', () => {
      const a: StructuredEvidence = {
        facts: ['one'],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0.9,
        limitations: [],
        role: 'analyst',
        correlationId: 'c',
        timestamp: 1,
      };
      const merged = mergeEvidence([a]);
      expect(merged.role).toBe('synthesizer');
      expect(merged.facts).toEqual(['one']);
      expect(merged.confidence).toBeCloseTo(0.9);
    });
  });

  describe('evidenceDisagreementLevel', () => {
    it('returns 0 when two evidence objects share all facts', () => {
      const a: StructuredEvidence = {
        facts: ['fact A', 'fact B'],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0.8,
        limitations: [],
        role: 'r',
        correlationId: 'c',
        timestamp: 1,
      };
      const b: StructuredEvidence = { ...a };
      expect(evidenceDisagreementLevel(a, b)).toBeCloseTo(0);
    });

    it('returns 1 when two evidence objects have disjoint facts', () => {
      const a: StructuredEvidence = {
        facts: ['aaa'],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0.5,
        limitations: [],
        role: 'r',
        correlationId: 'c',
        timestamp: 1,
      };
      const b: StructuredEvidence = {
        ...a,
        facts: ['zzz'],
      };
      expect(evidenceDisagreementLevel(a, b)).toBeCloseTo(1);
    });

    it('falls back to inferences when no facts present', () => {
      const a: StructuredEvidence = {
        facts: [],
        evidence: [],
        inferences: ['northamerican market growing'],
        recommendations: [],
        confidence: 0.5,
        limitations: [],
        role: 'r',
        correlationId: 'c',
        timestamp: 1,
      };
      const b: StructuredEvidence = {
        ...a,
        inferences: ['zebrafish mutation observed'],
      };
      // Disjoint token sets → max disagreement = 1
      expect(evidenceDisagreementLevel(a, b)).toBeCloseTo(1);
    });

    it('returns 0 when both evidence objects have empty facts and empty inferences', () => {
      const a: StructuredEvidence = {
        facts: [],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0,
        limitations: [],
        role: 'r',
        correlationId: 'c',
        timestamp: 1,
      };
      const b: StructuredEvidence = { ...a };
      expect(evidenceDisagreementLevel(a, b)).toBeCloseTo(0);
    });

    it('returns partial disagreement for overlapping facts', () => {
      const a: StructuredEvidence = {
        facts: ['common fact', 'only in A'],
        evidence: [],
        inferences: [],
        recommendations: [],
        confidence: 0.5,
        limitations: [],
        role: 'r',
        correlationId: 'c',
        timestamp: 1,
      };
      const b: StructuredEvidence = {
        ...a,
        facts: ['common fact', 'only in B'],
      };
      const level = evidenceDisagreementLevel(a, b);
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(1);
    });
  });
});
