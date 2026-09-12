# Acceptable Use Policy — AcquisitionOS

> **Last updated:** 2026-09-09
> **Operator:** QuantumFusion Solutions
> **Product:** AcquisitionOS — AI-powered B2B client acquisition platform · https://acquisition.space-z.ai
> **Contact:** support@acquisitionos.com (reports) · legal@acquisitionos.com (appeals)

> **Note:** The user-facing version of this document renders inside the application alongside our other legal pages. This Markdown is the canonical source. This Acceptable Use Policy ("AUP") supplements and forms part of the [Terms of Service](TERMS-OF-SERVICE.md); capitalised terms have the meanings given there.

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Permitted Use](#2-permitted-use)
3. [Consent and Anti-Spam Requirements](#3-consent-and-anti-spam-requirements)
4. [Prohibited Uses](#4-prohibited-uses)
5. [Rate Limits and Fair Use](#5-rate-limits-and-fair-use)
6. [Detection and Monitoring](#6-detection-and-monitoring)
7. [Consequences of Violations](#7-consequences-of-violations)
8. [Appeal Process](#8-appeal-process)
9. [Reporting Violations and Security Issues](#9-reporting-violations-and-security-issues)
10. [Changes to This Policy](#10-changes-to-this-policy)
11. [Contact](#11-contact)

---

## 1. Purpose and Scope

1.1. AcquisitionOS is a tool for legitimate B2B client acquisition. Because the Service can send real messages to real people, misuse can cause real harm — to recipients, to other customers' deliverability, and to the wider email ecosystem. This AUP sets out what you may and may not do with the Service.

1.2. This AUP applies to every user of the Service (Free, Pro, and Elite), to all use of the API, and to all content and communications sent through or generated with the Service. Violations of this AUP are violations of the [Terms of Service](TERMS-OF-SERVICE.md) and may result in the consequences in Section 7.

## 2. Permitted Use

You may use AcquisitionOS for lawful B2B prospecting and sales activities, including:

- Discovering and enriching prospective business leads based on your ideal customer profile.
- Scoring and qualifying leads with AI.
- Generating, personalizing, and sending outreach email and messages **in compliance with applicable law and this AUP**.
- Classifying replies, scheduling meetings, and managing your pipeline.
- Analyzing campaign performance and market data.

2.1. **Quick reference — dos and don'ts:**

| ✅ Do | ❌ Don't |
|---|---|
| Contact business prospects you can lawfully contact, with an honest identity and purpose | Blast purchased, rented, or scraped lists you cannot vouch for |
| Include a working unsubscribe link and a real postal address (CAN-SPAM) | Remove or hide unsubscribe links, headers, or sender identity |
| Honor opt-outs and replies immediately | Re-add suppressed contacts or evade opt-outs via other accounts/channels |
| Verify email addresses and warm up sending domains gradually | Send large volumes from a fresh domain or to unverified addresses |
| Keep API keys secret and implement backoff on HTTP 429 | Publish keys, share accounts, or hammer endpoints past your plan's limits |
| Use AI outputs as a starting point and review before sending | Auto-send unreviewed AI content to people you may not lawfully contact |

## 3. Consent and Anti-Spam Requirements

### 3.1 Consent comes first

You must not send unsolicited bulk email ("spam"). Before contacting a person through the Service, you must have a **lawful basis** to contact them — typically their consent, or a valid basis for B2B prospecting recognized in their jurisdiction. You are responsible for making this determination for every recipient.

### 3.2 Applicable laws you must comply with

| Regime | Applies to | Key obligations |
|---|---|---|
| **CAN-SPAM Act** (USA) | Commercial email to/from US recipients | Accurate header and "From" information; non-deceptive subject lines; identify the message as an ad where applicable; include your valid **physical postal address**; honor opt-outs within **10 business days** |
| **GDPR + ePrivacy Directive** (EU/EEA) | Personal data of individuals in the EU/EEA; electronic marketing | A lawful basis (consent, or legitimate interests where permitted for B2B under local law); clear sender identification; easy opt-out; honor objections |
| **IT Act, 2000 + DPDP Act, 2023 + TRAI regulations** (India) | Recipients in India; commercial communications | Lawful processing of personal data; consent where required; comply with TRAI rules on commercial communications (e.g., DND preferences for telecom channels) |
| **CASL** (Canada) | Commercial electronic messages to Canada | Consent (express or implied), sender identification, unsubscribe mechanism |

This list is not exhaustive. Other jurisdictions may impose additional requirements on your outreach.

### 3.3 Unsubscribe and suppression

- The Service maintains unsubscribe/suppression records. You must **not bypass, override, or circumvent** them, including by re-adding suppressed contacts, sending from alternate accounts, or using another channel to evade an opt-out.
- Every outreach email must include a working unsubscribe or opt-out mechanism, and you must honor opt-out requests promptly (no later than 10 business days for CAN-SPAM, and sooner where local law requires).

### 3.4 Identification and honesty

You must not misrepresent your identity, your company, or the purpose of your messages. "From" names, reply-to addresses, and domains must be genuine and controlled by you. You must not impersonate any person or organization.

### 3.5 Practical list hygiene and sending standards

To stay compliant in practice:

- **Know your source.** For every lead you contact, be able to state where the contact data came from and why you may lawfully reach out (consent record, public business listing consistent with local B2B rules, prior business relationship, etc.).
- **Verify before sending.** The Service can check deliverability signals; do not knowingly send to role-catch-all, disposable, or previously bounced addresses at scale.
- **Warm up responsibly.** Do not connect a brand-new sending domain and immediately blast large volumes; ramp sending gradually and keep per-inbox volumes within the limits your mailbox providers allow.
- **Personalize honestly.** AI-generated personalization must reflect facts. Do not use AI to fabricate a relationship (for example, "great meeting you at X" when no meeting occurred).
- **Respect frequency.** Repeated daily follow-ups to a non-responding prospect can constitute harassment even when the first message was lawful. Use the Service's sequence limits and stop rules.
- **Honor replies.** A reply of "not interested," "do not contact," or "remove me" is an opt-out. Treat it exactly like an unsubscribe click.

## 4. Prohibited Uses

You agree **not** to use the Service to do any of the following:

### 4.1 Spam and list abuse

1. Send **unsolicited bulk email or messages** without a lawful basis or consent (Section 3).
2. Send to **purchased, rented, or scraped email lists** that you are not permitted to use, or to lists acquired in violation of any website's terms or applicable law.
3. Send to addresses obtained by **harvesting email addresses illegally** (for example, crawling websites to collect personal emails in violation of their terms, privacy notices, or anti-harvesting measures).
4. **Harvest emails illegally** or collect personal data without consent or another lawful basis.
5. Contact leads who have **unsubscribed** or otherwise opted out.
6. Send **deceptive, fraudulent, or misleading** messages, including fake invoices, fake job offers, or phishing.

### 4.2 Legal violations

7. Use the Service in violation of **CAN-SPAM, GDPR, the ePrivacy Directive, India's IT Act / DPDP Act / TRAI regulations, CASL**, or any other applicable law or regulation.
8. Use the Service for **illegal businesses or purposes** — including fraud, scams, deceptive investment schemes, illegal gambling, drugs or controlled substances sales, weapons trafficking, counterfeit goods, human trafficking, or content that is illegal in India, the recipient's jurisdiction, or your jurisdiction.
9. Infringe any third party's **intellectual property rights** (copyright, trademark, patent, trade secret) or **privacy or publicity rights**.

### 4.3 Harassment and discrimination

10. **Harass, abuse, threaten, stalk, defame, or intimidate** any person or organization.
11. Send content that promotes **discrimination, hatred, or violence** based on race, ethnicity, religion, gender, gender identity, sexual orientation, disability, age, nationality, or any other protected characteristic.
12. Send sexually explicit, obscene, or graphically violent content to recipients who have not requested it.
13. Use AI features to generate content that is unlawful, harassing, discriminatory, or harmful.

### 4.4 Scraping and data violations

14. **Scrape websites in violation of the target site's terms of service**, robots directives, or applicable law. Lead discovery must respect the terms and technical controls of source sites.
15. Use the Service to **scrape, crawl, or extract data from the Service itself**, or attempt to extract other customers' data.
16. Import or process personal data that you have **no right to process** under applicable data protection law.

### 4.5 Service integrity and security

17. **Reverse engineer, decompile, or disassemble** the Service, or attempt to derive its source code, models, prompts, or non-public features (except to the extent permitted by applicable law).
18. **Share, publish, sell, or distribute your API keys** or account credentials, or allow unauthorized third parties to use your account.
19. Engage in **load abuse**: hammering endpoints, sustained request volumes far beyond your plan's intended use, stress testing without written permission, or any activity that degrades the Service for others.
20. **Circumvent rate limits**, quotas, the credit system, throttling, security controls, or technical restrictions — including by distributing activity across multiple keys, accounts, or organizations.
21. Create **multiple accounts to abuse free-tier benefits**, trials, or quotas.
22. Attempt to gain **unauthorized access** to the Service, other users' accounts, or our systems; probe or scan for vulnerabilities without authorization; or introduce **malware or harmful code**.
23. Interfere with the Service's monitoring, logging, or abuse-detection systems.
24. **Resell, sublicense, or white-label** the Service without our prior written consent.

### 4.6 AI abuse

25. Attempt to extract the AI system's prompts, configuration, or training data.
26. Use the AI features to bypass the credit system or generate prohibited content categories listed above.

### 4.7 Prohibited business categories (examples)

The Service may not be used by or on behalf of businesses whose primary activity involves, for example: Ponzi/pyramid or fraudulent investment schemes; illegal gambling or betting; unlicensed money transmission or crypto scams; sale of illegal drugs, controlled substances, or prescription medication without authorization; weapons trafficking; counterfeit or pirated goods; stolen data or credential sales; human trafficking or exploitative services; hate groups; or any activity sanctioned or prohibited under applicable Indian, US, EU, or UN sanctions regimes. This list is illustrative, not exhaustive.

## 5. Rate Limits and Fair Use

API rate limits are enforced per plan tier:

| Plan | API Rate Limit |
|---|---|
| Free | 50 requests/hour |
| Pro | 500 requests/hour |
| Elite | 2,000 requests/hour |

5.1. Exceeding a rate limit results in temporary throttling (HTTP 429). You must implement backoff and retry logic in your integrations; repeated deliberate bursts to force failures or to test limits are considered load abuse.

5.2. Lead discovery quotas (for example, 50 leads/month on Free) and credit allocations apply per plan. Attempting to exceed them through automation tricks, multi-accounting, or key sharing is prohibited.

## 6. Detection and Monitoring

To protect recipients, customers, and our infrastructure, we monitor the Service and may investigate suspected violations. Detection methods include:

- **Bounce-rate monitoring:** we track hard/soft bounce rates per account. Sustained hard-bounce rates that are clearly outside healthy sending norms (for example, **above ~5%**) indicate stale or unlawfully sourced lists and will trigger review.
- **Complaint-rate monitoring:** spam complaint rates from mailbox providers and feedback loops. Sustained complaint rates above industry-standard thresholds (for example, **~0.1–0.3%**) will trigger review.
- **Spam-trap and blocklist monitoring:** hits on spam traps or listings on major email blocklists attributable to an account's sending.
- **Unsubscribe and reply signals:** recipients opting out, marking messages as spam, or replying with objections.
- **Automated pattern scanning:** content and sending-pattern checks for phishing-like, deceptive, or prohibited content.
- **Rate and quota analytics:** request volumes, rate-limit violation patterns, and credit consumption anomalies.
- **Manual review:** human review of campaigns, templates, and account activity where automated signals or reports trigger an alert.
- **Third-party reports:** reports from recipients, processors (e.g., Google, email delivery providers), or AI providers.
- **Web-driven signals:** reports from target websites regarding scraping in violation of their terms.

6.1. The thresholds above are indicative and may be adjusted to reflect mailbox provider standards; we will act reasonably and proportionately based on the totality of signals.

6.2. **Signals and what they typically indicate:**

| Signal | What it often indicates |
|---|---|
| Sustained hard bounces above ~5% | Stale, purchased, or unlawfully sourced lists |
| Spam complaints above ~0.1–0.3% | Outreach recipients did not expect or consent to the message |
| Spam-trap hits | Very poor list provenance, often scraped or purchased data |
| Blocklist listings (e.g., major DNSBLs) | Sending practices harming shared reputation |
| Sudden volume spikes from new domains | List-bombing or cold-blast behavior |
| Rate-limit violations across multiple keys | Circumvention or load abuse |
| Recipient replies asking to stop, repeatedly ignored | Harassment or willful opt-out violation |

6.3. **What happens during a review.** We may ask you to explain your list sources and consent records, share sample campaigns, or adjust your sending configuration. Accounts under review retain data integrity; we do not read your message content beyond what is necessary to assess the reported issue, in accordance with our [Privacy Policy](PRIVACY-POLICY.md).

## 7. Consequences of Violations

We enforce this AUP proportionately. Depending on the nature and severity of the violation, we may:

1. **Warn** you, with a description of the issue and required remediation (typically for minor or first-time issues).
2. **Throttle or restrict** sending, API access, or specific features pending remediation.
3. **Suspend** your account, with or without notice, pending investigation — particularly where recipient harm or legal risk is ongoing.
4. **Terminate** your account for severe or repeated violations. Terminated accounts forfeit unused credits and are **not eligible for refunds** (see the [Refund Policy](REFUND-POLICY.md), Exceptions).
5. **Report to authorities**: where we reasonably believe the law has been broken, we may preserve evidence and report the conduct to law enforcement, data protection authorities, or other competent bodies, and may cooperate with their investigations.
6. **Pursue legal remedies**, including injunctive relief and indemnification claims under the [Terms of Service](TERMS-OF-SERVICE.md).

7.1. Where the violation is non-material, we will — where feasible — give you notice and a **cure period of up to 15 days** before termination, consistent with our Terms of Service. For material violations (notably spam, illegal content, or security abuse), we may act immediately.

7.2. We may also take steps necessary to protect recipients, such as adding your sending identifiers to internal suppression lists.

### 7.3 Enforcement matrix (illustrative)

| Violation type | Typical first response | Typical repeat/severe response |
|---|---|---|
| Isolated spam complaint, healthy overall metrics | Warning + guidance | Throttling until metrics recover |
| Sustained high bounce/complaint rates | Sending throttle + remediation plan | Suspension of sending; termination if unremediated |
| Purchased/scraped list detected | Suspension of sending, review | Termination |
| Illegal content or illegal business activity | Immediate suspension | Termination + report to authorities |
| Harassment/discrimination in outreach | Immediate suspension | Termination + report to authorities |
| API key sharing / rate-limit circumvention | Warning + key rotation required | Suspension or termination of API access |
| Reverse engineering / scraping the Service | Cease-and-desist notice | Termination + legal remedies |
| Multi-accounting for free quotas | Merge/close duplicate accounts | Termination of related accounts |

## 8. Appeal Process

8.1. If your account has been warned, throttled, suspended, or terminated and you believe this was in error, you may appeal.

8.2. **How to appeal:**

- Email **legal@acquisitionos.com** with the subject line **"AUP Appeal — [Your Account Email]"**.
- Include your account email, the date of the enforcement action, and a clear explanation of why you believe the action was mistaken, along with any supporting evidence (for example, proof of consent or list provenance).
- Appeals must generally be filed within **30 days** of the enforcement action.

8.3. **Review and outcome:**

- A reviewer who was not involved in the original decision will assess your appeal, typically within **5–10 business days**. Complex cases may take longer; we will keep you informed.
- Possible outcomes: the action is upheld; the action is modified (for example, access restored with conditions); or the action is reversed.
- If your appeal is successful, we will restore access where feasible. Credits that were validly unused at the time of a wrongful suspension will be reinstated.
- The outcome of an appeal is final under our internal process; it does not affect any rights you have under the dispute resolution provisions of the [Terms of Service](TERMS-OF-SERVICE.md).

8.5. **What reviewers look for.** Appeals are assessed against the evidence: proof of consent or lawful basis for the contacts in question, list provenance, sending configuration, and compliance history. Providing complete evidence up front is the single biggest factor in a successful appeal.

8.6. During an appeal, please do not create new accounts or attempt to bypass enforcement — doing so typically results in permanent termination.

## 9. Reporting Violations and Security Issues

- **To report another user's violation** (for example, you received spam from an AcquisitionOS user): email **support@acquisitionos.com** with the offending message (including headers if possible) and any relevant details. We investigate all reports and take action per Section 7. We will not disclose your identity to the reported user without your consent or a legal requirement.
- **To report a security vulnerability** in the Service: email **security@acquisitionos.com**. We ask that you give us a reasonable opportunity to fix issues before public disclosure, and we will credit responsible disclosures where appropriate.
- **Not to abuse the reporting channel.** Knowingly false reports, or reports submitted to harm a competitor, are themselves violations of this AUP and the [Terms of Service](TERMS-OF-SERVICE.md).

## 10. Changes to This Policy

We may update this AUP to reflect changes in law, industry standards, or our Service. We will notify material changes by posting the updated policy with a new "Last updated" date and, where appropriate, by email or in-app notification. Continued use of the Service after the effective date constitutes acceptance. The AUP in effect at the time of conduct governs that conduct.

## 11. Contact

- **Reports and general questions:** support@acquisitionos.com
- **Appeals:** legal@acquisitionos.com
- **Security disclosures:** security@acquisitionos.com
- **Operator:** QuantumFusion Solutions · acquisitionos.com · https://acquisition.space-z.ai

---

*Related documents: [Terms of Service](TERMS-OF-SERVICE.md) · [Privacy Policy](PRIVACY-POLICY.md) · [Refund Policy](REFUND-POLICY.md) · [Service Level Agreement](SLA.md) · [Cookie Policy](COOKIE-POLICY.md)*
