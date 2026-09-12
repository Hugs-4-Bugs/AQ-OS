# Task L1-group6c — Mock Data Replacement Agent

## Task Summary
Replace ALL mock/hardcoded data in 10 AcquisitionOS frontend components with real API fetch calls or proper empty/loading/error states. Fix demo mode issues.

## Files Modified (10)

1. `/src/components/dashboard/lead-scoring-matrix.tsx` — Replaced LEADS_DATA, SCORE_SEGMENTS, GRADE_BREAKDOWN, INITIAL_CRITERIA with API fetch from /api/leads/scoring-matrix
2. `/src/components/dashboard/custom-alerts-panel.tsx` — Replaced alertRules, activeAlerts, upcomingReminders, alertHistory with API fetch from /api/alerts
3. `/src/components/dashboard/compliance-security-center.tsx` — Added API fetch from /api/dashboard/compliance-security for compliance areas, security alerts, active sessions
4. `/src/components/dashboard/advanced-reporting-builder.tsx` — Replaced RECENT_REPORTS with API fetch from /api/dashboard/reports
5. `/src/components/dashboard/team-chat-widget.tsx` — Replaced teamMembers, initialMessages with API fetch from /api/chat; refactored helper functions to accept teamMembers as parameter
6. `/src/components/dashboard/task-management-board.tsx` — Replaced MOCK_NEW_TASKS with EMPTY_TASK_TEMPLATE
7. `/src/components/dashboard/notification-toast-stack.tsx` — Replaced NotificationToastStackDemo with NotificationToastStackWrapper that fetches from /api/notifications
8. `/src/components/dashboard/auth-pages-v2.tsx` — Guarded DemoModeBanner with NODE_ENV check; replaced DEMO_SESSIONS with API fetch; guarded demo OTP toasts with NODE_ENV
9. `/src/components/dashboard/auth-gate.tsx` — Guarded DemoModeBanner with NODE_ENV check; guarded demo OTP/magic link toasts with NODE_ENV
10. `/src/components/dashboard/gmail-integration-tab.tsx` — Removed simulated connection success for demo; replaced with real API response handling

## Pattern Used
Each component follows the same pattern:
- Replace hardcoded mock data constants with empty default constants
- Add useState for data + loading state
- Add useEffect to fetch from appropriate API endpoint
- Add loading/empty/error states in the UI
- For demo mode: wrap with `if (process.env.NODE_ENV === 'development')` checks

## Worklog
Appended to /home/z/my-project/worklog.md
