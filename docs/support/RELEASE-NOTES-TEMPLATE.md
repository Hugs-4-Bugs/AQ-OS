# AcquisitionOS — Release Notes Template & Examples

**Last updated: 2026-09-09**

This document is the internal standard for writing AcquisitionOS release notes. It contains the **standard structure**, a **filled-in example release (v1.4.0)**, the **blank template** to copy, **email subject line templates**, **in-app banner guidelines**, and a **pre-publish checklist**.

> **Audience:** end users (agencies, freelancers, sales teams) — write for them, not for engineers.
> **Channel order:** In-app banner → release notes page → email announcement (major releases only).
> **Questions:** support@acquisitionos.com

---

## Table of Contents

1. [Standard Structure](#1-standard-structure)
2. [Writing Rules](#2-writing-rules)
3. [Filled-In Example — v1.4.0](#3-filled-in-example--v140)
4. [Blank Template](#4-blank-template)
5. [Email Subject Line Templates](#5-email-subject-line-templates)
6. [In-App Announcement Banner Guidelines](#6-in-app-announcement-banner-guidelines)
7. [Checklist Before Publishing](#7-checklist-before-publishing)

---

## 1. Standard Structure

Every release note follows this exact skeleton:

```markdown
# AcquisitionOS v{MAJOR.MINOR.PATCH}

**Released: {Month DD, YYYY}**
**Available on: Free / Pro / Elite** (list the plans that get this release)

{1–2 sentence friendly summary of the release theme.}

---

## 🚀 New Features
- **{Feature Name}** — {one-to-two sentence benefit-first description}. Available on: Free/Pro/Elite.

## ✨ Improvements
- **{Improvement Name}** — {what got better and why it matters}. Available on: Free/Pro/Elite.

## 🐛 Bug Fixes
- **{Area/Component}** — {what was broken, now fixed}. Available on: Free/Pro/Elite.

## 🔒 Security
- **{Security Item}** — {what was hardened; never disclose exploit details}. Available on: Free/Pro/Elite.

## ⚠️ Deprecations / Breaking Changes
- **{Item}** — {what's changing, the date it takes effect, and what users must do}. Available on: Free/Pro/Elite.

## 📚 Documentation
- **{Doc Item}** — {what guide/page was added or updated, with link}.

## 🖼 Visuals
[Screenshot: {description of what to capture}]

## How to Update
Nothing to do — AcquisitionOS is a SaaS platform and this release is already live at https://acquisition.space-z.ai. Refresh your browser to pick up the latest version.

## Known Issues
- {Issue} — {workaround or ETA}. We're on it.

## Feedback
Love something? Missing something? Click **Feedback** in the app or email support@acquisitionos.com.
```

### Category order is fixed

🚀 New Features → ✨ Improvements → 🐛 Bug Fixes → 🔒 Security → ⚠️ Deprecations/Breaking Changes → 📚 Documentation. If a category has no items, **omit the heading entirely** — don't ship empty sections.

---

## 2. Writing Rules

1. **Benefit first, mechanics second.** "Save 10 minutes per proposal" beats "Refactored the proposal rendering pipeline."
2. **One item = one bullet = one change.** No mega-bullets bundling five fixes.
3. **Bold the name, em-dash the description:** `- **Smart Replies** — AI-drafted responses to lead replies. Available on: Pro/Elite.`
4. **Always state plan availability** on every feature/improvement item using the exact format `Available on: Free/Pro/Elite` (keep only the plans that apply).
5. **No internal jargon.** Never mention service names, migration IDs, PR numbers, or file paths.
6. **Security items stay vague on purpose.** Describe the hardening, never the vulnerability ("Strengthened session token handling" — not the exploit vector).
7. **Deprecations must include a date and a migration path.** A deprecation without an action is a support ticket generator.
8. **Screenshot every headline feature.** One image per major feature, placeholder format: `[Screenshot: ...]`.
9. **Read aloud test:** if a sentence sounds like a changelog robot, rewrite it like you're telling a customer.
10. **Version scheme:** `vMAJOR.MINOR.PATCH` — major = new headline capability, minor = features/improvements, patch = fixes only.

---

## 3. Filled-In Example — v1.4.0

> The example below is a **complete, realistic release**. Use it as the gold standard for tone, length, and formatting.

---

# AcquisitionOS v1.4.0

**Released: September 9, 2026**
**Available on: Free / Pro / Elite**

This release is all about closing faster: smarter meeting scheduling with automatic Google Meet links, richer AI lead analysis you can pitch from, and a batch of quality-of-life improvements across the pipeline and inbox.

---

## 🚀 New Features

- **Autonomous Meeting Mode** — let AcquisitionOS book meetings for you within your working hours and buffer rules, no per-booking approval needed (Approval and Assisted modes still available). Available on: Free/Pro/Elite.
- **AI Lead Analysis v2** — lead analyses now include prioritized improvement suggestions and a "best timing to contact" hint, so you know not just who to pitch but when. Available on: Pro/Elite.
- **Meeting-to-Lead Linking** — every scheduled meeting now appears on the lead's activity timeline, and completed meetings prompt a follow-up reminder. Available on: Free/Pro/Elite.
- **CSV Lead Export** — export any filtered Leads view to CSV for reporting or import into other tools. Available on: Free/Pro/Elite.
- **Telegram Notification Digests** — a daily summary of replies and pipeline movement, in addition to real-time alerts. Available on: Pro/Elite.

## ✨ Improvements

- **Faster Lead Table** — the Leads tab now loads large filtered views up to 2× quicker. Available on: Free/Pro/Elite.
- **Smarter Outreach Drafts** — AI-generated emails now reference the lead's specific website weaknesses more concretely, producing noticeably more personal openers. Available on: Free/Pro/Elite.
- **Clearer Credit Prompts** — when you're low on credits, the platform now shows your exact balance and the cost of the action before you run it. Available on: Free/Pro/Elite.
- **Pipeline Drag Feedback** — cards now snap with visual confirmation when moved between stages. Available on: Free/Pro/Elite.
- **Command Palette Search** — pressing Ctrl/Cmd+K now searches leads by business name, not just tabs. Available on: Free/Pro/Elite.

## 🐛 Bug Fixes

- **Meetings** — fixed a case where buffer time was ignored when bookings were back-to-back. Available on: Free/Pro/Elite.
- **Outreach** — fixed an error when sending to leads whose email address contained uppercase characters. Available on: Free/Pro/Elite.
- **Inbox** — replies from leads with long email threads now sync completely instead of truncating. Available on: Free/Pro/Elite.
- **Billing** — GST invoices now reliably display the company GSTIN saved in Settings → Company. Available on: Free/Pro/Elite.
- **Pipeline** — fixed drag-and-drop occasionally dropping a card back into its original stage on slow connections. Available on: Free/Pro/Elite.

## 🔒 Security

- **Stronger Session Handling** — sessions now invalidate more aggressively after password changes and long inactivity. Available on: Free/Pro/Elite.
- **API Key Scoping Audit** — existing API keys with broad scopes now enforce their declared scopes more strictly; no action needed unless you relied on undocumented behavior. Available on: Free/Pro/Elite.

## ⚠️ Deprecations / Breaking Changes

- **Legacy "Messages" tab redirect** — starting October 1, 2026, the standalone Messages tab redirects to Inbox. Update any bookmarks or internal docs that link directly to the old tab. Available on: Free/Pro/Elite.

## 📚 Documentation

- **New Troubleshooting Guide** — step-by-step fixes for login, email, payment, and meeting issues: [TROUBLESHOOTING-GUIDE.md](./TROUBLESHOOTING-GUIDE.md).
- **Updated User Guide** — new sections on meeting autonomy modes and credit management: [USER-GUIDE.md](./USER-GUIDE.md).

## 🖼 Visuals

[Screenshot: Meeting scheduler showing autonomous booking confirmation with a generated Google Meet link]
[Screenshot: Lead detail panel with the new prioritized improvement suggestions card]
[Screenshot: Leads tab with the CSV export button and credit-balance tooltip]

## How to Update

Nothing to do — AcquisitionOS is a SaaS platform and this release is already live at https://acquisition.space-z.ai. Refresh your browser (Ctrl/Cmd+Shift+R) to pick up the latest version.

## Known Issues

- On first load after this release, the command palette may take up to 2 seconds to index your leads. Resolved by a follow-up patch expected within the week.
- Telegram digest delivery may be delayed up to 30 minutes for accounts in the UTC+5:30 window. Fix in progress.

## Feedback

Love something? Missing something? Click **Feedback** in the app or email **support@acquisitionos.com** — we read everything.

---
*End of example release.*

---

## 4. Blank Template

> Copy everything between the rules below into a new file (`RELEASE-NOTES-vX.Y.Z.md`) and fill in the placeholders. Delete categories with no items.

<!-- COPY FROM HERE -->

# AcquisitionOS v{MAJOR.MINOR.PATCH}

**Released: {Month DD, YYYY}**
**Available on: {Free / Pro / Elite}**

{1–2 sentence friendly summary of the release theme.}

---

## 🚀 New Features

- **{Feature Name}** — {benefit-first description}. Available on: {Free/Pro/Elite}.

## ✨ Improvements

- **{Improvement Name}** — {what got better and why it matters}. Available on: {Free/Pro/Elite}.

## 🐛 Bug Fixes

- **{Area/Component}** — {what was broken, now fixed}. Available on: {Free/Pro/Elite}.

## 🔒 Security

- **{Security Item}** — {what was hardened; no exploit details}. Available on: {Free/Pro/Elite}.

## ⚠️ Deprecations / Breaking Changes

- **{Item}** — {change + effective date + required user action}. Available on: {Free/Pro/Elite}.

## 📚 Documentation

- **{Doc Item}** — {what was added/updated + link}.

## 🖼 Visuals

[Screenshot: {description}]
[Screenshot: {description}]

## How to Update

Nothing to do — AcquisitionOS is a SaaS platform and this release is already live at https://acquisition.space-z.ai. Refresh your browser (Ctrl/Cmd+Shift+R) to pick up the latest version.

## Known Issues

- {Issue} — {workaround or ETA}.

## Feedback

Love something? Missing something? Click **Feedback** in the app or email **support@acquisitionos.com**.

<!-- COPY TO HERE -->

---

## 5. Email Subject Line Templates

Use these for release announcement emails. Keep under ~60 characters where possible so they don't truncate on mobile.

| Release type | Subject template | Example |
|---|---|---|
| Major feature | `New in AcquisitionOS: {Headline Feature}` | New in AcquisitionOS: Autonomous Meeting Mode |
| Feature + fixes | `AcquisitionOS v{X.Y.Z}: {Benefit Phrase} (+{N} fixes)` | AcquisitionOS v1.4.0: Book meetings on autopilot (+11 fixes) |
| Improvements focus | `AcquisitionOS just got {N}×{metric} faster` | AcquisitionOS just got 2× faster lead browsing |
| Bug-fix / patch | `AcquisitionOS v{X.Y.Z} — stability update` | AcquisitionOS v1.4.1 — stability update |
| Security release | `Action recommended: AcquisitionOS security update` | Action recommended: AcquisitionOS security update |
| Deprecation warning | `Heads up: {Feature} is changing on {Date}` | Heads up: the Messages tab is changing on Oct 1 |
| Elite-only feature | `You asked, we built it: {Feature} (Elite)` | You asked, we built it: AI Lead Analysis v2 (Elite) |

**Email body rules:**

- First sentence = the single biggest benefit. No preamble.
- Max 3 bullets above the fold; link "See all changes" to the release notes page.
- One CTA button: "Open AcquisitionOS" → https://acquisition.space-z.ai
- Footer must include plan name, support email (support@acquisitionos.com), and unsubscribe link.

---

## 6. In-App Announcement Banner Guidelines

The in-app banner (top of the dashboard, dismissible) is the first surface users see — keep it tight.

**Rules:**

1. **One line, max 90 characters** including the CTA label.
2. Always pair the text with a **single button**: "See what's new" → release notes page.
3. **Show duration:** major features = 7 days; minor = 3 days; security/deprecations = 14 days (deprecations also get a persistent Settings notice).
4. **Dismissible always.** Dismissed banners stay dismissed unless the severity is `deprecation` or `security`.
5. **Color coding:** 🚀 feature = brand accent · 🐛/🔒 = neutral · ⚠️ deprecation = amber · incident = red.
6. Never stack more than **one** banner; queue the next release until the current one expires or is dismissed.
7. Include an emoji from the release category (🚀 ✨ 🐛 🔒 ⚠️ 📚) as the leading glyph for instant scanning.

**Examples:**

- `🚀 New: Autonomous Meeting Mode books calls for you within your rules — See what's new`
- `⚠️ The Messages tab moves to Inbox on Oct 1 — See what's new`
- `🔒 Security hardened: sessions now expire faster after password changes — See what's new`

---

## 7. Checklist Before Publishing

Run this checklist for every release. All items must be checked before the banner goes live.

### Content

- [ ] Version number follows `vMAJOR.MINOR.PATCH` and matches the deployment
- [ ] Release date correct and timezone-consistent (publish in IST + mention UTC where needed)
- [ ] Every feature/improvement bullet states plan availability in the exact `Available on:` format
- [ ] Benefits lead; internal jargon, PR numbers, and service names removed
- [ ] Deprecations include effective date AND required user action
- [ ] Security items describe hardening without revealing vulnerabilities
- [ ] Summary paragraph passes the read-aloud test

### Visuals

- [ ] Every headline feature has a `[Screenshot: ...]` captured at 1920×1080 with demo (not real customer) data
- [ ] No PII, real emails, or real lead data visible in any screenshot

### Accuracy & consistency

- [ ] Plan names, limits, and pricing match current values (Free: 50 leads/mo · Pro: ₹2,499/mo · Elite: ₹7,999/mo)
- [ ] Links resolve (docs, /api-docs, release notes page)
- [ ] Support email appears as support@acquisitionos.com (billing@acquisitionos.com for billing items)
- [ ] Known Issues section reviewed with engineering same-day; each has a workaround or ETA

### Channels

- [ ] In-app banner text ≤ 90 chars, dismissible, correct color/em, correct show duration
- [ ] Email subject chosen from Section 5; footer includes support email + unsubscribe (major releases only)
- [ ] Release notes page published at the same moment the deployment completes
- [ ] Support team briefed on Known Issues and any deprecations before publishing

### Post-publish

- [ ] Monitor support@acquisitionos.com and in-app feedback for 24h; triage release-related tickets with tag `release-vX.Y.Z`
- [ ] Follow-up patch note appended if a Known Issue is fixed

---

*Template owner: QuantumFusion Solutions documentation team. Propose changes via Feedback or support@acquisitionos.com.*
