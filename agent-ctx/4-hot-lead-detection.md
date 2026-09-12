# Task 4: Hot Lead Detection Service

## Agent: Hot Lead Detection Agent
## Status: COMPLETE

## Deliverable
- `/home/z/my-project/src/lib/hot-lead-detection-service.ts` (~620 lines)

## Key Implementation Details

### Signal Weights
- Lead score (conversionScore): 25%
- Reply recency (replied within 24h): 20%
- Engagement velocity (7-day interactions): 15%
- Buying signal count: 15%
- Meeting scheduled: 10%
- Pipeline velocity: 10%
- Website activity: 5%

### Heat Levels
- cold (0-30), warm (31-60), hot (61-80), critical (81-100)

### Auto-Actions
- Hot: in-app notification + outreach suggestion
- Critical: notification + email alert + auto outreach draft + pipeline stage advance

### Data Sources
- `db.lead` (conversionScore, emailStatus, stage, timestamps)
- `db.leadActivity` (previous heat scores for trend detection)
- `db.communication` (buyingSignals JSON, direction, timestamps)
- `db.meeting` (upcoming scheduled/confirmed meetings)
- `db.outreachMessage` (sent/opened/replied messages)
- `db.pipelineStage` (stage ordering)

### Dependencies Used
- `import { db } from '@/lib/db'`
- `import { sendNotification } from '@/lib/notification-engine'`
- `import { logAuditEvent } from '@/lib/lead-audit'`

### Verification
- Zero new lint errors
- Dev server running (HTTP 200)
