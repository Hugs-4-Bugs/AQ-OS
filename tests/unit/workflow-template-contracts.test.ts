/**
 * MASTER-FIX regression tests — Workflows: builder configs must satisfy the
 * ENGINE's real contracts so a saved workflow can actually run.
 *
 * Failure modes covered (task spec §14):
 *  - every template's step type exists in the mounted engine
 *  - send_email steps always carry a recipient (the engine requires to/subject/body)
 *  - update_tags configs are ARRAYS (the engine rejects strings)
 *  - condition nodes always carry field + value (the engine fails on empty)
 *  - the flagship template covers the end-to-end acquisition loop
 */
import { BUILTIN_TEMPLATES } from '@/lib/workflow-templates';

// The action types the MOUNTED engine (workflow-actions.ts) implements.
const ENGINE_ACTION_TYPES = new Set([
  'send_email', 'create_gmail_draft', 'send_telegram', 'send_whatsapp',
  'ai_analysis', 'ai_outreach', 'move_lead_stage', 'update_tags',
  'create_notification', 'wait_delay', 'conditional_branch', 'webhook_call',
  'export_data', 'score_lead', 'add_note', 'notify_low_credits', 'notify_trial_ending',
]);

const NODE_TYPES = new Set(['trigger', 'action', 'condition', 'delay', 'ai_action']);
const TRIGGER_TYPES = new Set([
  'lead_discovered', 'lead_moved', 'lead_reply', 'gmail_connected', 'email_received',
  'telegram_received', 'whatsapp_received', 'payment_success', 'trial_ending',
  'credits_low', 'ai_completed', 'webhook', 'scheduled', 'manual',
]);

function stepsOf(template: (typeof BUILTIN_TEMPLATES)[number]) {
  return template.nodes as Array<{
    id: string;
    type: string;
    title: string;
    config: Record<string, unknown>;
  }>;
}

describe('workflow templates — engine-contract validity', () => {
  it('ships the flagship End-to-End Client Acquisition template', () => {
    const flagship = BUILTIN_TEMPLATES.find((t) => t.name === 'End-to-End Client Acquisition');
    expect(flagship).toBeDefined();
  });

  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s — every step satisfies the engine contract',
    (_name, template) => {
      expect(TRIGGER_TYPES.has(template.triggerType)).toBe(true);

      const steps = stepsOf(template);
      expect(steps[0].type).toBe('trigger');

      for (const step of steps.slice(1)) {
        expect(NODE_TYPES.has(step.type)).toBe(true);

        const actionType = String(step.config.actionType || step.type);
        if (step.type === 'action' || step.type === 'ai_action') {
          expect(ENGINE_ACTION_TYPES.has(actionType)).toBe(true);
        }

        if (actionType === 'send_email' || actionType === 'create_gmail_draft') {
          // Regression: templates used to omit `to` → every run failed.
          expect(String(step.config.to || '')).not.toBe('');
          expect(String(step.config.subject || '')).not.toBe('');
          expect(String(step.config.body || '')).not.toBe('');
        }

        if (actionType === 'update_tags') {
          // Regression: builder stored a comma STRING, engine needs an array.
          expect(Array.isArray(step.config.tags)).toBe(true);
          expect(step.config.tags as string[]).toEqual(expect.arrayContaining([expect.any(String)]));
        }

        if (actionType === 'conditional_branch' || step.type === 'condition') {
          // Regression: empty field/value configs were fatal at runtime.
          expect(String(step.config.field || '')).not.toBe('');
          expect(String(step.config.operator || '')).not.toBe('');
          expect(
            step.config.value !== undefined && String(step.config.value) !== ''
          ).toBe(true);
        }

        if (actionType === 'move_lead_stage') {
          expect(String(step.config.targetStage || step.config.stage || '')).not.toBe('');
        }
      }
    }
  );

  it('flagship covers the full autonomous acquisition loop (research → analyze → outreach → approval → send → follow-up → pipeline)', () => {
    const flagship = BUILTIN_TEMPLATES.find((t) => t.name === 'End-to-End Client Acquisition')!;
    const actionTypes = stepsOf(flagship)
      .slice(1)
      .map((s) => String(s.config.actionType || s.type));

    expect(actionTypes).toContain('ai_analysis'); // research / analyze
    expect(actionTypes).toContain('score_lead'); // qualification
    expect(actionTypes).toContain('conditional_branch'); // gating
    expect(actionTypes).toContain('ai_outreach'); // personalized outreach (draft = approval point)
    expect(actionTypes).toContain('create_notification'); // human review notification
    expect(actionTypes).toContain('send_email'); // delivery
    expect(actionTypes).toContain('send_whatsapp'); // follow-up
    expect(actionTypes).toContain('move_lead_stage'); // pipeline update
    // The outreach step must be a DRAFT producer, not an auto-send:
    // ai_outreach stores a draft and never sends (engine behavior).
  });

  it('uses {{lead.*}} and structured {{output.<step>.<field>}} variables the resolver supports', () => {
    const flagship = BUILTIN_TEMPLATES.find((t) => t.name === 'End-to-End Client Acquisition')!;
    const reply = BUILTIN_TEMPLATES.find((t) => t.name === 'Lead Reply Follow-up')!;
    const emailSteps = [...stepsOf(flagship), ...stepsOf(reply)].filter(
      (s) => String(s.config.actionType) === 'send_email'
    );
    for (const step of emailSteps) {
      const to = String(step.config.to || '');
      // recipient must either be a literal address or a supported variable
      expect(to === '' || /\{\{lead\.email\}\}|^[^{{]+@[^{{]+$/.test(to)).toBe(true);
    }
    const replyBody = String(
      stepsOf(reply).find((s) => String(s.config.actionType) === 'send_email')!.config.body
    );
    // structured output reference: {{output.<stepId>.generatedMessage}}
    expect(replyBody).toMatch(/\{\{output\.n3\.generatedMessage\}\}/);
  });
});
