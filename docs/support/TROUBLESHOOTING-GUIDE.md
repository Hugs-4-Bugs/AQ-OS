# AcquisitionOS — Troubleshooting Guide

**Last updated: 2026-09-09**

Step-by-step fixes for the most common AcquisitionOS issues. Each entry follows the same structure: **Symptom → Cause → Fix → Escalation**. Work through the numbered fix steps in order — most issues are resolved in the first two or three steps.

> **Support:** support@acquisitionos.com · Billing: billing@acquisitionos.com
> **App:** https://acquisition.space-z.ai
> **Companion docs:** [FAQ](./FAQ.md) · [User Guide](./USER-GUIDE.md)

---

## Table of Contents

1. [Login Issues](#1-login-issues)
2. [Email Issues](#2-email-issues)
3. [Payment Issues](#3-payment-issues)
4. [Feature Issues](#4-feature-issues)
5. [Performance Issues](#5-performance-issues)
6. [Before Contacting Support](#6-before-contacting-support)

---

## 1. Login Issues

### 1.1 Didn't receive the OTP (email verification code)

**Symptom:** You signed up with email/password (or requested a login OTP) and the 6-digit verification code never arrives in your inbox.

**Cause:** The email is delayed by your provider, filtered into spam/promotions, the address was mistyped, or your mail server blocks our sending domain.

**Fix:**

1. Wait 60–90 seconds — OTP emails usually arrive within a minute, but occasional provider delays of 2–3 minutes happen.
2. Check **Spam/Junk**, **Promotions**, and **Updates** folders; search for "AcquisitionOS".
3. Confirm the email address you entered is spelled correctly (a typo means the OTP went to the wrong address).
4. Click **Resend code** on the verification screen. Only the newest code is valid.
5. If your corporate mailbox has strict filtering, ask your IT admin to allowlist emails from the `acquisition.space-z.ai` domain, or sign up with a Gmail/Outlook address instead.
6. As a workaround, return to the login page and use **Continue with Google** or **Magic Link** — both bypass the OTP flow.

**If still broken:** Email support@acquisitionos.com with your registered email address, the approximate time you requested the OTP, and your mail provider (Gmail, Outlook, corporate Exchange, etc.).

---

### 1.2 Magic link expired or invalid

**Symptom:** Clicking "Sign in with Magic Link" shows an error such as *"This link has expired"* or *"Invalid link"*.

**Cause:** Magic links are **single-use** and **expire after 15 minutes**. They are also invalidated if clicked twice, opened in a different browser/device than the one that requested them (in some configurations), or if a newer magic link was requested afterwards.

**Fix:**

1. Go back to the login page and request a **fresh** magic link.
2. Use the newest email only — discard any older magic-link emails; only the latest link works.
3. Click the link within **15 minutes** of receiving it, and click it only **once**.
4. Open the link in the same browser you requested it from, ideally as the default mail handler.
5. If your email client rewrites or wraps URLs (common in some corporate security tools), copy the link and paste it directly into a browser address bar instead.
6. If links consistently fail, switch to email/password or Google sign-in.

**If still broken:** Email support@acquisitionos.com with the timestamp shown in your magic-link email, your browser and device, and whether the error appears immediately or after clicking.

---

### 1.3 Google sign-in failed

**Symptom:** Clicking **Continue with Google** opens a Google screen that errors out, redirects back to the login page, or hangs.

**Cause:** Pop-ups blocked, multiple Google accounts causing a mismatch, a revoked or stale OAuth consent, or the browser blocking third-party cookies/redirects.

**Fix:**

1. Enable pop-ups for `acquisition.space-z.ai` in your browser settings, then retry.
2. If you have multiple Google accounts, sign out of all of them (or use an incognito window) and sign in with the one tied to your AcquisitionOS account.
3. Try a different browser or an incognito/private window to rule out stale cookies.
4. Clear site data for `accounts.google.com` and `acquisition.space-z.ai`, then retry.
5. **Recommended fallback:** use **email/password** instead — if you originally signed up with Google, set a password via **Forgot password** to enable this path.
6. Check that your organization hasn't restricted OAuth apps; if so, ask IT to approve AcquisitionOS.

**If still broken:** Email support@acquisitionos.com with the exact error text, your browser + version, the Google account email (or just its domain if you prefer), and the time of the attempt.

---

### 1.4 Account locked

**Symptom:** You see an *"Account locked"* or *"Too many attempts"* message when trying to sign in.

**Cause:** Repeated failed login attempts (wrong password or OTP) triggered a temporary security lock to protect your account.

**Fix:**

1. Wait 15–30 minutes without attempting to log in — most locks release automatically.
2. Use **Forgot password** to reset your password, which also clears failed-attempt counters.
3. After regaining access, enable 2FA under **Settings → Security** (TOTP apps such as Google Authenticator) to prevent future lockouts from typo storms.
4. Check your inbox for a security alert email; it confirms whether the lock was triggered by your own attempts.
5. If you suspect someone else is trying to access your account, reset your password immediately and contact us.

**If still broken:** Email support@acquisitionos.com from your registered address with the exact error message and the time of the last attempt — we can verify your identity and unlock manually.

---

## 2. Email Issues

### 2.1 Outreach emails not delivering / not sending

**Symptom:** You click **Send & Log** in the Outreach tab, but the lead says they never received anything (or the send fails with an error).

**Cause:** The lead has **no email address on file**, your Gmail connection has expired, you've hit a sending limit, or your credit balance is empty.

**Fix:**

1. Open the lead's detail panel and confirm an **email address** exists — discovery can't always find one. If missing, add it manually or skip this lead.
2. Check the **error message** on the Outreach tab: it names the exact problem (no email, Gmail disconnected, limit reached, or no credits).
3. Reconnect Gmail under integrations if the status shows disconnected/expired (see 2.3).
4. Verify your remaining **credits** in the dashboard header/sidebar — AI outreach generation consumes credits.
5. Confirm you're under Gmail's ~**500 emails/day** limit (see 2.4).
6. Ask the lead to check their spam folder for the message and your confirmation copy in your own inbox — if you received your copy but they didn't, it's a deliverability issue (see 2.2).

**If still broken:** Email support@acquisitionos.com with the lead's business name, the exact timestamp of the send, the error text, and whether your confirmation copy arrived.

---

### 2.2 Emails going to spam

**Symptom:** Your confirmation copies arrive fine, but leads report your emails land in their spam folder — or you find your own outreach in your spam folder.

**Cause:** Low sender reputation on a brand-new mailbox, missing personalization, spam-trigger wording, or too many sends in a short window.

**Fix:**

1. **Warm up** your mailbox: start with 5–10 outreach emails per day for the first two weeks, then increase gradually.
2. Keep messages personalized and relevant — the AI-generated drafts already reference the lead's actual website weaknesses, so avoid stripping that context out when editing.
3. Avoid spam-trigger patterns: ALL-CAPS subject lines, excessive exclamation marks, words like "FREE!!!", and image-only emails.
4. Always include a clear signature with your real name, company, and website.
5. Ask a few recipients to mark your email as "Not spam" and reply — replies rapidly improve sender reputation.
6. Send from a custom domain you own (e.g., you@youragency.com) rather than a generic address.
7. Spread sends across the day instead of blasting 50 at once.

**If still broken:** Email support@acquisitionos.com with 2–3 example subject lines, your sending volume per day, and whether the problem is with one provider (e.g., only Outlook recipients) or all leads.

---

### 2.3 Gmail connection expired

**Symptom:** Outreach fails with a connection error, replies stop syncing into the **Inbox** tab, or integrations show Gmail as "Disconnected"/"Expired".

**Cause:** Google OAuth tokens expire or get revoked — typically after a password change, security review on your Google account, revoked app access, or long inactivity.

**Fix:**

1. Go to integrations (or the Inbox/Outreach tab banner) and click **Reconnect Gmail**.
2. Complete the Google OAuth screen and approve the requested permissions (send + read for outreach and reply sync).
3. Send a single test outreach to yourself to confirm sending works.
4. If reconnect fails, visit myaccount.google.com → **Security → Third-party access** and confirm AcquisitionOS isn't revoked, then retry.
5. If you recently changed your Google password, all connected apps need re-authorization — this is expected.

**If still broken:** Email support@acquisitionos.com with the error shown during reconnection, your browser, and the time of the attempt.

---

### 2.4 Hit the daily Gmail sending limit

**Symptom:** Sends fail partway through a batch with an error like *"sending limit exceeded"*, even though your credits are fine.

**Cause:** Gmail caps standard accounts at roughly **500 emails per day** (rolling 24-hour window). This is a Google-side limit, not an AcquisitionOS limit.

**Fix:**

1. Pause sending for 24 hours — Gmail limits reset on a rolling daily window.
2. Check your sent mail in Gmail to count today's sends; include emails sent manually or by other tools, since they all count toward the same limit.
3. Plan tomorrow's volume under the cap, e.g., 2 batches of ~200.
4. Consider a Google Workspace account for higher limits, or stagger campaigns across multiple days.
5. Use the Outreach tab's scheduling/pacing rather than sending your entire list in one session.

**If still broken:** If you're well under 500 and still see the error, email support@acquisitionos.com with your Gmail account type (free vs. Workspace), today's approximate send count, and the error screenshot.

---

## 3. Payment Issues

### 3.1 Payment succeeded but plan not updated

**Symptom:** Your card was charged (you have the receipt), but the Billing tab still shows your old plan.

**Cause:** Plan activation is driven by a payment webhook between Stripe/Razorpay and AcquisitionOS, which can take **up to 5 minutes** to process. Rarely, a webhook is delayed further or fails.

**Fix:**

1. Wait **5 minutes** — this resolves the vast majority of cases. Do not retry the payment while waiting; you'd be charged twice.
2. Fully refresh the Billing tab (hard refresh: Ctrl/Cmd+Shift+R).
3. Log out and back in to force a fresh session/plan fetch.
4. Check **Billing → Invoices** — if the invoice appears but the plan badge is stale, the webhook is still processing.
5. If you paid via Razorpay UPI/net banking, bank confirmation can add a few minutes on top.

**If still broken:** Email support@acquisitionos.com (or billing@acquisitionos.com) with your payment receipt/order ID, the email on the payment account, the plan you purchased, and payment timestamp. We'll verify and activate your plan manually — you will never lose entitlement for a completed payment.

---

### 3.2 Card declined

**Symptom:** Checkout fails with *"Your card was declined"* or a similar bank error.

**Cause:** The bank blocked the charge (common for international/SaaS transactions), insufficient funds, an expired card, or a mismatch between billing details and bank records. Indian cards may also fail on international Stripe processing if international usage is disabled.

**Fix:**

1. Confirm with your bank that international/online SaaS transactions are allowed on the card.
2. Verify the card isn't expired and the billing address, ZIP/postal code, and CVV are correct.
3. In India, try the **Razorpay** route — it supports UPI, net banking, wallets, and domestic cards without international-routing issues.
4. Try a different card, or use a virtual card with a raised limit.
5. Wait 10–15 minutes after multiple declines (banks temporarily flag rapid attempts), then retry once.

**If still broken:** Email billing@acquisitionos.com with the error code shown at checkout, your country, and the payment method type — we can suggest an alternative route or generate a manual invoice for eligible accounts.

---

### 3.3 GST invoice missing or incorrect

**Symptom:** You can't find a GST invoice for an Indian (INR) payment, or the invoice shows wrong company name/GSTIN.

**Cause:** Your **Settings → Company** profile was incomplete at payment time, or the invoice is still generating.

**Fix:**

1. Go to **Billing → Invoices** — GST invoices appear there within minutes of a successful INR payment.
2. Fill in your legal company name and GSTIN under **Settings → Company** so future invoices are correct.
3. For a corrected past invoice, email billing@acquisitionos.com with the invoice number, correct details, and your order ID.
4. Note: invoices for Stripe (non-INR) payments are standard international invoices, not GST documents.

**If still broken:** Email billing@acquisitionos.com with your order ID and the exact details that need correcting; reissued invoices typically arrive within 1–2 business days.

---

## 4. Feature Issues

### 4.1 Lead discovery returns no results

**Symptom:** You submit a niche + location in the **Discover** tab and get zero leads back.

**Cause:** Overly narrow niche/location combination, a spelling variant, temporary search-provider throttling, or exhausted discovery capacity for your plan this month.

**Fix:**

1. Broaden the location (e.g., search a whole city rather than one neighborhood).
2. Try a nearby niche from the standard list (e.g., "Cafe" instead of "Coffee Roasters") — the picker shows all supported niches.
3. Confirm your monthly lead quota isn't exhausted (Free: 50, Pro: 500, Elite: 2,000) — the Discover tab shows your usage.
4. Check your **credit balance** — discovery is a credit-consuming AI action.
5. Retry after a few minutes; search-provider rate limits occasionally pause results briefly.
6. Try a different country from the supported list: India, UAE, USA, UK, Canada, Australia.

**If still broken:** Email support@acquisitionos.com with the exact niche + location you searched, your plan, and the time — we'll check whether the query hit a provider issue.

---

### 4.2 AI generation fails (outreach, analysis, or assistant)

**Symptom:** Clicking **Generate** in Outreach, running lead analysis, or chatting with the Assistant returns an error or a credit-related message.

**Cause:** Insufficient **credit balance** (most common), a temporary AI-provider outage, or a very long request.

**Fix:**

1. Check your credit balance in the dashboard — outreach generation, lead analysis, and assistant coaching all consume credits.
2. If you're out of credits, upgrade your plan via the **Billing** tab or wait for the next cycle refill.
3. Retry once after 30 seconds — transient AI-provider errors usually clear immediately.
4. For outreach, confirm the lead has enough profile data (niche/website); extremely sparse leads can fail analysis — run discovery again or enrich the lead manually.
5. Keep assistant prompts reasonably concise; split very long conversations into a new chat.

**If still broken:** Email support@acquisitionos.com with which feature failed, the exact error text, your credit balance at the time, and the timestamp — we'll refund credits lost to failed generations.

---

### 4.3 Meeting scheduling requires Google Calendar

**Symptom:** Scheduling a meeting prompts *"Connect Google Calendar first"* or the slot picker shows no availability.

**Cause:** No Google Calendar is connected, or the connected calendar's permissions are incomplete — scheduling, availability checks, and Google Meet link generation all depend on the calendar connection.

**Fix:**

1. Go to **Settings → Meeting Preferences** and click **Connect Google Calendar**.
2. Approve the OAuth permissions (calendar events + Meet link creation).
3. Click **Test Availability** — it should return your real free/busy slots.
4. Set your **working hours, days, timezone, and buffer** in the same page; scheduling only offers slots inside these windows.
5. Check your autonomy mode: **Approval** mode holds proposed meetings for your confirmation before anything is booked.
6. Verify the meeting is within your configured working hours — otherwise no slots will appear.

**If still broken:** Email support@acquisitionos.com with your configured timezone/working hours, whether Test Availability succeeds, and the exact error text.

---

### 4.4 Calendar shows "Not connected"

**Symptom:** The **Calendar** tab or meeting settings display a "not connected" state even though you connected Google Calendar before.

**Cause:** The OAuth token expired or was revoked (password change, Google security review, removed app access), the same way Gmail connections can lapse (see 2.3).

**Fix:**

1. Open **Settings → Meeting Preferences** and click **Reconnect** / **Connect Google Calendar**.
2. Complete the Google consent screen fully — closing the popup early leaves the state "not connected."
3. Run **Test Availability** to confirm the link is live.
4. If your Google account password changed recently, reconnecting is mandatory and expected.
5. Check Google Account → Security → Third-party access to confirm AcquisitionOS is listed and not revoked.

**If still broken:** Email support@acquisitionos.com with the time of the disconnect, whether Test Availability works, and a screenshot of the meeting settings page.

---

## 5. Performance Issues

### 5.1 Dashboard is slow or laggy

**Symptom:** Tab switches, the Overview dashboard, or the Leads table take several seconds to load; the UI feels sluggish.

**Cause:** Large lead datasets with many filters, a slow network connection, an overloaded browser (many tabs/extensions), or occasional server-side slowness during peak hours.

**Fix:**

1. Hard refresh the page (Ctrl/Cmd+Shift+R) to clear stale cached assets.
2. Close unused browser tabs and disable heavy extensions (ad blockers and script blockers can interfere with the dashboard).
3. Narrow your filters in the Leads tab — loading thousands of unfiltered rows is slower than a filtered view.
4. Test your connection speed; the dashboard streams live data and needs a stable link.
5. Try another browser (Chrome/Edge/Firefox latest versions recommended) to rule out a local profile issue.
6. Check the [status page / in-app banner](https://acquisition.space-z.ai) for any active incident.

**If still broken:** Email support@acquisitionos.com with your plan, approximate lead count, browser + OS, network type, and which tabs are slowest (a 20-second screen recording helps a lot).

---

### 5.2 Notifications delayed or missing

**Symptom:** The notification bell doesn't show new replies, reminders fire late, or Telegram notifications arrive minutes/hours behind.

**Cause:** Notification delivery is near-real-time but not guaranteed instant; browser tab sleeping, Telegram bot paused, email client batching, or a temporary queue backlog can delay alerts.

**Fix:**

1. Keep the AcquisitionOS tab open (or pinned) — sleeping/background tabs can defer in-app notifications.
2. Check notification settings under **Settings** — confirm the events you expect (replies, reminders, meetings) are enabled.
3. For Telegram: confirm the bot chat is still active, you haven't muted the chat, and the pairing is intact (reconnect if unsure).
4. For reminders: verify the reminder's **due time and timezone** on the lead — reminders fire in your account timezone.
5. Pull-to-refresh the dashboard; missed notifications are back-filled on load.
6. Wait 10–15 minutes during peak hours before assuming loss — queued events do deliver.

**If still broken:** Email support@acquisitionos.com with the event type that was delayed, the expected vs. actual delivery time, your timezone, and whether in-app, email, or Telegram was affected.

---

## 6. Before Contacting Support

To get the fastest resolution, include the following when emailing **support@acquisitionos.com**:

| Include | Why it helps |
|---|---|
| Registered account email | Locates your account instantly |
| Plan (Free/Pro/Elite) | Determines limits and entitlements |
| Exact error text or screenshot | Matches the issue to a known cause |
| Timestamp + timezone | Correlates with server logs |
| Browser & OS | Reproduces environment-specific bugs |
| Steps you already tried | Avoids repeating the same fixes |

**Response time:** within one business day. Billing escalations (payment taken, plan not active) are prioritized — mark the subject line **"[Billing]"** and use billing@acquisitionos.com.

> Tip: the in-app **Feedback** option attaches your current tab and session context automatically — it's the fastest way to report a bug you're seeing live.
