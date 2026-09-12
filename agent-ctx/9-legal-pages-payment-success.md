# Task 9 — Legal Pages + Payment Success Agent

## Task
Create Terms of Service, Privacy Policy, and Payment Success pages for AcquisitionOS.

## Files Created

1. **`/src/app/(marketing)/layout.tsx`** — Passthrough layout for the (marketing) route group
2. **`/src/app/(marketing)/terms/page.tsx`** — Full Terms of Service page (17 sections, ~33KB)
3. **`/src/app/(marketing)/privacy/page.tsx`** — Full Privacy Policy page (13 sections, ~33KB)
4. **`/src/app/payment/success/page.tsx`** — Payment Success page with Stripe session verification (~13KB)
5. **`/src/app/api/payments/verify-session/route.ts`** — API endpoint to verify Stripe checkout sessions (~2KB)

## Files Modified

6. **`/src/app/globals.css`** — Added `confetti-fall` keyframe animation for Payment Success page

## Key Design Decisions

- All pages use `'use client'` as specified
- Legal pages use the `(marketing)` route group with a passthrough layout
- Legal pages styled with Card, Badge, Button, Separator from shadcn/ui
- Proper heading hierarchy (h1, h2, h3) with numbered section badges
- Sticky navigation header with "Back to App" link
- Fully responsive with mobile-first design (sm: breakpoints)
- Dark mode compatible using Tailwind CSS theme variables
- Payment Success page uses `useMemo` for confetti (avoids React 19 lint issues with setState in effects)
- Payment verification uses proper async effect pattern with cleanup/abort
- Stripe API route uses dynamic import matching existing project patterns
- All files pass ESLint with zero new errors

## Terms of Service Key Provisions
- QuantumFusion Solutions as the company
- Monthly = 365/12 days, yearly = 365 days
- Free credits reset on 1st of month
- 18% GST for India
- Prorated refunds if >20% period remaining AND >Rs100
- Credits: no cash value, non-transferable, rollover limits
- Gmail: OAuth, limited use, 24hr retention
- Liability cap: 3 months payments
- Governing law: India, Jharkhand courts
- Contact: legal@acquisitionos.com, support@acquisitionos.com

## Privacy Policy Key Provisions
- Gmail integration: OAuth scopes, limited use, 24hr retention
- Security: TLS 1.3, AES-256, bcrypt, SSL
- No selling personal data
- Rights: access, rectification, erasure, portability, object, restrict
- GDPR rights (EU/EEA)
- India DPDP Act rights
- DPO: dpo@acquisitionos.com
- Address: Jamshedpur, Jharkhand, India
