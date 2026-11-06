# AcquisitionOS — Master Documentation Index

**Branch:** `develop`
**Verified SHA:** `bd7e0f12383f1f588338f908f7515457f9d9654d`
**Last Updated:** 2026-11-06
**Status:** PRODUCTION READINESS AUDIT — IN PROGRESS

---

## Document Status Legend

| Label | Meaning |
|---|---|
| ✅ VERIFIED | Checked against current `develop` source code |
| ⚠️ UNVERIFIED | Claims not yet tested against running application |
| 🔶 PLANNED | Describes intended architecture, not yet implemented |
| 📜 HISTORICAL | Superseded — retained for reference only |
| ❌ STALE | Contains outdated information — needs update |

---

## 1. Core Documents (This Audit)

| Document | Path | Status |
|---|---|---|
| Master Documentation Index | `docs/MASTER-DOCUMENTATION-INDEX.md` | ✅ VERIFIED (this file) |
| Critical Issue Register | `docs/CRITICAL-ISSUE-REGISTER.md` | ✅ VERIFIED |
| Production Readiness Checklist | `docs/PRODUCTION-READINESS-CHECKLIST.md` | ✅ VERIFIED |
| Vercel Preview Deployment Runbook | `docs/VERCEL-PREVIEW-RUNBOOK.md` | ✅ VERIFIED |

## 2. Architecture & Codebase

| Document | Path | Status |
|---|---|---|
| System Architecture | `docs/02-architecture/SYSTEM-ARCHITECTURE.md` | ⚠️ UNVERIFIED |
| Database Schema | `docs/02-architecture/DATABASE-SCHEMA.md` | ⚠️ UNVERIFIED |
| File Structure | `docs/02-architecture/FILE-STRUCTURE.md` | ⚠️ UNVERIFIED |
| Architecture Diagram | `docs/02-architecture/ARCHITECTURE-DIAGRAM.md` | ⚠️ UNVERIFIED |
| Codebase Map | `docs/CODEBASE-MAP.md` | ⚠️ UNVERIFIED |
| Architecture Decision Records | `docs/technical/ARCHITECTURE-DECISION-RECORDS.md` | ⚠️ UNVERIFIED |
| Data Flow Diagrams | `docs/technical/DATA-FLOW-DIAGRAMS.md` | ⚠️ UNVERIFIED |
| LOCAL_ARCHITECTURE.md | `LOCAL_ARCHITECTURE.md` | 📜 HISTORICAL |

## 3. Authentication & Security

| Document | Path | Status |
|---|---|---|
| Authentication | `docs/05-features/AUTHENTICATION.md` | ⚠️ UNVERIFIED |
| Security Audit | `docs/security-audit.md` | ⚠️ UNVERIFIED |
| Threat Model | `docs/security/THREAT-MODEL.md` | ⚠️ UNVERIFIED |
| OWASP Compliance | `docs/security/OWASP-COMPLIANCE.md` | ⚠️ UNVERIFIED |
| Secrets Management | `docs/security/SECRETS-MANAGEMENT.md` | ⚠️ UNVERIFIED |
| Security Policy | `docs/security/SECURITY-POLICY.md` | ⚠️ UNVERIFIED |
| FINAL-SECURITY-HARDENING-REPORT.md | `FINAL-SECURITY-HARDENING-REPORT.md` | 📜 HISTORICAL |
| SECURITY.md | `SECURITY.md` | ⚠️ UNVERIFIED |

## 4. Deployment & Infrastructure

| Document | Path | Status |
|---|---|---|
| Vercel Preview Runbook | `docs/VERCEL-PREVIEW-RUNBOOK.md` | ✅ VERIFIED (this audit) |
| Vercel Deployment | `docs/03-setup-and-deployment/DEPLOYMENT-VERCEL.md` | ⚠️ UNVERIFIED |
| Railway Deployment | `docs/03-setup-and-deployment/DEPLOYMENT-RAILWAY.md` | ⚠️ UNVERIFIED |
| GLM Deployment | `docs/03-setup-and-deployment/DEPLOYMENT-GLM.md` | 📜 HISTORICAL |
| Deployment Runbook | `docs/DEPLOYMENT-RUNBOOK.md` | ⚠️ UNVERIFIED |
| Local Setup | `docs/03-setup-and-deployment/LOCAL-SETUP.md` | ⚠️ UNVERIFIED |
| DEPLOYMENT.md | `DEPLOYMENT.md` | ⚠️ UNVERIFIED |

## 5. Environment & Secrets

| Document | Path | Status |
|---|---|---|
| All Secrets | `docs/04-secrets-and-configuration/ALL-SECRETS.md` | ⚠️ UNVERIFIED |
| ENV-SECRETS-REFERENCE | `docs/ENV-SECRETS-REFERENCE.md` | ⚠️ UNVERIFIED |
| Environment Variables | `ENVIRONMENT-VARIABLES.md` | ⚠️ UNVERIFIED |
| Gmail SMTP Setup | `docs/04-secrets-and-configuration/GMAIL-SMTP-SETUP.md` | ⚠️ UNVERIFIED |
| Google Cloud Setup | `docs/04-secrets-and-configuration/GOOGLE-CLOUD-SETUP.md` | ⚠️ UNVERIFIED |

## 6. Operations & Recovery

| Document | Path | Status |
|---|---|---|
| Incident Runbook | `docs/INCIDENT-RUNBOOK.md` | ⚠️ UNVERIFIED |
| Incident Response | `docs/INCIDENT_RESPONSE.md` | ⚠️ UNVERIFIED |
| Disaster Recovery | `docs/DISASTER_RECOVERY.md` | ⚠️ UNVERIFIED |
| Monitoring Guide | `docs/MONITORING_GUIDE.md` | ⚠️ UNVERIFIED |
| Database DR Runbook | `DATABASE-DR-RUNBOOK.md` | ⚠️ UNVERIFIED |
| Database Recovery | `DATABASE-RECOVERY-AND-SAFETY.md` | ⚠️ UNVERIFIED |

## 7. Testing & QA

| Document | Path | Status |
|---|---|---|
| Production Readiness Checklist | `docs/PRODUCTION-READINESS-CHECKLIST.md` | ✅ VERIFIED (this audit) |
| Critical Issue Register | `docs/CRITICAL-ISSUE-REGISTER.md` | ✅ VERIFIED (this audit) |
| Load Report | `docs/LOAD_REPORT.md` | ⚠️ UNVERIFIED |
| Performance Benchmarks | `docs/technical/PERFORMANCE-BENCHMARKS.md` | ⚠️ UNVERIFIED |

## 8. Product & Business

| Document | Path | Status |
|---|---|---|
| Product Overview | `docs/01-overview/PRODUCT-OVERVIEW.md` | ⚠️ UNVERIFIED |
| Feature List | `docs/01-overview/FEATURE-LIST.md` | ⚠️ UNVERIFIED |
| Product Vision | `docs/product/PRODUCT-VISION.md` | ⚠️ UNVERIFIED |
| Pricing Strategy | `docs/product/PRICING-STRATEGY.md` | ⚠️ UNVERIFIED |
| Go/No-Go | `docs/GO_NO_GO.md` | ⚠️ UNVERIFIED |
| Go Live | `docs/GO_LIVE.md` | ⚠️ UNVERIFIED |

## 9. Duplicate/Conflicting Documents Identified

| Conflict | Files | Resolution |
|---|---|---|
| Launch checklist duplicated | `docs/LAUNCH-CHECKLIST.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/10-kt-knowledge-transfer/LAUNCH-CHECKLIST.md` | Retain all; mark duplicates as HISTORICAL |
| Database schema docs duplicated | `docs/02-architecture/DATABASE-SCHEMA.md`, `docs/technical/DATABASE-SCHEMA.md` | Retain both; mark older as HISTORICAL |
| Incident response duplicated | `docs/INCIDENT-RUNBOOK.md`, `docs/INCIDENT_RESPONSE.md`, `docs/security/INCIDENT-RESPONSE-PLAN.md` | Retain all; consolidate in future |
| Penetration testing duplicated | `docs/security/PENETRATION-TESTING-REPORT.md`, `docs/security/PENTEST-REPORT.md` | Retain both; mark older as HISTORICAL |
| README duplicated | `README.md`, `README 2.md` | `README 2.md` is HISTORICAL |
| Deployment docs scattered | Root-level `DEPLOYMENT.md`, `LOCAL-TO-PRODUCTION-DEPLOYMENT.md`, `docs/03-setup-and-deployment/`, `docs/DEPLOYMENT-RUNBOOK.md` | Retain all; consolidate in future |

## 10. Knowledge Graph Artifacts

| Artifact | Path | Status |
|---|---|---|
| Graphify report | `graphify-out/GRAPH_REPORT.md` | ⚠️ UNVERIFIED — may be stale |
| Graph JSON | `graphify-out/graph.json` | ⚠️ UNVERIFIED |
| Graph HTML | `graphify-out/graph.html` | ⚠️ UNVERIFIED |
| Agent context files | `agent-ctx/` (10+ files) | 📜 HISTORICAL — session-specific |
| ACQUISITIONOS_CONTROL_CENTER | `ACQUISITIONOS_CONTROL_CENTER/` | 📜 HISTORICAL |
| Worklog | `worklog.md` (445KB) | 📜 HISTORICAL — development log |

**No formal, verified knowledge graph exists.** The `graphify-out/` directory contains generated artifacts of unknown age and accuracy. A proper traceability index should be established.

---

## Current System Summary (Verified from Source)

| Property | Value |
|---|---|
| Framework | Next.js 16.1.3 (App Router) |
| Runtime | Node.js v24+ |
| Database | SQLite (Prisma 6.19.2, `provider = "sqlite"`) |
| Auth | JWT (15-min access, 30-day refresh) + TOTP MFA + Google OAuth |
| Admin Security | `super_admin` role, mandatory MFA, 10-min inactivity timeout |
| Deployment | Vercel (configured), Railway/Docker/K8s (configs exist) |
| Build | `prisma generate && next build --webpack` |
| Output | `standalone` |
| Region | `sin1` (Singapore) |
| Total tracked files | 5,189 |
| Total docs/ files | 230+ |
