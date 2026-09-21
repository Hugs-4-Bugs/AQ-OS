# Task 2-a: Invoice Generate & Resend Agent

## Summary
Created API endpoints and UI for generating invoices for any payment status and resending invoice emails. Updated billing page with comprehensive invoice action buttons.

## Files Created
- `/src/app/api/payments/invoices/generate/route.ts` — POST endpoint to generate invoice PDF for any payment order (with optional email sending)
- `/src/app/api/payments/invoices/resend-email/route.ts` — POST endpoint to resend invoice email (generates PDF first if needed)

## Files Modified
- `/src/lib/invoice-pdf-service.ts` — Added `options?: { force?: boolean }` parameter to `generateInvoicePdf()`, allowing invoice generation for non-completed orders when force=true
- `/src/app/api/payments/invoice/[id]/route.ts` — Removed status gate, added force:true to generateInvoicePdf call
- `/src/app/api/billing/invoices/[invoiceId]/download/route.ts` — Added force:true to generateInvoicePdf call
- `/src/app/dashboard/billing/page.tsx` — Added Generate/Download/Email buttons, batch "Generate Missing" feature
- `/worklog.md` — Appended task work log

## Key Changes
1. `generateInvoicePdf()` now accepts `{ force: true }` to bypass status check
2. Billing page desktop table shows: PDF (if exists) or Generate (if no invoice) + Email resend
3. Billing page mobile cards show same button pattern
4. Invoices list download uses `/api/billing/invoices/{id}/download` instead of raw file paths
5. "Generate Missing" button in Payment History header batch-generates invoices for completed orders without PDFs
