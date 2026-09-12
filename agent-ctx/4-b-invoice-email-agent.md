# Task 4-b: Invoice Email Service Agent

## Task
Add PDF attachment support to email service + Create invoice email sending service

## Files Modified
- `/src/lib/email.ts` — Added `attachments` field to `EmailPayload`, updated Resend/SMTP/Console providers

## Files Created
- `/src/lib/invoice-email-service.ts` — `sendInvoiceEmail()` function with PDF attachment support

## Key Decisions
1. Attachment support is optional and additive — no existing callers need changes
2. Resend provider converts Buffer content to base64, uses `content_type` field
3. Nodemailer provider passes Buffer/string content directly with `contentType` field
4. Console/dev fallback just logs attachment filenames (no content)
5. Invoice email service handles three pdfUrl types: data URIs, relative paths, external URLs
6. File read failures gracefully degrade — email still sent without attachment
7. All errors caught and returned — function never throws

## Lint Status
- Zero errors in both modified/created files
