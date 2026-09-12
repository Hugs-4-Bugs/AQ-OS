# Task ID: 5 — Developer Tab & Features Agent

## Summary
Added full Developer tab content to settings-panel.tsx with API Key Management, Webhook Configuration, and Data Export sections.

## Changes Made

### 1. CreateApiKeyDialog Component
- Added before SettingsPanel component (lines 219-309)
- Name input + 5 permission checkboxes (leads:read, leads:write, deals:read, deals:write, analytics:read)
- Two-step flow: Create form → Key display with copy button and security warning
- Generates `sk_live_***` format key, shows once with "Copy this key now" warning

### 2. CreateWebhookDialog Component
- Added before SettingsPanel component (lines 311-381)
- Name input, URL input with validation, 4 event checkboxes (lead.created, deal.created, deal.won, payment.received)
- Validates URL via `new URL()` before allowing creation

### 3. Developer Tab State
- Added: apiKeys (2 mock entries), apiKeyDialogOpen, webhookDialogOpen, lastExportDate
- Added: handleExportCSV callback (fetches from API, generates CSV, triggers download)
- Added: handleExportAnalytics callback (generates JSON, triggers download)

### 4. Enhanced Developer TabsContent
- **A. API Key Management**: Key list with prefix, dates, permissions badges; copy prefix tooltip; revoke with AlertDialog; empty state
- **B. Webhook Configuration**: Toggle enable/disable; active/inactive badge; test webhook button; delete with AlertDialog; empty state
- **C. Data Export**: 3 export buttons (Leads CSV, Deals CSV, Analytics JSON); last export timestamp; import data drag-and-drop area
- **Kept**: System Status, API Documentation, Request Logs cards

### 5. Dialog Wiring
- CreateApiKeyDialog and CreateWebhookDialog rendered at bottom of Sheet with proper state handlers

## Verification
- Lint: ✅ 0 errors
- No existing functionality broken

## File Modified
- `/src/components/dashboard/settings-panel.tsx`
