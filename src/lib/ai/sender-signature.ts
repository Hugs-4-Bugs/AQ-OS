// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sender signature personalization
//
// AI-generated outreach used to end with literal placeholders such as
// "Best regards, [Your Name]" because the generation prompt carries no
// sender identity. This module:
//   1. builds a sender-profile block for the generation prompt, and
//   2. deterministically replaces any placeholder signature tokens the
//      model still emitted with the AUTHENTICATED user's saved profile
//      values — omitting fields cleanly when they are missing.
//
// Pure functions (no DB, no I/O) so they are unit-testable. Never
// hardcodes any user data; an empty profile leaves no placeholders.
// ═══════════════════════════════════════════════════════════════════

export interface SenderProfile {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

/** Placeholder tokens the model may emit, mapped to the profile field. */
const TOKEN_TO_FIELD: Array<{ pattern: RegExp; field: keyof SenderProfile }> = [
  { pattern: /\[Your\s+Name\]/gi, field: 'name' },
  { pattern: /\[Your\s+Full\s+Name\]/gi, field: 'name' },
  { pattern: /\[Your\s+Company(?:\s+Name)?\]/gi, field: 'company' },
  { pattern: /\[Your\s+Phone(?:\s+Number)?\]/gi, field: 'phone' },
  { pattern: /\[Your\s+Email(?:\s+Address)?\]/gi, field: 'email' },
  // No profile data exists for these — always omitted, never faked.
  { pattern: /\[Your\s+(?:Title|Position|Role)\]/gi, field: 'name' },
  { pattern: /\[Your\s+Contact\s+(?:Information|Details)\]/gi, field: 'name' },
];

/** Build the "who is signing" instruction block for the generation prompt. */
export function buildSenderSignatureBlock(profile: SenderProfile): string {
  const lines: string[] = [];
  if (profile.name?.trim()) lines.push(`- Name: ${profile.name.trim()}`);
  if (profile.company?.trim()) lines.push(`- Company: ${profile.company.trim()}`);
  if (profile.email?.trim()) lines.push(`- Email: ${profile.email.trim()}`);
  if (profile.phone?.trim()) lines.push(`- Phone: ${profile.phone.trim()}`);

  if (lines.length === 0) {
    return `SENDER (you are writing on behalf of the sender):
- The sender's profile has no contact details on file.
- Do NOT invent a sender name, company, email or phone.
- Do NOT use placeholders such as [Your Name] or [Your Company].
- End the message with a plain sign-off (e.g. "Best regards,") and nothing after it.`;
  }

  return `SENDER (you are writing on behalf of the sender):
${lines.join('\n')}
When signing the message, use ONLY these real sender details, each on its own line under the sign-off (e.g. "Best regards,"). Omit any detail not listed above. NEVER invent or use placeholder text such as [Your Name], [Your Company], undefined or null.`;
}

/**
 * Replace placeholder signature tokens in an AI-generated message body
 * with the authenticated user's real profile values. Fields with no
 * saved value are removed cleanly (no "[Your Name]", no "undefined",
 * no dangling labels). If the body contains no placeholders this is a
 * no-op — user-visible content is never rewritten beyond the tokens.
 */
export function applySenderSignature(body: string, profile: SenderProfile): string {
  if (!body) return body;

  const valueFor = (field: keyof SenderProfile): string => {
    const v = profile[field];
    return typeof v === 'string' ? v.trim() : '';
  };

  let out = body;
  for (const { pattern, field } of TOKEN_TO_FIELD) {
    out = out.replace(pattern, () => valueFor(field));
  }

  // Collapse whitespace left behind by removed tokens: trailing blanks
  // and lines that became empty between the sign-off and the end.
  out = out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');

  return out;
}
