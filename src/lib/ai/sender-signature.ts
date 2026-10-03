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

/**
 * Apply the same placeholder cleanup to every string field of a
 * structured generation output (e.g. { subject, body } or
 * { connectionMessage, followUpMessage }). Non-string fields pass
 * through untouched. Only placeholder tokens are ever replaced —
 * real content (including the lead's own details) is never rewritten.
 */
export function applySenderSignatureToFields<T extends Record<string, unknown>>(
  fields: T,
  profile: SenderProfile
): T {
  const out = { ...fields };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value === 'string' && value) {
      out[key] = applySenderSignature(value, profile) as T[Extract<keyof T, string>];
    }
  }
  return out;
}

/**
 * The canonical signature lines for the authenticated user, in order:
 * name, company, "Email: …", "Phone: …". Fields with no saved value are
 * omitted entirely (never an empty label), and any value that ALREADY
 * appears in the message body (when provided) is skipped so the same
 * detail is never duplicated between the AI's own sign-off and the
 * appended signature block.
 */
export function buildSignatureLines(
  profile: SenderProfile,
  existingBody?: string
): string[] {
  const haystack = existingBody ? existingBody.toLowerCase() : null;
  const seen = (value: string): boolean =>
    haystack !== null && haystack.includes(value.toLowerCase());

  const lines: string[] = [];
  const name = profile.name?.trim();
  const company = profile.company?.trim();
  const email = profile.email?.trim();
  const phone = profile.phone?.trim();

  if (name && !seen(name)) lines.push(name);
  if (company && !seen(company)) lines.push(company);
  if (email && !seen(email)) lines.push(`Email: ${email}`);
  if (phone && !seen(phone)) lines.push(`Phone: ${phone}`);
  return lines;
}

/**
 * The signature lines joined as a plain-text block ("" when nothing is
 * available — callers append nothing in that case).
 */
export function buildSignatureBlock(
  profile: SenderProfile,
  existingBody?: string
): string {
  return buildSignatureLines(profile, existingBody).join('\n');
}
