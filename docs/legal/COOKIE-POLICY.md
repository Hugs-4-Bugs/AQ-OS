# Cookie Policy — AcquisitionOS

> **Last updated:** 2026-09-09
> **Operator:** QuantumFusion Solutions
> **Product:** AcquisitionOS — AI-powered B2B client acquisition platform · https://acquisition.space-z.ai
> **Contact:** legal@acquisitionos.com

> **Note:** The user-facing version of this document renders inside the application at `/legal/cookies`. This Markdown is the canonical source; the rendered page should match. This policy should be read alongside our [Privacy Policy](PRIVACY-POLICY.md).

---

## Table of Contents

1. [What Cookies and Similar Technologies Are](#1-what-cookies-and-similar-technologies-are)
2. [Essential Authentication Cookies](#2-essential-authentication-cookies)
3. [Theme Preference (Local Storage)](#3-theme-preference-local-storage)
4. [Consent Cookies](#4-consent-cookies)
5. [Analytics Cookies](#5-analytics-cookies)
6. [Third-Party Cookies](#6-third-party-cookies)
7. [Duration Summary](#7-duration-summary)
8. [How to Control Cookies](#8-how-to-control-cookies)
9. [What Breaks When You Block Essential Cookies](#9-what-breaks-when-you-block-essential-cookies)
10. [Do Not Track](#10-do-not-track)
11. [Legacy Cookie Names](#11-legacy-cookie-names)
12. [Changes to This Policy](#12-changes-to-this-policy)
13. [Contact](#13-contact)
14. [Frequently Asked Questions](#14-frequently-asked-questions)

---

## 1. What Cookies and Similar Technologies Are

1.1. Cookies are small text files that a website stores on your device (computer, tablet, or phone) when you visit. They let the website recognize your device across requests and sessions, remember your sign-in state, and store preferences. Similar technologies we use include:

- **Local storage** (HTML5 `localStorage`/`sessionStorage`) — browser storage for persisting settings such as your theme preference.
- **Web beacons / pixel tags** — small images embedded in pages or emails that can record when content is viewed (for example, open tracking in outreach campaigns you send).

1.2. We keep our cookie footprint deliberately small: authentication, your consent choices, your preferences, and — only with your consent — product analytics. We do not use cookies for advertising, and we do not sell data collected through cookies.

## 2. Essential Authentication Cookies

These cookies are **strictly necessary** for the Service to work. They keep you signed in securely. Because the Service cannot function without them, they are not subject to opt-in consent — under GDPR, strictly necessary cookies do not require consent.

| Cookie | Purpose | Duration | Path | Attributes |
|---|---|---|---|---|
| `access_token` | Short-lived **JWT access token** that authenticates your API requests and session | **15 minutes** (refreshed automatically) | `/` | `httpOnly`; `Secure` (in production); `SameSite=Strict` |
| `refresh_token` | Long-lived **refresh token** used by the `/api/auth` refresh and sign-out endpoints to issue new access tokens and keep you signed in | **30 days** | `/api/auth` | `httpOnly`; `Secure` (in production); `SameSite=Strict` |

2.1. **How the session works.** When you sign in, the server sets both cookies. The `access_token` authenticates each request for 15 minutes; when it expires, the client calls the refresh endpoint, which (thanks to the `refresh_token` being scoped to `/api/auth`) issues a new access token without asking you to sign in again. On sign-out, both cookies are cleared immediately (their `maxAge` is set to 0).

2.2. **Security attributes explained:**

- **`httpOnly`** — the cookies are invisible to JavaScript in the browser, which protects your tokens from cross-site scripting (XSS) attacks.
- **`Secure`** — the cookies are only sent over HTTPS in production.
- **`SameSite=Strict`** — the cookies are not sent on cross-site requests, which protects against cross-site request forgery (CSRF).
- **Short access-token lifetime** — even if an access token leaked, it would expire within 15 minutes; the refresh token is scoped so tightly (path `/api/auth`) that it is only ever sent to the refresh and sign-out endpoints.

2.3. Neither cookie contains personal data beyond what is needed for authentication (for example, your user identifier, email, role, plan, and token expiry). We do not embed tracking identifiers in authentication cookies.

### 2.4. Session lifecycle walkthrough

A typical authenticated session looks like this:

1. **You sign in** with your email/password or Google OAuth.
2. The server sets `access_token` (15 min) and `refresh_token` (30 days) as httpOnly cookies.
3. For the next 15 minutes, every dashboard and API request is authenticated by `access_token`.
4. When the access token expires, the client silently calls the refresh endpoint. Because `refresh_token` is scoped to path `/api/auth`, it is sent only to that endpoint, which verifies it and sets a fresh `access_token`.
5. This rotation continues for up to 30 days, as long as you keep using the Service.
6. **You sign out** — both cookies are cleared immediately (max-age set to 0), and the refresh token is invalidated server-side.
7. If you do not use the Service for 30 days, the refresh token expires and you are asked to sign in again.

This design means a stolen access token is useful for at most minutes, while the long-lived token is never exposed to JavaScript and is only ever transmitted to the refresh/sign-out endpoints.

## 3. Theme Preference (Local Storage)

3.1. Your light/dark/system theme preference is stored in your browser's **local storage** under the key **`acquisitionos-theme`** (for example, values `light`, `dark`, or `system`). This is not a cookie, but we document it here because it performs a similar preference function.

| Item | Purpose | Storage | Duration |
|---|---|---|---|
| `acquisitionos-theme` | Remembers your light/dark theme choice (with system-preference detection) | `localStorage` | Persistent until you clear browser data |

3.2. This item contains no personal data and is never transmitted to our servers. Clearing your browser's site data resets the theme to the default (light, with system detection).

## 4. Consent Cookies

4.1. When you first visit, our cookie consent banner lets you accept all cookies, accept only essential cookies, or manage preferences. Your choice is stored in first-party cookies so we do not ask you again on every visit:

| Cookie | Purpose | Duration | Category |
|---|---|---|---|
| `acquisitionos_consent` | Stores your overall cookie consent decision (accepted / essential only) | **1 year** | Strictly necessary |
| `acquisitionos_prefs` | Stores your detailed per-category cookie preference choices | **1 year** | Strictly necessary |

4.2. These cookies are set only in response to your interaction with the banner and contain only your consent choices — no personal data. You can change your decision at any time via the consent banner (re-openable from settings) or by clearing your cookies, which causes the banner to appear again.

### 4.3. Consent states explained

| Your choice | Essential cookies | Analytics cookies | Effect |
|---|---|---|---|
| **Accept all** | Set | Set | Full functionality plus usage analytics |
| **Essential only** | Set | Not set | Full functionality; no analytics measurement |
| **No choice made** | Set (on sign-in/visit) | Not set | The banner reappears on your next visit |

## 5. Analytics Cookies

5.1. If — and only if — you consent to analytics cookies, we may set first-party/product analytics cookies to understand how visitors use the Service (which pages are visited, how long, and which features are used) so we can improve it:

| Cookie | Purpose | Duration |
|---|---|---|
| `_ga` | Google Analytics — distinguishes unique visitors | 2 years |
| `_ga_*` | Google Analytics — maintains session state | 2 years |
| `aos_analytics` | Platform usage analytics (internal, first-party) | 90 days |

5.2. Analytics cookies are **never set** if you reject non-essential cookies, and you can withdraw consent at any time (see Sections 4 and 8). If we have not enabled a third-party analytics provider for your region or session, only `aos_analytics` (if any) is set.

5.3. **Open/click tracking in outreach.** Engagement tracking (opens and clicks) that applies to the outreach campaigns **you send to your leads** is a product feature governed by the [Privacy Policy](PRIVACY-POLICY.md) and your own legal obligations toward recipients — it is not the same as the analytics cookies on our own site, and it is not used to profile you.

## 6. Third-Party Cookies

6.1. Some pages involve third-party services that may set their own cookies when you interact with them. We do not control these cookies; they are governed by the respective provider's policies:

- **Stripe (payments).** When you open a Stripe checkout or payment element, Stripe may set fraud-prevention and risk-assessment cookies, such as `__stripe_mid` (persistent, roughly 1 year) and `__stripe_sid` (short-lived, roughly 30 minutes). These help Stripe detect fraudulent payments and secure checkout.
- **Razorpay (payments, India).** Razorpay may set cookies or local identifiers during checkout for fraud detection, payment security, and session integrity.
- **Google OAuth (sign-in).** If you sign in with Google, Google may set cookies on its accounts pages during the OAuth consent flow for authentication and security purposes. These are managed by Google and subject to Google's privacy policy.

6.2. These cookies are typically set only on the payment or sign-in screens that embed the third party's interface, not across the whole Service. Blocking third-party cookies in your browser generally does not affect the rest of the Service, though it may affect the embedded checkout or OAuth consent experience.

6.3. **Why payment fraud cookies exist.** Payment processors use device and session identifiers to distinguish a legitimate cardholder making a routine purchase from a fraudster testing stolen cards. Blocking these cookies may cause additional verification steps (such as 3-D Secure challenges) during checkout. These providers act as independent controllers of their own cookies; for details see Stripe's and Razorpay's cookie and privacy notices.

## 7. Duration Summary

| Name | Category | Storage Type | Duration |
|---|---|---|---|
| `access_token` | Strictly necessary (authentication) | Cookie (`httpOnly`, path `/`) | 15 minutes |
| `refresh_token` | Strictly necessary (authentication) | Cookie (`httpOnly`, path `/api/auth`) | 30 days |
| `acquisitionos_consent` | Strictly necessary (consent) | Cookie | 1 year |
| `acquisitionos_prefs` | Strictly necessary (consent preferences) | Cookie | 1 year |
| `acquisitionos-theme` | Preference | Local storage | Persistent until cleared |
| `_ga` | Analytics (consent required) | Cookie | 2 years |
| `_ga_*` | Analytics (consent required) | Cookie | 2 years |
| `aos_analytics` | Analytics (consent required) | Cookie | 90 days |
| `__stripe_mid` / `__stripe_sid` | Third-party (payments, fraud prevention) | Cookie (Stripe) | ~1 year / ~30 minutes |
| Razorpay session/fraud identifiers | Third-party (payments, fraud prevention) | Cookie/local storage (Razorpay) | Session to short-lived (per Razorpay) |
| Google OAuth cookies | Third-party (sign-in security) | Cookie (Google) | Per Google's policy |

## 8. How to Control Cookies

### 8.1. Browser settings

Most browsers let you:

- View and delete existing cookies and site data.
- Block cookies from all sites or from specific sites.
- Block third-party cookies while allowing first-party cookies.
- Clear local storage and site data.
- Receive a warning before a cookie is stored.

References for major browsers: Chrome, Firefox, Safari, and Edge all document cookie and site-data controls in their help centers. Instructions vary by version, so consult your browser's documentation.

### 8.2. In the Service

- **Cookie banner.** You can re-open the consent banner from your settings to change your consent choices at any time.
- **Sign out.** Signing out clears both `access_token` and `refresh_token` immediately.
- **Theme.** Changing your theme in Settings updates `acquisitionos-theme` in local storage; clearing site data resets it.
- **Analytics opt-out.** Declining analytics consent prevents analytics cookies from being set; you can also use Google's official Analytics opt-out browser add-on if `_ga` cookies are present.

### 8.4. Where to find the controls

| Browser | Where to look |
|---|---|
| Chrome | Settings → Privacy and security → Third-party cookies; Site settings → View permissions and data stored across sites |
| Firefox | Settings → Privacy & Security → Cookies and Site Data; "Manage Data" to inspect per-site storage |
| Safari (macOS/iOS) | Settings/Preferences → Privacy → Manage Website Data |
| Edge | Settings → Cookies and site permissions → Manage and delete cookies and site data |

### 8.5. Clearing everything

Clearing all site data for the Service removes all cookies and local storage items listed above. The next visit behaves like a first visit: the consent banner reappears, and you must sign in again.

## 9. What Breaks When You Block Essential Cookies

Because the Service depends on its authentication cookies, blocking them has visible effects:

| If you block... | What happens |
|---|---|
| **All cookies** | You cannot sign in or stay signed in. Sign-in appears to succeed but every subsequent request is unauthenticated — you are bounced back to the login screen in a loop. The dashboard and API return 401 errors. |
| **`access_token` only** | You can technically start a session, but every page and API call fails authentication; you are redirected to sign-in repeatedly. |
| **`refresh_token` only** | You can sign in and use the Service for up to 15 minutes, after which the access token expires and cannot be renewed — you are signed out and returned to the login screen. |
| **All cookies + local storage** | The above, plus your theme resets to default and the consent banner reappears on every visit. |
| **Third-party cookies only** | The core Service continues to work normally. The Stripe/Razorpay checkout and Google OAuth consent flow may show extra verification steps or, in rare cases, fail — in which case complete the payment/sign-in in a window that allows those cookies. |
| **`acquisitionos_consent`** | The consent banner reappears on each visit because your stored choice is gone (this is intentional, so your preference is honored). |

9.1. In short: **first-party authentication cookies are required to use the Service**; everything else is optional.

## 10. Do Not Track

10.1. Some browsers offer a "Do Not Track" (DNT) signal. There is currently no industry consensus on how websites should interpret DNT, and we do not change our behavior based on the DNT header.

10.2. This does not mean we track you aggressively: we set no advertising cookies, we do not use cookies for cross-site tracking, and analytics cookies (if any) are set only with your consent and only on our own properties. You can opt out of analytics directly via the consent banner regardless of DNT.

10.3. If a binding standard for DNT or Global Privacy Control is adopted in a jurisdiction where we operate, we will review and update this section accordingly.

10.4. **Choosing not to be measured.** Declining analytics consent is the most effective "do not track me" control on our site: it prevents analytics cookies from being set at all, independent of any browser signal.

## 11. Legacy Cookie Names

11.1. Earlier versions of our in-app Cookie Policy referred to legacy cookie names (`acquisitionos_token`, `acquisitionos_refresh`, a 7-day session token, and `next-auth.session-token` placeholders). **The current authentication cookies are `access_token` (15 minutes) and `refresh_token` (30 days, path `/api/auth`)** as documented in Section 2, reflecting the current authentication implementation. If you observe differently named cookies, they may be cached documentation artifacts or set by a legacy deployment; contact us if unsure.

## 12. Changes to This Policy

12.1. We may update this Cookie Policy to reflect changes in the cookies we use or for other operational, legal, or regulatory reasons. We will notify you of material changes by:

- Posting the updated policy with a new "Last updated" date.
- Re-showing the cookie consent banner where new consent-requiring categories are introduced.
- Sending an email notification for significant changes.

12.2. What counts as a **material change**: adding a new cookie category (for example, advertising), changing the purpose of an existing cookie, or changing how long cookies persist. Minor corrections, formatting, and clarifications are posted without a banner re-prompt.

12.3. Your continued use of the Service after the effective date of any changes constitutes acceptance of the updated policy.

## 13. Contact

If you have questions about this Cookie Policy or our use of cookies:

- **Email:** legal@acquisitionos.com
- **Privacy requests:** privacy@acquisitionos.com · dpo@acquisitionos.com
- **Operator:** QuantumFusion Solutions · acquisitionos.com · https://acquisition.space-z.ai

## 14. Frequently Asked Questions

**Do you use cookies to show me ads?** No. We set no advertising or retargeting cookies, and we do not sell data collected through cookies.

**Why do I stay signed in even after closing my browser?** The `refresh_token` cookie persists for up to 30 days so returning to the Service does not require signing in again. Sign out to end the session immediately.

**Why am I signed out after exactly 30 days of not using the Service?** The refresh token's 30-day lifetime expired. This is a deliberate security measure — long-dormant sessions are invalidated.

**Is the theme setting a cookie?** No. It is stored in your browser's local storage under `acquisitionos-theme` and never leaves your device.

**Do you track me on other websites?** No. Our cookies are set only on our own properties, and `SameSite=Strict` prevents them from being sent anywhere else.

**Can I use the Service in private/incognito mode?** Yes. Cookies work normally during the session but are wiped when you close the window, so you will need to sign in again next time.

**I'm seeing a cookie not listed here. What is it?** Third parties (Stripe, Razorpay, Google) set their own cookies on their embedded screens, and their names change from time to time. See Section 6. If you spot a first-party cookie that is not listed here, email legal@acquisitionos.com and we will update this policy.

**Does the consent banner respect my region?** Where required by law (for example, in the EEA/UK), the banner requires an affirmative choice before any non-essential cookies are set. Elsewhere it is still shown so you can make an informed choice.

**Who do I contact about cookies?** legal@acquisitionos.com for policy questions; dpo@acquisitionos.com for data protection questions (see Section 13).

---

*Related documents: [Privacy Policy](PRIVACY-POLICY.md) · [Terms of Service](TERMS-OF-SERVICE.md) · [Refund Policy](REFUND-POLICY.md) · [Acceptable Use Policy](ACCEPTABLE-USE-POLICY.md) · [Service Level Agreement](SLA.md)*

*In-app version: `/legal/cookies`*
