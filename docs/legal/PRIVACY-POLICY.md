# Privacy Policy — AcquisitionOS

> **Last updated:** 2026-09-09
> **Data Controller:** QuantumFusion Solutions ("QuantumFusion," "we," "us," "our") — operator of AcquisitionOS
> **Service:** https://acquisition.space-z.ai (also referred to as "AcquisitionOS" or the "Service")
> **Contact:** legal@acquisitionos.com · **Data Protection Officer (DPO):** dpo@acquisitionos.com · **Privacy rights (India):** privacy@acquisitionos.com

> **Note:** This document is the canonical Privacy Policy. A user-facing version renders inside the application at **`/legal/privacy`**, together with related pages at `/legal/gdpr` (Data Processing Agreement), `/legal/data-retention` (Data Retention Policy), and `/legal/cookies` (Cookie Policy). Where the versions differ, this document governs until the in-app pages are updated.

---

## Table of Contents

1. [Who We Are](#1-who-we-are)
2. [Scope of This Policy](#2-scope-of-this-policy)
3. [Information We Collect](#3-information-we-collect)
4. [Purposes and Legal Bases for Processing](#4-purposes-and-legal-bases-for-processing)
5. [AI Processing](#5-ai-processing)
6. [Third-Party Processors](#6-third-party-processors)
7. [Data Retention](#7-data-retention)
8. [Your Rights — GDPR](#8-your-rights--gdpr)
9. [Your Rights — India DPDP Act, 2023](#9-your-rights--india-dpdp-act-2023)
10. [How to Exercise Your Rights](#10-how-to-exercise-your-rights)
11. [International Data Transfers](#11-international-data-transfers)
12. [Children's Privacy](#12-childrens-privacy)
13. [Security Measures](#13-security-measures)
14. [Data Breach Notification](#14-data-breach-notification)
15. [Cookies and Tracking Technologies](#15-cookies-and-tracking-technologies)
16. [Changes to This Policy](#16-changes-to-this-policy)
17. [Contact](#17-contact)

---

## 1. Who We Are

1.1. **QuantumFusion Solutions** operates AcquisitionOS, an AI-powered B2B client acquisition platform (lead discovery, AI outreach, pipeline management, meetings). We are the **Data Controller** under the EU/UK General Data Protection Regulation (GDPR) and the **Data Fiduciary** under India's Digital Personal Data Protection Act, 2023 (DPDP Act) for the personal data described in this policy.

1.2. Where you process personal data about your own leads and contacts using the Service, **you are generally the controller of that Lead Data and we act as a processor acting on your instructions**. Section 9 (Lead Data) explains how this works in practice.

1.3. You can reach our Data Protection Officer at **dpo@acquisitionos.com** for any privacy-related inquiry.

## 2. Scope of This Policy

2.1. This policy applies to all users of the Service, regardless of subscription tier (Free, Pro, or Elite), and to visitors of our public web properties.

2.2. This policy has been designed to comply with the **GDPR** (EU/EEA), the **Digital Personal Data Protection Act, 2023** (India), and, as a matter of good practice, similar frameworks such as the California Consumer Privacy Act (CCPA).

## 3. Information We Collect

### 3.1 Account data

Collected when you register (by email/password or Google OAuth) and use your account:

- Name, email address, phone number (optional), company name, country, and timezone.
- Profile and business configuration: industry, niche, target market, ideal customer profile, business size.
- Authentication data: password (stored only as a bcrypt hash), OAuth identifiers, multi-factor secrets, session records.
- Plan, credit balance, notification preferences, and API keys you create (keys are stored hashed).

### 3.2 Lead data

Information about prospective business contacts that you input, import, or discover through the Service:

- Business names, contact details (email, phone, address), website, and company information.
- Enrichment data, AI-generated lead scores, and analysis results.
- Pipeline stages, notes, tags, and deal records.

### 3.3 Email content and outreach data

- Outreach messages, templates, sequences, and communication content you create or send through the Service.
- Delivery status, open/click engagement metrics, reply classification, and unsubscribe records.
- If you connect **Gmail**: email metadata and message content needed for outreach campaigns and reply tracking. We only access Gmail for the scopes you explicitly authorize, and you can disconnect at any time.

### 3.4 Calendar metadata and meetings

- If you connect **Google Calendar**: availability data, event metadata, and meeting details (title, time, attendees, agenda) needed for scheduling.
- Meeting records created through the Service, including AI-assisted meeting preparation content.

### 3.5 Payment data

- Billing name, address, tax identifiers (such as GSTIN), and transaction history.
- Payment method details are processed by Stripe/Razorpay; we retain only the **last 4 digits, card brand, and billing address** for receipts and record-keeping. We do not store full card numbers on our servers.
- Coupon redemptions, credit purchase and usage history.

### 3.6 Usage and analytics data

- Features accessed, pages viewed, actions taken, time spent, click patterns, and navigation paths.
- Device information (device type, operating system, browser type and version), IP address, and approximate geographic location.
- Log data (access timestamps, referrer URLs, server request logs), API request metadata (endpoint, method, response code, latency), and search queries within the platform.
- Crash reports and error logs (with PII redacted after 30 days in API error logs).

### 3.7 Cookies and local storage

We use strictly necessary cookies for authentication, consent cookies, and (subject to your consent) analytics cookies, plus local storage for preferences such as your theme. Full details, including exact cookie names and durations, are in the [Cookie Policy](COOKIE-POLICY.md) and at `/legal/cookies`.

### 3.8 Data from third-party services

When you connect or authorize third-party services, we receive:

- **Google OAuth:** email, name, and profile picture for sign-in.
- **Gmail:** email metadata/content for outreach campaigns (as described in 3.3).
- **Google Calendar:** availability and event metadata (as described in 3.4).
- **Telegram:** chat ID and username when you connect Telegram for notifications.
- **WhatsApp / Twilio:** phone number and messaging metadata when you use WhatsApp Business messaging.
- **Stripe / Razorpay:** payment method details (last 4 digits, card brand), billing address, and transaction status.

### 3.9 What we do not do

- We do not sell your personal data or your Lead Data.
- We do not use your Content or Lead Data to train AI models for the benefit of other users without explicit consent.
- We do not knowingly collect data from children (see Section 12).

## 4. Purposes and Legal Bases for Processing

Under Article 6 of the GDPR, we process personal data only where we have a lawful basis. Under the DPDP Act, we process personal data based on your consent or for legitimate uses. The table below summarizes the main purposes:

| Purpose | Data Used | Legal Basis (GDPR) | Legal Basis (DPDP) |
|---|---|---|---|
| Account creation, authentication, and account management | Account data, authentication data | Contract (Art. 6(1)(b)) | Consent / Legitimate uses |
| Providing AI features (lead discovery, scoring, outreach generation, coaching) | Lead data, prompts, business configuration | Contract (Art. 6(1)(b)) | Consent |
| Sending your outreach campaigns and tracking performance | Email content, lead data, integration data | Contract (Art. 6(1)(b)) | Consent |
| Billing, payments, invoicing, GST compliance | Payment data, billing records | Contract (6(1)(b)) + Legal obligation (6(1)(c)) | Legal obligation |
| Notifications (email, Telegram) and transactional messaging | Contact details, integration identifiers | Contract (Art. 6(1)(b)) | Consent |
| Marketing communications (product updates, offers) | Email address | Consent (Art. 6(1)(a)) | Consent |
| Platform analytics and service improvement | Usage data, device data | Legitimate interests (Art. 6(1)(f)) | Legitimate uses |
| Fraud prevention, security monitoring, rate limiting, abuse detection | IP address, device data, session and login history | Legitimate interests (Art. 6(1)(f)) | Legitimate uses |
| Non-essential / analytics cookies | Device and usage data | Consent (Art. 6(1)(a)) | Consent |
| Tax and financial record-keeping | Billing records | Legal obligation (Art. 6(1)(c)) | Legal obligation |
| Responding to support requests | Communications, account data | Contract (Art. 6(1)(b)) | Consent |

4.1. **Withdrawal of consent.** Where processing is based on consent (for example, marketing emails or optional integrations), you may withdraw consent at any time without affecting the lawfulness of prior processing.

## 5. AI Processing

5.1. AcquisitionOS uses artificial intelligence and machine learning for lead discovery and enrichment, lead scoring, outreach message generation, sales coaching, competitive analysis, predictive insights, and meeting assistance.

5.2. **AI providers.** AI processing is performed primarily by our AI provider **Z-AI** and, where configured in our provider chain, by other providers such as OpenAI and Anthropic. These providers act under data processing agreements and are contractually obligated to process data solely for our specified purposes.

5.3. **No model training on your data.** These providers must not retain or use your data for their own model training unless you have explicitly consented. AI training data used internally for quality evaluation is anonymized within 30 days of collection and is never stored with personally identifiable information.

5.4. **Human oversight.** AI features are advisory and assistive — they do not replace your decision-making. We maintain human oversight of AI systems, including periodic review of outputs for quality and bias. We do not make decisions based solely on automated processing that produce legal effects or similarly significantly affect you (GDPR Art. 22). You can review, modify, or override any AI-generated suggestion. See the in-app AI Disclaimer at `/legal/ai-disclaimer`.

## 6. Third-Party Processors

We share personal data with the following categories of processors, bound by data processing agreements:

| Processor | Purpose | Typical Data Shared |
|---|---|---|
| **Google LLC** | OAuth 2.0 sign-in; Gmail integration; Google Calendar integration | Email, name, profile picture; email metadata; calendar availability and event metadata |
| **Stripe, Inc.** | Payment processing (global) — PCI DSS Level 1 | Tokenized payment details, billing address, transaction status |
| **Razorpay Software Private Ltd.** | Payment processing (India: cards, UPI, net banking, wallets) — PCI DSS Level 1 | Tokenized payment details, billing address, transaction status |
| **Z-AI** | Primary AI provider — lead analysis, scoring, outreach generation, chat | Lead data and prompts submitted for AI analysis |
| **OpenAI / Anthropic (as configured)** | Fallback AI providers in our provider chain | Lead data and prompts submitted for AI analysis |
| **SMTP / email delivery provider** | Transactional and campaign email delivery (e.g., verification, receipts, outreach) | Recipient address, message content, delivery metadata |
| **Telegram Messenger Inc.** | Notification delivery via Telegram Bot API | Chat ID, username, notification content |
| **Twilio / Meta (WhatsApp Business API)** | WhatsApp Business messaging | Phone number, message content, delivery status |
| **Cloud hosting providers** (e.g., AWS, Vercel) | Application and database hosting | Data stored in the Service |
| **Analytics providers** (e.g., PostHog, Mixpanel) — where enabled | Product analytics | Aggregated usage events |

6.1. We disclose personal data to third parties only as described above, with your consent, to comply with law, or to protect our rights. We may also disclose data in connection with a merger, acquisition, or asset sale, subject to this policy continuing to apply.

6.2. A current list of sub-processors is available on request by contacting **dpo@acquisitionos.com**.

## 7. Data Retention

We retain personal data only as long as necessary for the purposes described in this policy:

| Data Category | Retention |
|---|---|
| Account data (profile, credentials) | While your account is active + 30 days after deletion (recovery window) |
| Lead & pipeline data | While your account is active + 30 days after deletion |
| Outreach campaign records and message content | While your account is active + 30 days after deletion |
| Lead scores and AI analysis results | 12 months, then deleted |
| Delivery/open/click tracking data | 12 months, then deleted |
| Billing records, transaction receipts, credit history | 7 years (tax and financial regulations) |
| Usage and API logs | 12 months, then anonymized or deleted (API error logs: PII redacted after 30 days) |
| Security audit logs | 24 months |
| Login history | 12 months |
| Support tickets | 3 years from resolution |
| Communication records (Telegram, WhatsApp, email metadata) | Duration of account + 30 days |
| Backups | Daily 14 days; weekly 90 days; monthly 12 months (rotating; deleted data is removed from subsequent backups) |
| Unsubscribe / suppression lists | Kept to honor opt-outs (minimal data: email address and timestamp) |

7.1. When you delete your account, personal data is permanently purged within 30 days; billing records are retained for 7 years as required by law. Data in existing backups persists only until the backup rotation completes.

7.2. We may suspend deletion where a legal hold applies (valid legal request, litigation, regulatory audit, or fraud/security investigation).

7.3. Full details are in the in-app Data Retention Policy at `/legal/data-retention`.

## 8. Your Rights — GDPR

If you are located in the EEA, the United Kingdom, or Switzerland, you have the following rights under the GDPR:

- **Right of Access (Art. 15):** request a copy of the personal data we hold about you. You can export your data from Settings → Data & Privacy, or contact us. We respond within 30 days.
- **Right to Rectification (Art. 16):** request correction of inaccurate or incomplete data. Most profile data can be updated directly in the platform.
- **Right to Erasure (Art. 17):** request deletion of your personal data, subject to legal retention requirements (for example, billing records retained for 7 years). Navigate to Settings → Data & Privacy → Delete Account, or contact us. Personal data is purged within 30 days of deletion.
- **Right to Restrict Processing (Art. 18):** request restriction while accuracy is contested, processing is unlawful but you prefer restriction over erasure, or we no longer need the data but you require it for legal claims.
- **Right to Data Portability (Art. 20):** receive your data in a structured, machine-readable format (JSON or CSV) via the export feature or on request.
- **Right to Object (Art. 21):** object to processing based on legitimate interests (e.g., analytics); you can opt out of marketing emails at any time.
- **Automated decision-making (Art. 22):** you have the right not to be subject to decisions based solely on automated processing that produce legal or similarly significant effects. Our AI features are advisory; you can always review, modify, or override them.
- **Right to lodge a complaint** with your local data protection supervisory authority.

## 9. Your Rights — India DPDP Act, 2023

If you are located in India, as a Data Principal under the DPDP Act you have:

- **Right to Access:** obtain a summary of the personal data we hold about you and the processing activities carried out.
- **Right to Correction and Erasure:** request correction of inaccurate or incomplete data, and erasure of data that is no longer necessary for the purpose for which it was collected, subject to legal retention requirements.
- **Right to Grievance Redressal:** raise a grievance with us (Section 10) and, if unresolved, approach the **Data Protection Board of India**.
- **Right to Nominate:** nominate another individual to exercise your rights in the event of your death or incapacity.

9.1. **Consent and notice.** Where we rely on consent under the DPDP Act, we provide itemized notice of the personal data collected and the purpose of processing. You may withdraw consent at any time; withdrawal may affect our ability to provide features that depend on that data.

9.2. **Grievance Officer.** In accordance with the DPDP Act and the IT Act rules, we have designated a Grievance Officer / Data Protection Officer: **dpo@acquisitionos.com**. We acknowledge grievances within 3 business days and aim to resolve them within 30 days.

## 10. How to Exercise Your Rights

You may exercise any of the above rights by:

- Using the in-app controls: **Settings → Data & Privacy** (data export and account deletion) and **Settings → Notifications** (email preferences).
- Emailing **legal@acquisitionos.com** or **privacy@acquisitionos.com** with your request and account verification details.
- Contacting our Data Protection Officer directly at **dpo@acquisitionos.com**.

10.1. We will verify your identity before processing your request and respond within **30 days** (extendable where permitted). Requests are free of charge; we may charge a reasonable fee for manifestly unfounded or excessive requests, as permitted by law.

10.2. If you believe your rights have been violated, you may lodge a complaint with your local supervisory authority or, in India, with the Data Protection Board of India.

## 11. International Data Transfers

11.1. QuantumFusion Solutions is headquartered in India. Your data may be transferred to and processed in India and in other jurisdictions where our service providers operate (for example, the United States for Stripe and AI providers).

11.2. For transfers of personal data out of the EEA/UK, we ensure adequate protection through:

- **Standard Contractual Clauses (SCCs)** adopted by the European Commission (Decision 2021/914) for transfers to countries without an adequacy decision.
- **Data Processing Agreements** with all sub-processors (including Z-AI, OpenAI, Anthropic, Stripe, Razorpay) with GDPR-compliant terms.
- **Adequacy decisions** where applicable.
- **Supplementary technical and organizational measures** to ensure data protection equivalent to the GDPR.

11.3. A list of sub-processors and their locations is available on request from **dpo@acquisitionos.com**.

## 12. Children's Privacy

The Service is a B2B platform intended for businesses and professionals. It is **not intended for individuals under the age of 18**, consistent with our Terms of Service. We do not knowingly collect personal data from children. If we become aware that we have collected personal data from a person under 18, we will take steps to delete that information promptly. If you believe a child has provided us personal information, contact us at **legal@acquisitionos.com**.

## 13. Security Measures

We implement industry-standard security measures, including:

- **Encryption in transit** using TLS 1.2+ (HTTPS) for all traffic, including API and SMTP connections.
- **Encryption at rest** using AES-256 for sensitive data stores.
- **Credential protection:** passwords hashed with bcrypt; API keys stored hashed and scoped; OAuth tokens encrypted at rest.
- **Session security:** httpOnly, Secure, SameSite=Strict authentication cookies; short-lived access tokens with rotating refresh tokens (see the [Cookie Policy](COOKIE-POLICY.md)).
- **Access controls** and authentication requirements for internal systems; admin access is logged.
- **Rate limiting, login attempt lockouts, and abuse monitoring** to protect accounts and infrastructure.
- **Regular security audits and vulnerability assessments.**
- **Encrypted backups** with strictly controlled access, used only for disaster recovery.
- **Incident response and breach notification procedures** (Section 14).

13.1. No method of transmission or storage is 100% secure. We cannot guarantee absolute security, but we take our obligations seriously and continuously improve our safeguards.

## 14. Data Breach Notification

In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:

- Notify the relevant supervisory authority within **72 hours** of becoming aware of the breach (GDPR Art. 33), where required.
- Notify affected users **without undue delay** where the breach is likely to result in a high risk to their rights and freedoms (GDPR Art. 34), and as required under the DPDP Act.
- Provide information about the nature of the breach, the data affected, likely consequences, and remedial measures taken.
- Document all breaches, including facts, effects, and remedial actions taken.

## 15. Cookies and Tracking Technologies

We use cookies, web beacons, pixel tags, local storage, and similar technologies to operate the Service, remember preferences, and (subject to your consent) measure usage. Authentication cookies (`access_token` and `refresh_token`) are strictly necessary, httpOnly, Secure, and SameSite=Strict; your theme preference is stored in `acquisitionos-theme` in local storage. For the complete inventory — names, purposes, durations, and how to control them — see the [Cookie Policy](COOKIE-POLICY.md) or the in-app page at `/legal/cookies`.

## 16. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by:

- Posting the updated policy with a new "Last updated" date.
- Sending an email notification to registered users for significant changes.
- Displaying an in-app notification for changes that affect data processing practices.

Your continued use of the Service after the effective date of any changes constitutes acceptance of the updated policy. Where required, we will re-request consent (for example, for new cookie categories).

## 17. Contact

- **General privacy inquiries / requests:** legal@acquisitionos.com · privacy@acquisitionos.com
- **Data Protection Officer (EU/GDPR):** dpo@acquisitionos.com
- **Grievance Officer (India/DPDP):** dpo@acquisitionos.com
- **Operator:** QuantumFusion Solutions · acquisitionos.com · https://acquisition.space-z.ai

---

*Related documents: [Terms of Service](TERMS-OF-SERVICE.md) · [Cookie Policy](COOKIE-POLICY.md) · [Refund Policy](REFUND-POLICY.md) · [Acceptable Use Policy](ACCEPTABLE-USE-POLICY.md) · [Service Level Agreement](SLA.md)*

*In-app versions: `/legal/privacy` · `/legal/gdpr` · `/legal/data-retention` · `/legal/ai-disclaimer` · `/legal/cookies`*
