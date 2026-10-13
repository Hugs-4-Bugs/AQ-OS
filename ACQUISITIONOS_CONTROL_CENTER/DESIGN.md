# AcquisitionOS — Product and UI Design Contract

## Design Goal

AcquisitionOS should feel like a premium AI-native acquisition operating system, not a generic CRM/admin dashboard.

Design must communicate:

**Discover → Understand → Decide → Act → Learn → Close**

## Visual/Product Principles

- strong hierarchy
- high contrast
- responsive layouts
- consistent spacing
- accessible controls
- clear loading states
- clear empty states
- clear error states
- truthful success states
- no duplicate UI
- no accidental overlays
- no unnecessary complexity

## Discovery UX

Discovery must clearly show:

- selected niche
- geography
- user instructions
- selected sources
- plan eligibility
- discovery status
- actual number found
- verified/unverified status
- source attribution
- provider errors
- zero-result state
- persistence result

Never show a discovery count that is only the requested count.

If discovery fails, show failure.

If zero valid results are found, show zero.

## Research / Opportunity UX

Lead/company detail should eventually communicate:

- company facts
- signals
- evidence
- business gaps
- opportunity context
- score
- confidence
- recommended next action

Use visual distinction between:

Fact
Inference
Recommendation

## Opportunity Report

The report should make it obvious:

Why this company?
Why now?
What changed?
What problem may exist?
What evidence supports it?
What should we do?
What should we say?

## Outreach UX

Generated messages should use authenticated user's configured:

- name
- email
- phone
- company
- signature

No hardcoded identity.

Missing fields should be omitted.

Messages should remain editable where supported.

## Workflow UX

Workflow creation should make the three context sections explicit:

1. My Context
2. Business Profile
3. My Offer

After activation, the user should be able to see:

- status
- next execution
- last execution
- execution history
- failures
- affected leads
- credits consumed
- actions taken

Do not show “Active” if the worker/trigger is actually broken.

## Approval Center

Long-term high-risk AI actions should be reviewable:

- proposed action
- affected prospect
- evidence
- generated message
- channel
- risk
- approval status

Actions:

Approve
Edit
Reject

## Sales Assistant / Sales Coach

Keep the chat area large and usable.

Preserve selected lead/account context.

AI Markdown should render correctly.

Raw `**bold**` syntax should not appear when formatted Markdown is intended.

## Search UX

Known issue:

Filtering on every keystroke caused focus loss.

Expected:

- debounce expensive searches;
- preserve focus;
- avoid unnecessary requests;
- maintain cursor;
- allow Enter/search submission when appropriate.

## Modal UX

Known issue:

Detail modals incorrectly hid/overlapped the entire app.

Expected:

- correct portal/layer;
- correct z-index;
- body scroll lock;
- contained content;
- independently scrollable dialog;
- predictable close behavior;
- mobile support.

## Duplicate UI

Do not reintroduce duplicate:

- Notifications
- Credits

when a canonical control already exists.

## Mobile

All product surfaces must be responsive:

- navigation
- discovery
- lead lists
- research
- opportunity reports
- outreach
- assistant
- workflows
- billing
- forms
- modals
- tables

## Truthful State Design

Backend truth must drive UI state.

Queued ≠ running.
Running ≠ completed.
Completed ≠ successful unless actual execution succeeded.
Requested count ≠ discovered count.
Workflow saved ≠ workflow executed.

## Future Design Direction

As the product matures, the core UI should evolve from:

Lead list

toward:

**Opportunity workspace**

with:

- Intelligence
- Evidence
- Signals
- Gap
- Score
- Outreach
- Conversation
- Meetings
- Proposal
- Deal
- Next Best Action

The UI should show the reasoning and evidence behind important AI recommendations without exposing internal chain-of-thought.
