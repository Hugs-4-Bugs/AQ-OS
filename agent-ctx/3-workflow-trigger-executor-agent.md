# Task 3: Add Workflow Trigger System & Fix Executor

## Summary
Implemented workflow trigger system and fixed executor to properly handle action types from the builder.

## Changes Made

### New Files
1. **src/lib/workflow-triggers.ts** — `fireWorkflowTrigger(triggerType, triggerData, userId?)` function that queries active non-template workflows matching a trigger type and executes them. Returns `{ triggered, errors }`.

2. **src/app/api/workflows/trigger/route.ts** — POST API route with `withAuth` that accepts `{ triggerType, triggerData }` and calls `fireWorkflowTrigger()`.

### Modified Files
3. **src/lib/workflow-executor.ts**:
   - Added `effectiveType` resolution: `const effectiveType = (step.config?.actionType as string) || step.type;`
   - Changed `switch (step.type)` → `switch (effectiveType)` — fixes builder-to-executor mismatch
   - Added `send_gmail_reply` case with thread tracking (Re: prefix, replyToId)
   - Enhanced `send_telegram` with providerMessageId and metadata tracking
   - Updated default case to reference `effectiveType`

4. **src/lib/types.ts** — Added `'send_gmail_reply'` to `WorkflowActionType` union

5. **src/components/dashboard/workflow-builder.tsx**:
   - Added `{ type: 'send_gmail_reply', label: 'Gmail Reply', stepType: 'action' }` to ACTION_ITEMS
   - Added `send_gmail_reply` config form with Subject and Reply Content fields

## Lint Status
All created/modified files pass ESLint. Remaining errors are pre-existing (no-require-imports in server files).
