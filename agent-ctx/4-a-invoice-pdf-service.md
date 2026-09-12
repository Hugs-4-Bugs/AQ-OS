# Task 4-a: Real PDF Invoice Generation

## Summary
Replaced the stub `invoice-pdf-service.ts` that stored base64 HTML with a real PDF generation implementation using `pdfkit`.

## Changes Made

### File Modified: `/home/z/my-project/src/lib/invoice-pdf-service.ts`

**Complete rewrite of the file with the following key changes:**

1. **Added `pdfkit` import** — `import PDFDocument from 'pdfkit'` for real PDF generation
2. **Added `fs` and `path` imports** — Node.js built-in modules for file I/O
3. **Added `PLAN_CREDITS` import** — From `@/lib/entitlement-service` for credit amounts on invoices
4. **Extended `InvoiceData` interface** — Added `providerPaymentId?` and `provider?` fields for transaction details

5. **New `buildPdfBuffer()` function** — Core PDF generation using pdfkit:
   - Professional A4 layout with teal (#0d9488) branding
   - Top/bottom teal accent bars
   - Company header (left) with INVOICE label (right)
   - Invoice metadata: invoice number, date, due date, currency
   - Billed To section: customer name, email, GSTIN
   - Payment Details section: plan, credits granted, billing cycle, payment method
   - GST badge for Indian invoices
   - Tax exempt notice when applicable
   - Line items table: Description, Qty, Unit Price, Amount
   - Discount items shown in red
   - Amount breakdown: Subtotal, CGST/SGST for Indian users, generic Tax for others
   - Total row with teal highlight
   - Transaction Details: Transaction ID (providerPaymentId), Purchase Date, Next Renewal Date, Payment Method, Plan, Credits
   - Company Details footer
   - Page break handling for long invoices

6. **Rewrote `generateInvoicePdf()`**:
   - Fetches PaymentOrder + User from DB (via `db.paymentOrder.findUnique` with `include: { user: true, invoice: true }`)
   - Checks if a real PDF already exists (skips data: URLs from old stub)
   - Generates invoice number in `INV-YYYYMMDD-XXXX` format
   - Builds line items with discount support
   - Calculates GST breakdown for Indian users (18% total = 9% CGST + 9% SGST)
   - Generates PDF buffer via `buildPdfBuffer()`
   - Ensures `public/invoices/` directory exists (`fs.mkdirSync` with `recursive: true`)
   - Saves PDF to `public/invoices/{invoiceNumber}.pdf`
   - Updates Invoice record's `pdfUrl` to `/invoices/{invoiceNumber}.pdf`
   - Returns `{ success: true, pdfUrl, invoiceId }`

7. **Added `generateInvoiceHtml()` export** — Backward compatibility for existing route at `/api/payments/invoice/[id]/route.ts` that imports this function as a fallback

8. **Preserved `getInvoiceForOrder()` and `getInvoicesForUser()`** — Exact same implementation as before

9. **New `ensureInvoicesDir()` helper** — Creates `public/invoices/` directory if it doesn't exist

10. **New `formatDate()` helper** — Consistent date formatting for PDF rendering

## Verification
- ESLint: 0 errors in modified file
- TypeScript: 0 type errors (full project `tsc --noEmit` passes)
- `public/invoices/` directory created
- Dev server running without issues

## Backward Compatibility
- `generateInvoiceHtml()` still exported for the invoice route fallback
- `getInvoiceForOrder()` and `getInvoicesForUser()` unchanged
- Existing invoices with `data:text/html;base64` URLs will be regenerated as real PDFs on next access
