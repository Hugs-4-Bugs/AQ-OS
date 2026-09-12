# Task ID: 4-frontend
# Agent: Frontend Agent
# Task: Phase 12 Frontend - Workflow Tab with Visual Builder, Execution History, DLQ, Metrics, Templates

## Work Log

### Types Update (`src/lib/types.ts`)
- Added `"workflows"` to the `TabId` union type
- Added 13 workflow-related types: WorkflowTriggerType, WorkflowStepType, WorkflowActionType, WorkflowStatus, ExecutionStatus, WorkflowNode, WorkflowEdge, Workflow, WorkflowExecution, WorkflowStepLog, WorkflowMetrics, WorkflowTemplate
- All types align with the Prisma schema (WorkflowDefinition, WorkflowExecution, WorkflowLog models)

### Workflow Tab (`src/components/dashboard/workflow-tab.tsx`)
- Main tab component with 6 sub-tabs: Workflows, Builder, History, Templates, Dead Letter, Metrics
- Sub-tab navigation with animated indicator
- Handles navigation between sub-tabs and workflow editing context
- Passes workflow editing state to builder component
- Uses emerald/teal accent color for workflow-specific branding

### Workflow List (`src/components/dashboard/workflow-list.tsx`)
- Card-based list view of all workflows
- Real API integration: GET /api/workflows with search, status filter, trigger type filter, pagination
- Status badges with color coding: draft=slate, active=emerald, paused=amber, archived=red
- Trigger type labels for all 12 trigger types
- Success rate progress bar per workflow
- Relative time formatting for last run
- Dropdown actions: Edit, Pause/Resume, Execute, Duplicate, Archive
- Empty state with CTA to create first workflow
- Loading skeletons and error handling

### Workflow Builder (`src/components/dashboard/workflow-builder.tsx`)
- Custom SVG-based canvas with pan/zoom (NO external library like ReactFlow)
- Node types with visual distinction: trigger=emerald, action=sky, condition=amber, delay=purple, ai_action=pink, webhook=orange
- SVG bezier curve edges connecting nodes
- Drag-and-drop node positioning on canvas
- Mouse wheel zoom, pan by dragging background
- Zoom controls in bottom-right (zoom in/out/reset/percentage display)
- Add Node dropdown grouped by category (Actions, Conditions, AI Actions, Other) with 14 action types
- Config panel (right sidebar) with dynamic forms based on node action type:
  - send_email: To, Subject, Body, Channel
  - send_whatsapp: Message Template, Phone Field
  - move_to_stage: Target Stage dropdown (9 stages)
  - conditional_branch: Field, Operator, Value
  - wait_delay: Duration, Unit (minutes/hours/days)
  - ai_analyze: Analysis Type
  - generate_ai_message: Channel, Tone, Language
  - add_note: Note Template
  - add_tag: Tags input
  - webhook_call: URL, Method, Headers, Body
- Undo/Redo with history stack (up to 50 entries)
- Auto-connects new nodes to previous node
- Delete nodes and edges
- Save (POST/PATCH /api/workflows) and Execute buttons
- Grid dot background pattern
- Node count and connection count badges

### Workflow Execution History (`src/components/dashboard/workflow-execution-history.tsx`)
- Collapsible card list of executions
- Real API integration: GET /api/workflows/executions with status filter, search, pagination
- Step logs loaded on expand via GET /api/workflows/executions/[id]/logs
- Status badges with color coding and pulse animation for running
- Duration formatting (ms, seconds, minutes)
- Action buttons: Retry (failed), Cancel (running), Pause (running), Resume (paused)
- Expanded step log timeline with color-coded dots
- Step log detail with collapsible input/output JSON views
- Error message display
- Retry count display

### Workflow Templates (`src/components/dashboard/workflow-templates.tsx`)
- Grid of template cards
- Real API integration: GET /api/workflows/templates with search and category filter
- 7 categories: nurture, follow_up, alert, reminder, onboarding, enrichment, outreach
- Template preview dialog with step list
- "Use Template" button creates workflow from template via POST /api/workflows/templates
- Import/Export: JSON file upload/download
- Category and trigger type badges
- Step count badge

### Workflow Dead Letter Queue (`src/components/dashboard/workflow-dead-letter.tsx`)
- Real API integration: GET /api/workflows/dead-letter with search
- Stats summary cards: Total DLQ entries, Recent (24h), Unique Error Types
- Most common errors section (top 5 grouped by error message)
- Retry individual entries: POST /api/workflows/dead-letter/[id]
- Purge all with confirmation dialog: DELETE /api/workflows/dead-letter
- Detail dialog showing execution metadata and error
- Error message display with truncation

### Workflow Metrics (`src/components/dashboard/workflow-metrics.tsx`)
- Real API integration: GET /api/workflows/metrics and GET /api/workflows for top workflows
- Overview cards: Total Workflows, Active, Total Executions, Success Rate
- Secondary metrics: Avg Runtime, Queue Depth, Throughput (24h), Recent Failures
- Status distribution horizontal bar chart (7 statuses with color coding)
- Top Workflows by execution count with success rate progress bars
- Loading skeletons and error state with retry

### Dashboard Layout Integration (`src/components/dashboard/dashboard-layout.tsx`)
- Added lazy import for WorkflowTab
- Added "Workflows" nav item with GitBranchPlus icon (after Competitors, before Settings)
- Added workflow case in renderTab switch
- Short label: "Flows"

### Lint Results
- 0 new errors, 0 new warnings
- All 9 remaining errors are pre-existing (require imports in server.js, custom-server.js, process-manager.js, proxy)

## Stage Summary
- 7 NEW files created
- 2 EXISTING files modified (types.ts, dashboard-layout.tsx)
- Full visual workflow builder with SVG canvas, drag-and-drop, pan/zoom
- All components use real API endpoints (no mock data)
- All data comes from the database via API calls
- Responsive mobile-first design with shadcn/ui components
- Dark mode support throughout
- Loading, error, and empty states for every component

Files Created (7):
  - src/components/dashboard/workflow-tab.tsx
  - src/components/dashboard/workflow-list.tsx
  - src/components/dashboard/workflow-builder.tsx
  - src/components/dashboard/workflow-execution-history.tsx
  - src/components/dashboard/workflow-templates.tsx
  - src/components/dashboard/workflow-dead-letter.tsx
  - src/components/dashboard/workflow-metrics.tsx

Files Modified (2):
  - src/lib/types.ts (added "workflows" to TabId + 13 workflow types)
  - src/components/dashboard/dashboard-layout.tsx (added WorkflowTab lazy import, nav item, and case)
