# Task ID: 6 — Gmail Draft Integration (Phase 9)

## Work Log

### 1. Created API Route: POST /api/gmail/outreach-to-draft
**File:** `src/app/api/gmail/outreach-to-draft/route.ts`

- `withAuth` wrapper for authentication
- Body accepts: `{ emailAccountId, leadId, channel, subject, body, html? }`
- Validates lead exists, is active, and has an email address
- Checks `EmailUnsubscribe` table — returns 403 with `UNSUBSCRIBED` code if lead has unsubscribed
- Validates the email account belongs to the authenticated user and is active
- Calls `createDraft` from `gmail-delivery-service` to create the Gmail draft
- Creates an `OutreachMessage` record with status `'draft'` and `generatedByAI: true`
- Stores metadata in OutreachMessage (gmailDraftId, emailAccountId, gmailEmail, leadEmail)
- Audit log via `logEmailDrafted`
- Returns `{ success, draftId, outreachMessageId }`
- Proper error handling for: unsubscribed leads, inactive accounts, missing fields, Gmail API errors

### 2. Updated outreach-tab.tsx
**File:** `src/components/dashboard/outreach-tab.tsx`

- Added `fetchGmailAccounts` import from `@/lib/api`
- Added Gmail draft state: `gmailAccounts`, `gmailAccountsLoaded`, `gmailDraftLoading`
- Created `GmailDraftButton` component with full logic:
  - Lazy-loads Gmail accounts on first click via `fetchGmailAccounts()`
  - Shows "Gmail Draft" button with emerald styling when accounts exist
  - Shows "Connect Gmail" button when no accounts are connected
  - Auto-creates draft with single account; shows account picker dialog for multiple accounts
  - Loading state with spinner during draft creation
  - Handles errors: unsubscribe detected, account expired, API failures
  - Toast notifications for success and all error cases
- Placed `GmailDraftButton` next to existing "Send & Log" button
- Only shows when `channel === 'email'` AND `selectedLead?.email` exists
- Account picker uses Dialog component with visual account selection cards

### 3. Updated ai-outreach-dialog.tsx
**File:** `src/components/dashboard/ai-outreach-dialog.tsx`

- Added `leadEmail` prop to `AIOutreachDialogProps`
- Added Gmail draft state: `gmailAccounts`, `gmailAccountsLoaded`, `gmailDraftLoading`, `showAccountPicker`
- Added `loadGmailAccounts()` — fetches active Gmail accounts from `/api/gmail/accounts`
- Added `handleCreateGmailDraft()` — calls `/api/gmail/outreach-to-draft` API
- Added `handleGmailDraftClick()` — orchestrates the Gmail draft flow
- "Create Gmail Draft" button appears after AI generation (only for email channel with leadEmail)
- Warning banner when lead has no email ("Add an email address to this lead to create a Gmail draft")
- Warning banner when no Gmail connected ("Connect Gmail first")
- Account picker dialog for multiple Gmail accounts
- Loading spinner during draft creation
- All error cases handled with appropriate toast messages

### 4. Updated lead-detail-panel.tsx
**File:** `src/components/dashboard/lead-detail-panel.tsx`

- Added `leadEmail={lead.email}` prop to `<AIOutreachDialog>` component

## Lint Results
- All modified files pass ESLint with 0 errors, 0 warnings
- Only pre-existing errors remain (custom-server.js, proxy/index.js, process-manager.js, server.js)

## Files Created
1. `src/app/api/gmail/outreach-to-draft/route.ts`

## Files Modified
1. `src/components/dashboard/outreach-tab.tsx` — Added GmailDraftButton component and integration
2. `src/components/dashboard/ai-outreach-dialog.tsx` — Added Gmail draft action with account picker
3. `src/components/dashboard/lead-detail-panel.tsx` — Added leadEmail prop to AIOutreachDialog
