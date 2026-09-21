# Service Level Agreement (SLA) — AcquisitionOS

> **Last updated:** 2026-09-09
> **Operator:** QuantumFusion Solutions
> **Product:** AcquisitionOS — AI-powered B2B client acquisition platform · https://acquisition.space-z.ai
> **Applies to:** paid plans (Pro and Elite) only. The Free plan is not covered by this SLA.
> **Contact:** support@acquisitionos.com · billing@acquisitionos.com (credit claims)

> **Note:** The user-facing version of this document renders inside the application alongside our other legal pages. This Markdown is the canonical source. This SLA supplements and forms part of the [Terms of Service](TERMS-OF-SERVICE.md); capitalised terms have the meanings given there.

---

## Table of Contents

1. [Scope and Applicability](#1-scope-and-applicability)
2. [Definitions](#2-definitions)
3. [Uptime Commitment](#3-uptime-commitment)
4. [How Uptime Is Measured](#4-how-uptime-is-measured)
5. [Scheduled Maintenance](#5-scheduled-maintenance)
6. [Excluded Downtime](#6-excluded-downtime)
7. [Support and Response Times](#7-support-and-response-times)
8. [Service Credits](#8-service-credits)
9. [How to Claim Service Credits](#9-how-to-claim-service-credits)
10. [Exclusions](#10-exclusions)
11. [Chronic Failure](#11-chronic-failure)
12. [Changes to This SLA](#12-changes-to-this-sla)
13. [Contact](#13-contact)
14. [Frequently Asked Questions](#14-frequently-asked-questions)

---

## 1. Scope and Applicability

1.1. This SLA describes our uptime commitments, support response times, and service credit remedies for **paid plans (Pro and Elite)** of AcquisitionOS.

1.2. This SLA does **not** apply to the **Free plan**, which is provided on a best-effort basis without uptime commitments or service credits. Free plan users may still contact support, but response times are best-effort.

1.3. This SLA is your exclusive remedy for Availability failures. It does not create additional warranties beyond those stated here.

## 2. Definitions

- **"Service"** — the AcquisitionOS web application and its public API, hosted by us.
- **"Available" / "Availability"** — the Service is reachable and responding to authenticated requests. A request counts as successful if it returns an HTTP 2xx or 4xx status; **5xx errors and complete unreachability count as Downtime**.
- **"Downtime"** — a period during which the core Service (sign-in, dashboard, and core API operations) is not Available.
- **"Monthly Uptime Percentage"** — for a given calendar month: `(total minutes in the month − Downtime minutes) / total minutes × 100`.
- **"Business Hours"** — Monday–Friday, 09:00–18:00 **Indian Standard Time (IST)**, excluding Indian public holidays.
- **"Critical Incident (P1)"** — a failure that renders the Service substantially unusable for most or all users (for example, total unavailability, authentication failures, or data-unavailability affecting the core platform).
- **"Service Credit"** — a percentage of the monthly fee credited to your account per Section 8.
- **"Beta Features"** — features identified as beta, preview, experimental, or early access in the UI, documentation, or release notes.

## 3. Uptime Commitment

We commit to the following Monthly Uptime Percentage targets:

| Plan | Monthly Uptime Commitment | Maximum Unavailability (30-day month) |
|---|---|---|
| **Pro** | **99.5%** | ≈ 3 hours 39 minutes |
| **Elite** | **99.9%** | ≈ 43 minutes |

3.1. The commitment covers the core Service: authentication and sign-in, the dashboard, lead discovery and pipeline features, outreach sending, and the core API. Individual third-party features (for example, Gmail or Calendar connectivity, Telegram delivery, or AI model responses) are subject to the exclusions in Section 6.

3.2. Downtime is measured per calendar month in IST (UTC+5:30).

3.3. **Multi-region notes.** Where the Service is deployed across multiple regions or availability zones, the commitment applies to the Service as experienced by you: a region failover that completes within the committed availability window is not itself a violation, but the failover window counts as Downtime if the Service is unreachable during it.

## 4. How Uptime Is Measured

4.1. **Monitoring method.** We operate external synthetic monitoring that probes the Service from multiple geographic regions at least once per minute, checking the application health endpoint and authenticated API responses. A probe failure sequence sustained for **2 consecutive minutes or more** counts as Downtime from the first failed probe.

4.2. **Calculation.** Monthly Uptime Percentage is calculated per the formula in Section 2, using all monitored minutes in the month, minus Excluded Downtime (Section 6).

4.3. **Customer reports.** If you observe an Availability issue we did not detect, report it (Section 9). Once verified against our monitoring data, the affected period counts toward Downtime for that month.

4.4. **Records.** We retain monitoring and incident records and will share relevant incident summaries with affected customers on request as part of a credit claim.

## 5. Scheduled Maintenance

5.1. We may perform scheduled maintenance to maintain, patch, or upgrade the Service.

5.2. **Notice.** We will announce scheduled maintenance expected to cause material unavailability at least **48 hours in advance**, via email and/or in-app notification.

5.3. **Windows.** Scheduled maintenance is typically performed outside peak usage hours (for example, late night IST on weekends) and is designed to be as short as possible. Maintenance performed as described in this section is **Excluded Downtime**.

5.4. **Emergency maintenance.** We may perform urgent maintenance without prior notice where necessary for security or to prevent data loss or extended outage. Emergency maintenance counts toward Downtime unless it is response to an event outside our control, but we will provide notice as soon as reasonably practicable.

5.5. **Maintenance records.** We keep a log of scheduled and emergency maintenance windows. Relevant entries are shared with you as part of a service-credit claim review, so excluded windows can be verified.

## 6. Excluded Downtime

The following do **not** count toward Downtime for the purposes of the Monthly Uptime Percentage and service credits:

- **Scheduled maintenance** announced in accordance with Section 5.
- **Third-party outages** — failures of services outside our reasonable control, including: Google (OAuth, Gmail, Calendar), Stripe or Razorpay (payment processing), Z-AI and other AI model providers, SMTP/email delivery providers, Telegram, Twilio/WhatsApp, and our cloud hosting or DNS providers. We make reasonable efforts to mitigate (for example, fallback AI providers or queuing) but cannot guarantee third-party performance.
- **Force majeure** — war, terrorism, natural disasters, government action, labor disputes, internet backbone failures, or other events beyond our reasonable control.
- **Suspensions under the AUP** — unavailability caused by suspension or throttling of your account for violation of the [Acceptable Use Policy](ACCEPTABLE-USE-POLICY.md) or [Terms of Service](TERMS-OF-SERVICE.md), or for non-payment.
- **User-caused issues** — your misconfiguration, your custom integrations or code, your network or device problems, or your exceeding of plan quotas and rate limits.
- **Beta Features** and any feature explicitly labeled as preview, experimental, or early access.
- **Data deletions or exports you initiate** and the ordinary effects of account-level changes you make.

## 7. Support and Response Times

7.1. **First-response commitments for paid plans:**

| Severity | Description | **Pro** | **Elite** |
|---|---|---|---|
| **P1 — Critical** | Service substantially unusable (outage, sign-in failure, core data unavailable) | Response within **24 Business Hours** | Response within **4 hours, 24/7** (including nights, weekends, and holidays) |
| **P2 — High** | Major feature degraded with no reasonable workaround (e.g., outreach sending failing) | Response within **24 Business Hours** | Response within **4 Business Hours** |
| **P3 — Normal** | Minor feature issue or degraded behavior with a workaround | Response within **24 Business Hours** | Response within **4 Business Hours** |
| **P4 — Low** | Cosmetic issues, questions, feature requests | Response within **24 Business Hours** | Response within **4 Business Hours** |

7.2. **"First response"** means a human acknowledgement of your ticket that includes a triage summary and next step — not necessarily a full resolution.

7.3. **24/7 critical coverage.** For Elite customers, P1 incidents are monitored and answered **around the clock, every day**. For Pro customers, all severities are answered within 24 Business Hours.

7.4. **How to reach support.** Email **support@acquisitionos.com** (or use in-app support). For suspected P1 incidents, write "P1" or "Critical" in the subject line and include the affected time (with timezone), the affected URL or endpoint, your account email, and any error messages or screenshots.

### 7.4.1 Severity classification examples

| Severity | Examples |
|---|---|
| **P1 — Critical** | Cannot sign in for any user; dashboard returns errors for all pages; core API completely down; leads/pipeline data unavailable |
| **P2 — High** | Outreach sending fails for all campaigns; lead discovery returns no results; calendar sync broken with no workaround; API consistently 5xx on a core endpoint |
| **P3 — Normal** | A dashboard widget shows stale data; an integration intermittently fails with a retry workaround; slow performance on a non-core page |
| **P4 — Low** | Cosmetic UI issues, typos, documentation gaps, feature requests |

We reserve the right to adjust severity during triage as impact becomes clearer, and will tell you if we do.

7.5. Communication about ongoing critical incidents is provided by email; a public status page and/or status notifications may be added over time.

7.6. **Response vs. resolution.** The commitments above are for **first response**. Resolution targets depend on the root cause:

| Severity | Typical resolution approach |
|---|---|
| P1 | Immediate mitigation first (rollback, failover), root-cause fix and postmortem to follow |
| P2 | Workaround or fix within days; tracked to completion |
| P3 | Scheduled fix in an upcoming release |
| P4 | Tracked as a backlog item; no committed timeline |

We prioritize by impact and severity, and we will communicate status on P1/P2 incidents until resolution or a workaround is in place.

7.7. **Escalation path.** If a ticket is not answered within the committed window, or you believe severity was mis-triaged: (1) reply to the ticket asking for escalation; (2) email support@acquisitionos.com with "ESCALATION" in the subject; (3) for Elite P1 incidents that remain unanswered after 4 hours, write to legal@acquisitionos.com. Escalations are reviewed by the engineering lead on duty.

## 8. Service Credits

8.1. If the Monthly Uptime Percentage for a calendar month falls below your plan's commitment, you are eligible for a **Service Credit** — a percentage of the monthly fee for the affected month, credited to your account. Service credits are **not cash refunds** (see the [Refund Policy](REFUND-POLICY.md) for the narrow refund cases, such as chronic failure under Section 11 below).

8.2. **Service credit schedule:**

**Pro plan**

| Monthly Uptime Percentage | Service Credit |
|---|---|
| < 99.5% but ≥ 99.0% | **10%** of the monthly fee |
| < 99.0% | **25%** of the monthly fee |

**Elite plan**

| Monthly Uptime Percentage | Service Credit |
|---|---|
| < 99.9% but ≥ 99.5% | **10%** of the monthly fee |
| < 99.5% but ≥ 99.0% | **25%** of the monthly fee |
| < 99.0% | **50%** of the monthly fee |

8.3. **"Monthly fee"** means the subscription fee you actually paid for the affected plan for that month — for annual plans, 1/12 of the annual price. It excludes taxes, add-on credit purchases, and one-time charges.

8.4. **Caps and conditions:**

- The maximum Service Credit in any month is **50% of the monthly fee**.
- Service credits apply only if your account is current on payments at the time of the claim.
- Service credits cannot be combined for the same downtime with any other remedy, and are **not redeemable for cash**.
- Credits are applied to future billing; if your subscription ends, unapplied credits are forfeited.

8.5. **Worked examples.**

*Example 1 (Pro, monthly).* A Pro customer on the ₹2,499/month plan experiences a verified outage of 5 hours in a month with no other downtime. Monthly Uptime Percentage ≈ 98.8% (< 99.0%). Under the Pro schedule this earns a **25% credit ≈ ₹624.75** (excluding taxes), applied to the next invoice.

*Example 2 (Elite, annual).* An Elite customer pays ₹76,790/year (≈ ₹6,399.17/month effective). In a month with 2 hours of Downtime (Monthly Uptime ≈ 99.72%, i.e., < 99.9% but ≥ 99.5%), a **10% credit ≈ ₹639.92** applies. If the same customer instead had 99.2% uptime, a **25% credit** would apply; at 98.5%, **50%**.

*Example 3 (Excluded event).* A 3-hour outage caused by a Google OAuth incident is Excluded Downtime (third-party outage). It does not reduce the Monthly Uptime Percentage and no credit accrues for it, though we would still investigate and communicate.

## 9. How to Claim Service Credits

9.1. To claim a Service Credit, email **billing@acquisitionos.com** (or support@acquisitionos.com) with the subject line **"SLA Credit Claim — [Your Account Email]"** within **30 days** of the end of the month in which the Downtime occurred.

9.2. Include:

- Your account email and plan (Pro/Elite).
- The month affected.
- The dates and approximate times (with timezone) of the Downtime you observed.
- Any supporting evidence (error messages, screenshots, request IDs).

9.3. **Review and application.** We will verify the claim against our monitoring records and respond within **10 business days**. Approved credits are applied to your next invoice or credit balance within one billing cycle. If we determine the claim is not covered (for example, Excluded Downtime), we will explain why.

9.4. Claims made more than 30 days after the end of the affected month are waived.

9.5. **After approval.** Approved credits appear on your next invoice or as account credit within one billing cycle, and we confirm the application by email. If you dispute our measurement, you may request the probe/incident summary for the affected window; we will provide data sufficient to verify the calculation.

## 10. Exclusions

This SLA does not cover:

- **The Free plan** (best-effort only; no uptime commitment or credits).
- **Beta Features**, preview features, and experimental capabilities.
- **Third-party services** (payments, AI providers, email delivery, messaging platforms, hosting) except where the failure is within our own infrastructure and control.
- **User-caused issues**, including misconfiguration, custom code, exceeding quotas or rate limits, and account suspensions for AUP/ToS violations or non-payment.
- **Force majeure events** (Section 6).
- Issues arising from your failure to maintain current billing or your breach of the [Terms of Service](TERMS-OF-SERVICE.md).

10.1. If a feature is unavailable but the core Service remains Available (for example, one integration channel is down), the incident is remediated per our support process but generally does not constitute full Downtime unless the core Service is substantially unusable.

## 11. Chronic Failure

11.1. If we fail to meet the applicable Monthly Uptime Commitment for **3 consecutive months**, you may terminate your subscription for cause and receive a **prorated refund** for the unused full months remaining in your current billing period, as described in the [Refund Policy](REFUND-POLICY.md).

11.2. To exercise this right, contact billing@acquisitionos.com within 30 days after the end of the third consecutive non-compliant month.

## 12. Changes to This SLA

We may update this SLA from time to time. Material changes will be announced at least **60 days** in advance by posting the updated SLA with a new "Last updated" date and, where appropriate, by email or in-app notification. Changes will not reduce commitments for the month in which they are announced.

## 13. Contact

- **Support and incident reporting:** support@acquisitionos.com
- **Service credit claims:** billing@acquisitionos.com
- **Legal questions:** legal@acquisitionos.com
- **Operator:** QuantumFusion Solutions · acquisitionos.com · https://acquisition.space-z.ai

## 14. Frequently Asked Questions

**Does an SLA violation mean I get my money back?** No — the remedy under this SLA is a **service credit** (a percentage of the monthly fee added to your account). Cash refunds apply only in the limited cases described in the [Refund Policy](REFUND-POLICY.md), such as chronic failure under Section 11 of this SLA.

**Do SLA credits apply to the Free plan or trials?** No. The Free plan is best-effort with no commitments.

**What if downtime happens in two different months?** Each month is evaluated separately; credits accrue per month.

**Can I stack an SLA credit with a refund claim for the same month?** No — one remedy per month (see Section 8.4).

**How will I know if we missed the commitment?** You can request a monthly uptime summary for your account as part of a claim, and we post incident communications for significant events.

**Do 429 rate-limit responses count as downtime?** No. Throttling that correctly enforces your plan's rate limits is working as designed, not an availability failure.

**What if only one integration is broken but the rest works?** Single-integration issues (for example, Gmail connectivity) are handled as support incidents; they count as full Downtime only if the core Service is substantially unusable (see Sections 3.1 and 10.1).

**Can our SLA credits expire?** Unapplied credits are forfeited if your subscription ends (see Section 8.4); while your subscription is active they remain available for future billing.

**Who decides whether an outage counts as Downtime?** Our monitoring records are the primary source, verified against your report. If we disagree, we will share the relevant incident/probe summary so you can verify the calculation (see Section 9.5).

---

*Related documents: [Terms of Service](TERMS-OF-SERVICE.md) · [Refund Policy](REFUND-POLICY.md) · [Acceptable Use Policy](ACCEPTABLE-USE-POLICY.md) · [Privacy Policy](PRIVACY-POLICY.md) · [Cookie Policy](COOKIE-POLICY.md)*
