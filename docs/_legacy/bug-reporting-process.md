# AcquisitionOS — Bug Reporting Process

> Follow this guide to report bugs effectively during beta testing and beyond.

---

## Bug Report Template

Copy and fill in the following template for each bug report:

```
## Bug Report

**Title:** [Short, descriptive summary of the bug]

**Description:**
[Detailed description of what went wrong]

**Steps to Reproduce:**
1. 
2. 
3. 
4. 

**Expected Behavior:**
[What should have happened]

**Actual Behavior:**
[What actually happened]

**Severity:** Critical / High / Medium / Low

**Environment:**
- Browser: [e.g., Chrome 120, Firefox 121, Safari 17]
- Device: [e.g., Desktop, iPhone 15, Samsung Galaxy S24]
- OS: [e.g., macOS 14.2, Windows 11, iOS 17.2]
- Screen size: [e.g., 1920x1080, 390x844]

**Console Errors:**
[Paste any errors from the browser console]

**Network Errors:**
[Paste any failed network requests from the Network tab]

**Screenshots/Screen Recordings:**
[Attach if available]

**Additional Context:**
[Any other relevant information — recent changes, related features, etc.]

**Reported By:** [Your name]
**Date:** [YYYY-MM-DD]
```

---

## Severity Classification Guide

### Critical (P0)
- **Definition:** System is completely unusable or data is at risk
- **Examples:**
  - Application crashes on load
  - Data loss or corruption
  - Security vulnerability (auth bypass, data exposure)
  - Payment processing failure resulting in double-charge
  - All users affected, no workaround available
- **Response Time:** Immediate investigation; fix within 4 hours

### High (P1)
- **Definition:** Major feature is broken with no workaround
- **Examples:**
  - Login fails for specific auth methods
  - Lead/deal creation fails
  - Integration connection fails completely
  - Billing page inaccessible
  - AI features return errors consistently
- **Response Time:** Investigation within 4 hours; fix within 24 hours

### Medium (P2)
- **Definition:** Feature partially works or has a reasonable workaround
- **Examples:**
  - Slow page load (>5s) but page eventually loads
  - Incorrect data in analytics but core functionality works
  - UI misalignment or broken layout on specific browsers
  - Email template formatting issues
  - Minor data sync delays (<5 min)
- **Response Time:** Investigation within 24 hours; fix within 1 week

### Low (P3)
- **Definition:** Cosmetic issue or minor inconvenience
- **Examples:**
  - Typo in UI text
  - Non-critical color/theme inconsistency
  - Tooltip text unclear or missing
  - Minor animation glitch
  - Enhancement suggestions
- **Response Time:** Triaged within 1 week; fix in next sprint

---

## How to Capture Console Errors

### Chrome / Edge
1. Open the application in your browser
2. Press `F12` or `Ctrl+Shift+I` (macOS: `Cmd+Option+I`) to open DevTools
3. Click the **Console** tab
4. Reproduce the bug
5. Look for red error messages in the console
6. Right-click the error → **Save as...** or select all and copy
7. Paste the error output into the bug report's **Console Errors** section

**Tips:**
- Enable "Preserve log" to keep errors across page navigations
- Set log level to "All levels" to capture warnings alongside errors
- Include the stack trace (click the arrow next to the error to expand)

### Firefox
1. Press `F12` or `Ctrl+Shift+I` (macOS: `Cmd+Option+I`) to open Developer Tools
2. Click the **Console** tab
3. Reproduce the bug
4. Right-click the console output → **Copy All Messages**
5. Paste into the bug report

### Safari
1. First enable Developer Menu: Safari → Preferences → Advanced → "Show Develop menu in menu bar"
2. Press `Cmd+Option+I` to open Web Inspector
3. Click the **Console** tab
4. Reproduce the bug
5. Select and copy error messages
6. Paste into the bug report

---

## How to Capture Network Errors

### Chrome / Edge
1. Open DevTools (`F12` or `Ctrl+Shift+I`)
2. Click the **Network** tab
3. Check "Preserve log" to keep requests across navigations
4. Reproduce the bug
5. Look for requests highlighted in **red** (failed requests)
6. Click on a failed request to see details:
   - **Headers** tab: Request URL, Method, Status Code
   - **Payload** tab: Request body data
   - **Response** tab: Server response (error message)
   - **Timing** tab: How long the request took
7. Right-click the request → **Copy** → **Copy as cURL** (useful for developers to reproduce)
8. Or right-click → **Copy** → **Copy all as HAR** (captures full network log)
9. Paste the relevant information into the bug report's **Network Errors** section

**Key information to capture:**
- Request URL and HTTP method
- Status code (e.g., 400, 401, 403, 500, 502, 503)
- Response body (error message from server)
- Request payload (what was sent to the server)
- Timing information (if the request is slow)

### Firefox
1. Open Developer Tools (`F12` or `Ctrl+Shift+I`)
2. Click the **Network** tab
3. Reproduce the bug
4. Click on failed requests (shown in red)
5. Copy the request details from the panels on the right
6. Right-click → **Copy All As HAR** for full network log

### Safari
1. Open Web Inspector (`Cmd+Option+I`)
2. Click the **Network** tab
3. Reproduce the bug
4. Click on failed requests
5. Copy relevant details from the request inspector

---

## Contact & Support Workflow

### Reporting Channels

| Channel | Use For | Response Expectation |
|---------|---------|---------------------|
| **GitHub Issues** | Structured bug reports with full template | Triaged within 24 hours |
| **Slack/Discord #bugs** | Quick reports, questions, follow-ups | Same-day response |
| **Email: bugs@acquisitionos.com** | Bug reports with attachments (screenshots, HAR files) | 24-48 hour response |
| **In-App Feedback** | Quick feedback and minor issues | Triaged weekly |

### Bug Lifecycle

```
1. REPORTED → Bug submitted with full template
      ↓
2. TRIAGED → Severity assigned, duplicate check, prioritized
      ↓
3. CONFIRMED → Reproduced by team, assigned to developer
      ↓
4. IN PROGRESS → Developer actively working on fix
      ↓
5. FIXED → Code fix merged, deployed to staging
      ↓
6. VERIFIED → Reporter confirms fix resolves the issue
      ↓
7. CLOSED → Bug resolved and released to production
```

### Escalation Path

1. **Reporter** submits bug using the template above
2. **QA Lead** triages within 4 hours (Critical/High) or 24 hours (Medium/Low)
3. **Engineering Lead** assigns to developer based on component ownership
4. **Developer** fixes and deploys to staging
5. **Reporter** verifies fix on staging environment
6. **Release Manager** includes fix in next production release

### Critical Bug Escalation

For **Critical (P0)** bugs only:
1. Report immediately via Slack/Discord `@here` in `#critical-bugs`
2. Also submit via GitHub Issues with `critical` label
3. Tag the Engineering Lead directly
4. Expect acknowledgment within **30 minutes**
5. War room initiated if not resolved within **2 hours**

---

## Quick Reference

| Action | How |
|--------|-----|
| Open browser DevTools | `F12` or `Ctrl+Shift+I` (`Cmd+Option+I` on Mac) |
| Copy console errors | Select all → Copy from Console tab |
| Copy network request as cURL | Right-click request → Copy → Copy as cURL |
| Export full network log | Right-click → Copy → Copy all as HAR |
| Take screenshot | `Ctrl+Shift+S` (Firefox) or use OS screenshot tool |
| Check localStorage | DevTools → Application → Local Storage |
| Check cookies | DevTools → Application → Cookies |
| Clear site data | DevTools → Application → Clear site data |

---

*Thank you for helping make AcquisitionOS better! Every bug report helps us deliver a more reliable product.*
