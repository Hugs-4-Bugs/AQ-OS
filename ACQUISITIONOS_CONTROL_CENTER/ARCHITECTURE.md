# AcquisitionOS — Architecture Contract

## Product Identity

AcquisitionOS is an **AI-native Client Acquisition Operating System**.

It is not merely:

- a CRM;
- an AI chatbot;
- an email sender;
- a lead database.

North Star:

> From “Who should I contact?” → “Who should I contact, why now, what should I say, what should I do next, and how do I close them?”

Core operating model:

**Discover → Understand → Decide → Act → Learn → Close**

## Core 12-Stage Workflow

1. Discover
2. Research
3. Find Gaps
4. Opportunity Report
5. Score
6. Personalize
7. Outreach
8. Reply
9. Meeting
10. Pipeline
11. Proposal
12. Close

These stages are the visible backbone. Intelligence, agents, data, integrations, policy, learning, and execution layers sit underneath them.

## Long-Term Product Architecture

```text
AI Assistants
Claude / ChatGPT / Gemini / Others
             |
          MCP / API
             |
AI Gateway / Agent OS
             |
     +-------+--------+
     |       |        |
Model     Agent    Policy
Router    Engine   Engine
     |       |        |
     +-------+--------+
             |
Intelligence Layer
Company Intelligence
Signal Engine
Evidence Engine
Opportunity Graph
ICP Engine
Scoring Engine
Learning / Attribution
             |
Acquisition Workflow
Discover
Research
Find Gaps
Opportunity Report
Score
Personalize
Outreach
Reply
Meeting
Pipeline
Proposal
Close
             |
CRM / Email / Calendar / Other Integrations
```

Do not implement this entire future architecture prematurely. Extend the current system incrementally.

## Lead Discovery Architecture

Expected path:

User targeting
→ niche/industry
→ geography
→ user instructions/script
→ source strategy
→ source adapters
→ query/request
→ parsing
→ normalization
→ relevance filtering
→ verification
→ deduplication
→ persistence
→ Leads UI

User intent is first-class data.

Examples:

- MSP
- SaaS
- real estate
- hospitality
- agencies
- any user-defined niche

The discovery engine must actually satisfy the user's target market and instructions.

### Discovery Failure Rules

If a provider fails, do not report successful discovery.

If zero relevant leads exist, return zero.

If 20 valid leads are found, do not claim 100.

If requested filters are not supported by a source, make the limitation explicit rather than pretending exact matching.

Phone-only leads can remain legitimate leads when genuinely sourced. Never invent email/website.

## Research + Gap Detection

Expected path:

Lead
→ company research
→ signal collection
→ evidence extraction
→ signal interpretation
→ business gap/trigger identification
→ opportunity context
→ report

Distinguish:

**Fact**
> Company posted 10 sales jobs.

**Inference**
> This may indicate sales expansion.

**Opportunity**
> Expansion may create demand for outbound infrastructure.

Every important conclusion should be traceable to evidence where available.

## Evidence Engine

Long-term evidence model:

- source
- URL/reference where legally/technically appropriate
- timestamp
- signal type
- extracted fact
- freshness
- confidence

Do not present unsupported AI guesses as facts.

## Opportunity Intelligence

The product should evolve from Lead Intelligence to Opportunity Intelligence.

An opportunity can relate:

```text
Company
 ├── People
 ├── Technologies
 ├── Signals
 ├── Problems
 ├── Opportunities
 ├── Conversations
 ├── Campaigns
 ├── Meetings
 └── Deals
```

This relationship model should eventually support an Opportunity Graph.

## Scoring Architecture

Do not depend on one opaque score.

Future dimensions:

- Fit
- Intent
- Timing
- Problem strength
- Accessibility
- Engagement
- Commercial opportunity

The weights should be explainable and eventually configurable/learned from outcomes.

## Workflow Automation Architecture

Inputs:

- My Context
- Business Profile
- My Offer
- target market/niche
- workflow instructions
- lead/research context
- user/workspace identity
- plan/entitlement
- credit policy

Expected runtime:

Configuration
→ persistence
→ activation
→ trigger
→ queue/scheduler
→ worker
→ execution
→ result
→ final status

Creating a workflow record does NOT mean execution occurred.

## AI / RAG / Model Architecture

AcquisitionOS should be model-independent.

Concept:

```text
User
  ↓
AI Gateway
  ↓
Model Router
  ├─ Claude
  ├─ OpenAI
  ├─ Gemini
  ├─ other supported models
  └─ future providers
```

Use different models based on:

- task complexity
- quality
- latency
- cost
- context
- user preference
- BYOK configuration

Claude is intended for reasoning-heavy work such as:

- company research
- signal interpretation
- gap detection
- opportunity context
- scoring
- personalization
- reply analysis
- proposals
- sales workflows

Do not hardcode Claude into generic AI logic.

## BYOK

User-provided AI API keys should be:

- encrypted at rest;
- inaccessible to frontend code;
- never logged;
- scoped to provider;
- revocable;
- testable;
- usage-trackable.

## MCP Direction

AcquisitionOS should become callable from external AI assistants.

Potential MCP tools:

- search_prospects
- research_company
- find_business_gaps
- generate_opportunity_report
- score_prospect
- find_contacts
- draft_outreach
- create_outreach
- analyze_reply
- create_meeting
- get_pipeline
- create_proposal
- update_deal
- get_next_best_action

Potential MCP resources:

- company
- prospect
- opportunity
- conversation
- campaign
- deal
- ICP

MCP execution must respect AcquisitionOS authentication, authorization, credits, rate limits, approvals, and audit logs.

## Agent Architecture

Future specialized agents:

- Prospecting Agent
- Research Agent
- Opportunity Agent
- Outreach Agent
- Reply Agent
- Meeting Agent
- Proposal Agent
- Pipeline Agent
- Revenue Agent

Do not build uncontrolled autonomy. Use explicit permissions and policies.

## Approval / Policy Architecture

Potential action permissions:

READ
WRITE
EXECUTE
SEND
DELETE
ADMIN

High-risk actions such as sending outreach, changing billing, deleting data, or other irreversible operations should be policy-controlled and optionally approval-gated.

## Company Brain

Future customer context:

- company information
- products
- ICP
- personas
- value proposition
- pricing
- case studies
- competitors
- objections
- sales playbook
- brand voice
- successful/failed messages
- historical outcomes

This context should improve research, personalization, reply handling, proposals, and sales assistance.

## Learning Architecture

Outcome loop:

Prediction
→ Action
→ Outcome
→ Feedback
→ Model/scoring/playbook improvement

Learn from:

- won deals
- lost deals
- replies
- meetings
- proposals
- conversion rates
- signal quality

Do not silently self-modify production scoring logic. Changes should be observable, evaluated, and deployable safely.

## Spring Boot Backend Architecture

For backend changes, trace:

Controller
→ DTO + validation
→ authorization
→ service
→ transaction boundary
→ repository
→ external provider adapter
→ exception mapping
→ response DTO

For asynchronous work:

Controller/service
→ persistent job/workflow record
→ queue/scheduler
→ worker
→ idempotency check
→ provider calls
→ result persistence
→ status transition
→ observability

Preserve existing architecture unless there is a demonstrated reason to change it.

## Data and Multi-Tenancy

Long-term SaaS model:

Organization
→ Users
→ Roles
→ AI keys
→ Companies
→ Contacts
→ Opportunities
→ Campaigns
→ Conversations
→ Deals
→ Billing

Every data query and mutation must enforce tenant/user authorization according to existing policy.

## Integrations

Long-term integration direction:

- Gmail
- Outlook
- Google Calendar
- Microsoft Calendar
- Slack
- CRM systems
- supported messaging channels
- AI assistants
- MCP

Use adapters/interfaces so core acquisition logic is not coupled to one provider.

## Observability

Important runtime events:

- discovery started/completed/failed
- source success/failure
- research completed
- opportunity created
- workflow queued/started/completed/failed
- provider latency/error
- outreach sent/bounced/replied
- AI request/model/cost metadata where safe
- credit consumption
- authorization denial

Never log secrets or sensitive credentials.

## Architecture Change Rule

Before introducing a new queue, scheduler, database abstraction, provider, AI gateway, or agent framework:

1. Find existing implementation.
2. Understand why it cannot satisfy the requirement.
3. Extend it if possible.
4. Introduce new infrastructure only when justified.
5. Document the reason.

Never create duplicate infrastructure to avoid understanding the current codebase.
