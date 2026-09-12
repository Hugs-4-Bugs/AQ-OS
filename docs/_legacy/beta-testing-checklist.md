# AcquisitionOS — Beta Testing Checklist

> Use this checklist to systematically test all major features during beta. Record expected vs actual behavior and severity for each scenario.

---

## How to Use This Checklist

| Column | Description |
|--------|-------------|
| **Test Scenario** | What to test |
| **Expected Behavior** | What should happen |
| **Actual Behavior** | What actually happened (fill in during testing) |
| **Severity** | Critical / High / Medium / Low |
| **Status** | Pass / Fail / Blocked |

---

## 1. Authentication & Authorization

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 1.1 | Sign up with valid email/password | Account created, verification email sent | | | |
| 1.2 | Sign up with existing email | Error: "Account already exists" | | | |
| 1.3 | Sign up with invalid email format | Validation error on email field | | | |
| 1.4 | Sign up with weak password | Password strength indicator shows warning | | | |
| 1.5 | Verify email via confirmation link | Account activated, redirect to dashboard | | | |
| 1.6 | Login with correct credentials | Successful login, dashboard loads | | | |
| 1.7 | Login with incorrect password | Error: "Invalid credentials" | | | |
| 1.8 | Login with unverified email | Prompt to verify email before access | | | |
| 1.9 | Google OAuth sign-in | Redirect to Google, account linked/created | | | |
| 1.10 | Password reset flow | Reset email sent, password changeable | | | |
| 1.11 | Session persistence across refresh | User remains logged in after page reload | | | |
| 1.12 | Logout clears session | User redirected to sign-in, session invalidated | | | |
| 1.13 | CSRF protection on auth forms | Tokens validated, cross-site requests rejected | | | |
| 1.14 | Token refresh on expiry | Seamless token refresh without user action | | | |

---

## 2. Leads Management

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 2.1 | Create a new lead with all fields | Lead created, appears in list | | | |
| 2.2 | Create lead with minimal fields (name only) | Lead created with defaults | | | |
| 2.3 | Create lead with duplicate email | Warning or duplicate detection triggered | | | |
| 2.4 | Edit lead details | Changes saved and reflected | | | |
| 2.5 | Delete a lead | Lead removed, confirmation shown | | | |
| 2.6 | Search leads by name | Matching leads displayed | | | |
| 2.7 | Filter leads by source | Only leads from selected source shown | | | |
| 2.8 | Sort leads by score/date | List reordered accordingly | | | |
| 2.9 | View lead detail panel | Full timeline, notes, activity shown | | | |
| 2.10 | Import leads from CSV | Bulk import completes, leads created | | | |
| 2.11 | Export leads to CSV | Download initiated with correct data | | | |
| 2.12 | Merge duplicate leads | Leads merged, data consolidated | | | |
| 2.13 | Compare two leads side-by-side | Comparison view displays correctly | | | |
| 2.14 | Lead scoring (manual) | Score updates after manual input | | | |
| 2.15 | Lead scoring (AI-powered) | AI score generated, credits deducted | | | |
| 2.16 | Bulk select and bulk actions | Multi-select works, bulk actions apply | | | |
| 2.17 | Tag management on leads | Tags add/remove correctly | | | |

---

## 3. Deals & Pipeline

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 3.1 | Create a new deal | Deal created, appears on pipeline board | | | |
| 3.2 | Move deal between stages (drag & drop) | Deal moves, stage updates | | | |
| 3.3 | Edit deal details (value, date, stage) | Changes saved and reflected | | | |
| 3.4 | Delete a deal | Deal removed with confirmation | | | |
| 3.5 | View deal detail panel | All deal info, associated lead, timeline shown | | | |
| 3.6 | Pipeline analytics (velocity, win rate) | Charts render with correct data | | | |
| 3.7 | Deal risk assessment | Risk indicators display correctly | | | |
| 3.8 | Deal automation rules | Rules trigger correctly on stage change | | | |
| 3.9 | Revenue forecast chart | Forecast displays based on pipeline data | | | |
| 3.10 | Revenue waterfall visualization | Waterfall chart renders correctly | | | |

---

## 4. Outreach & Sequences

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 4.1 | Create an email sequence | Sequence builder opens, steps configurable | | | |
| 4.2 | Add steps to a sequence | Steps added with timing and content | | | |
| 4.3 | Send a single email via Gmail compose | Email sent, appears in sent folder | | | |
| 4.4 | Use email template library | Template loads into compose dialog | | | |
| 4.5 | Create custom email template | Template saved and available | | | |
| 4.6 | Email template builder (drag & drop) | Builder renders, elements configurable | | | |
| 4.7 | Sequence execution tracking | Status updates per step per recipient | | | |
| 4.8 | Email click tracking | Click events recorded in analytics | | | |
| 4.9 | Bounce detection and handling | Bounced emails flagged, intelligence updated | | | |
| 4.10 | Reply intelligence | Replies categorized, suggested actions shown | | | |
| 4.11 | Outreach performance analytics | Metrics render (open rate, click rate, reply rate) | | | |
| 4.12 | Campaign tracker | Campaign status and metrics display | | | |

---

## 5. AI Features

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 5.1 | AI lead scoring | Score generated with reasoning, credits deducted | | | |
| 5.2 | AI outreach generation | Outreach email/sequence drafted | | | |
| 5.3 | AI copilot chat | Chat responds with relevant context | | | |
| 5.4 | AI analysis card | Analysis displayed for selected entity | | | |
| 5.5 | AI proposal generation | Proposal content generated | | | |
| 5.6 | Hot lead detection (AI) | Hot leads flagged with indicators | | | |
| 5.7 | Competitor intelligence analysis | Competitor data and insights displayed | | | |
| 5.8 | AI credit enforcement | AI features blocked when credits depleted | | | |
| 5.9 | AI cost tracker | Usage costs visible in billing | | | |
| 5.10 | Meeting AI assistant | Meeting insights and suggestions generated | | | |
| 5.11 | Auto-insight engine | Insights auto-generated from data patterns | | | |
| 5.12 | RAG-enhanced responses | Responses include contextual data from knowledge base | | | |

---

## 6. Billing & Payments

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 6.1 | View current plan and usage | Plan details, credits, and usage displayed | | | |
| 6.2 | Upgrade plan | Checkout modal opens, payment processed | | | |
| 6.3 | Downgrade plan | Downgrade modal with confirmation | | | |
| 6.4 | View payment history | Invoice list with dates and amounts | | | |
| 6.5 | Download invoice PDF | PDF download initiates | | | |
| 6.6 | Payment failure handling | Payment past-due banner shown, recovery flow | | | |
| 6.7 | Credit renewal at billing cycle | Credits reset/replenish on renewal date | | | |
| 6.8 | Stripe Checkout integration | Redirect to Stripe, payment completed | | | |
| 6.9 | Stripe portal for management | Customer portal accessible for card updates | | | |
| 6.10 | Trial banner display | Trial info shown for new accounts | | | |
| 6.11 | Usage limit enforcement | Features gated when limits exceeded | | | |

---

## 7. Integrations

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 7.1 | Connect Gmail via OAuth | OAuth flow completes, Gmail connected | | | |
| 7.2 | Gmail inbox sync | Messages sync and display in thread panel | | | |
| 7.3 | Gmail send email | Email sent via compose dialog | | | |
| 7.4 | Gmail account switcher (multiple accounts) | Switch between connected accounts | | | |
| 7.5 | Connect Telegram bot | Bot authorized, Telegram connected | | | |
| 7.6 | Send Telegram message | Message delivered, status updated | | | |
| 7.7 | Connect WhatsApp Business | WhatsApp API setup completes | | | |
| 7.8 | Send WhatsApp template message | Template message delivered | | | |
| 7.9 | Integration health monitor | Status indicators for all integrations | | | |
| 7.10 | Disconnect integration | Integration removed, data preserved | | | |

---

## 8. Workflows & Automation

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 8.1 | Create a new workflow | Workflow builder opens | | | |
| 8.2 | Add trigger to workflow | Trigger configured (event, schedule, etc.) | | | |
| 8.3 | Add action steps | Actions added and configured | | | |
| 8.4 | Save and activate workflow | Workflow saved and running | | | |
| 8.5 | View workflow execution history | History shows past runs with status | | | |
| 8.6 | Workflow dead letter queue | Failed executions viewable and replayable | | | |
| 8.7 | Workflow metrics and analytics | Execution metrics displayed | | | |
| 8.8 | Use workflow template | Template pre-populates workflow | | | |
| 8.9 | Delete/deactivate workflow | Workflow stopped and removed | | | |

---

## 9. Browser & Device Compatibility

### Desktop Browsers

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome (latest) | | | |
| Firefox (latest) | | | |
| Safari (latest) | | | |
| Edge (latest) | | | |

### Mobile Browsers

| Browser | Device | Status | Notes |
|---------|--------|--------|-------|
| Chrome (Android) | | | |
| Safari (iOS) | | | |
| Samsung Internet | | | |

### Responsive Breakpoints

| Breakpoint | Width | Status | Notes |
|-----------|-------|--------|-------|
| Mobile | < 640px | | |
| Tablet | 640px - 1024px | | |
| Desktop | 1024px - 1440px | | |
| Large Desktop | > 1440px | | |

### Key UI Checks per Breakpoint
- [ ] Navigation sidebar collapses to mobile menu on small screens
- [ ] Data tables use responsive/mobile card layout on mobile
- [ ] Dialogs/modals are scrollable and properly sized on mobile
- [ ] Touch targets are at least 44x44px on mobile
- [ ] No horizontal overflow on any viewport width
- [ ] Charts and visualizations resize correctly

---

## 10. Performance Observations

| Metric | Target | Observed | Pass/Fail |
|--------|--------|----------|-----------|
| Initial page load (landing) | < 3s | | |
| Dashboard load after login | < 2s | | |
| Lead list render (100+ leads) | < 1s | | |
| Deal pipeline board render | < 1s | | |
| AI feature response time | < 5s | | |
| Search/filter response | < 500ms | | |
| Data export (CSV) | < 5s for 1000 rows | | |
| Concurrent user handling | 10 users no degradation | | |

---

## 11. Edge Case Scenarios

| # | Test Scenario | Expected Behavior | Actual Behavior | Severity | Status |
|---|--------------|-------------------|-----------------|----------|--------|
| 11.1 | Submit forms with XSS payloads | Input sanitized, no script execution | | | |
| 11.2 | Navigate to non-existent route | 404 page displayed gracefully | | | |
| 11.3 | Perform actions while offline | Offline indicator, queued actions | | | |
| 11.4 | Concurrent editing of same lead | Last-write-wins or conflict resolution | | | |
| 11.5 | Very long text in input fields | Text truncated or scrollable, no layout break | | | |
| 11.6 | Special characters in names/emails | Characters handled correctly | | | |
| 11.7 | Session expiry during active use | Graceful redirect to login | | | |
| 11.8 | API rate limiting triggered | User-friendly error message shown | | | |
| 11.9 | Zero credits + AI action attempt | Credit gate blocks action, prompts upgrade | | | |
| 11.10 | Large CSV import (1000+ rows) | Import completes with progress indicator | | | |
| 11.11 | Empty state for new account | Helpful empty states with CTAs displayed | | | |
| 11.12 | Browser back/forward navigation | Proper history management, no broken states | | | |
| 11.13 | Multiple tabs with same session | Session works across tabs | | | |
| 11.14 | Rapid clicks on action buttons | Duplicate actions prevented (debounce/disable) | | | |
| 11.15 | Dark mode toggle persistence | Theme preference saved and applied on reload | | | |

---

## 12. Accessibility Quick Check

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 12.1 | All interactive elements reachable via keyboard | | |
| 12.2 | Focus indicators visible on all elements | | |
| 12.3 | Screen reader compatibility (basic navigation) | | |
| 12.4 | Color contrast meets WCAG 2.1 AA (4.5:1 for text) | | |
| 12.5 | Form labels and ARIA attributes present | | |
| 12.6 | Modal focus trap works correctly | | |

---

## Summary Template

| Category | Total Tests | Passed | Failed | Blocked |
|----------|------------|--------|--------|---------|
| Authentication | 14 | | | |
| Leads | 17 | | | |
| Deals & Pipeline | 10 | | | |
| Outreach & Sequences | 12 | | | |
| AI Features | 12 | | | |
| Billing & Payments | 11 | | | |
| Integrations | 10 | | | |
| Workflows | 9 | | | |
| Edge Cases | 15 | | | |
| **Total** | **110** | | | |

### Critical/High Bugs Found
| # | Description | Severity | Status |
|---|-------------|----------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

**Tester:** ____________________  
**Date:** ____________________  
**Environment:** ____________________  
**Browser/Device:** ____________________
