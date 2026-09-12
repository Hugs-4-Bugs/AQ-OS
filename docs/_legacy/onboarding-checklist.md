# AcquisitionOS — New User Onboarding Checklist

> Complete each step to get fully set up with AcquisitionOS. Check off items as you go.

---

## 1. Account Setup

- [ ] Navigate to the signup page at `/auth/signup`
- [ ] Enter your full name, email address, and password
- [ ] Click "Create Account" to submit the registration form
- [ ] Check your email inbox for the verification email
- [ ] Click the email verification link to confirm your account
- [ ] Return to the app and log in with your credentials at `/auth/signin`
- [ ] (Alternative) Sign up using Google OAuth if available — click "Continue with Google"
- [ ] Verify the welcome banner appears on first login

---

## 2. Dashboard Tour

- [ ] Review the **Overview** tab — familiarize yourself with key metrics (total leads, deals pipeline, revenue)
- [ ] Explore the **Leads** tab — understand the lead list, filters, and search
- [ ] Explore the **Deals** tab — review the pipeline board and deal stages
- [ ] Check the **Pipeline** tab — view funnel visualization and deal velocity
- [ ] Visit the **Discover** tab — browse AI-powered insights and recommendations
- [ ] Review the **Insights** tab — check analytics charts and KPI dashboards
- [ ] Open the **Assistant** tab — understand the AI copilot capabilities
- [ ] Explore the **Outreach** tab — review email sequences and campaign tools
- [ ] Visit the **Workflows** tab — see available workflow templates and builders
- [ ] Check the **Integrations** tab — view connected services status
- [ ] Open the **Billing** tab — understand your plan, credits, and usage
- [ ] Review the **Settings** panel — familiarize with profile and configuration options

---

## 3. First Lead Creation

- [ ] Click the "Create Lead" button (or use the quick-lead form / command palette)
- [ ] Fill in lead details: name, email, company, phone (optional)
- [ ] Assign a lead source (e.g., "Website", "Referral", "LinkedIn")
- [ ] Add tags to categorize the lead
- [ ] Set an initial lead score or let AI auto-score
- [ ] Save the lead and verify it appears in the Leads tab
- [ ] Open the lead detail panel and review the activity timeline
- [ ] Try editing the lead information and saving changes

---

## 4. First Deal Creation

- [ ] Navigate to the Deals tab
- [ ] Click "Create Deal" or use the quick action button
- [ ] Associate the deal with an existing lead or create a new contact
- [ ] Enter deal details: name, value, expected close date
- [ ] Select a deal stage (e.g., "Qualification", "Proposal", "Negotiation")
- [ ] Save the deal and verify it appears on the pipeline board
- [ ] Drag the deal to a different stage to test the pipeline board
- [ ] Open the deal detail panel and review associated information

---

## 5. Integration Setup

### Gmail Integration
- [ ] Navigate to Integrations tab or Settings > Integrations
- [ ] Click "Connect Gmail" to initiate OAuth flow
- [ ] Complete Google OAuth consent screen
- [ ] Verify Gmail sync status shows "Connected" in the integration health monitor
- [ ] Check that inbox messages are syncing in the Gmail thread panel
- [ ] Test sending an email via the Gmail compose dialog

### Telegram Integration
- [ ] Click "Connect Telegram" in the Integrations tab
- [ ] Follow the Telegram bot authorization flow
- [ ] Verify Telegram status card shows "Connected"
- [ ] Send a test message via the Telegram send dialog
- [ ] Confirm delivery status updates in the Telegram health view

### WhatsApp Integration
- [ ] Click "Connect WhatsApp" in the Integrations tab
- [ ] Follow the WhatsApp Business API setup flow
- [ ] Verify WhatsApp status card shows the connection state
- [ ] Test a WhatsApp template message delivery
- [ ] Review delivery status on the WhatsApp delivery page

---

## 6. Billing & Plan Selection

- [ ] Navigate to the Billing tab (`/dashboard/billing`)
- [ ] Review available plans (Starter, Pro, Enterprise)
- [ ] Select and confirm a plan (or start with the free/trial tier)
- [ ] Enter payment information if upgrading
- [ ] Verify the plan change is reflected in the billing page
- [ ] Confirm the trial banner updates or disappears after plan selection
- [ ] Review the upgrade modal for plan comparison features

---

## 7. Credits Usage

- [ ] Review your current credit balance in the credit display (top bar or billing page)
- [ ] Understand credit costs per action (check credit-cost-badge tooltips on AI features)
- [ ] Use an AI feature (e.g., AI lead scoring, AI outreach generation) and observe credit deduction
- [ ] View the credit usage breakdown on the billing page
- [ ] Check the credit warning banner appears when credits are low
- [ ] Understand the credit gate behavior when credits are exhausted
- [ ] Review how credits renew (monthly or per-plan limits)

---

## 8. Profile & Settings Completion

- [ ] Open Settings panel from the sidebar or avatar dropdown
- [ ] Upload a profile avatar
- [ ] Update your display name and job title
- [ ] Set your timezone and locale preferences
- [ ] Configure notification preferences (email, in-app, push)
- [ ] Set up notification routing rules in notification preferences panel
- [ ] Review and update privacy settings
- [ ] Enable/disable cookie consent preferences
- [ ] Generate an API key if needed (Settings > Developer / API Keys)
- [ ] Review keyboard shortcuts in the shortcuts dialog (press `?` or `Ctrl+/`)
- [ ] Toggle dark/light theme and verify it persists
- [ ] Explore the accessibility panel for any needed accommodations

---

## Completion

- [ ] All sections above are completed
- [ ] Dashboard loads without errors
- [ ] No critical console errors in the browser developer tools
- [ ] All integrations show healthy status
- [ ] Credits are visible and being tracked correctly

**Onboarding complete!** You're ready to use AcquisitionOS. For help, refer to the [Bug Reporting Process](./bug-reporting-process.md) if you encounter any issues.
