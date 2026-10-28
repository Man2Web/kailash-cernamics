# Multi-Agent QA Master Test Plan: SixOrbit ERP & TallyPrime

## 1. Executive Summary
This document establishes the architecture, test strategy, agent roles, and verification criteria for the **SixOrbit ERP & TallyPrime Multi-Agent Automated QA System**.

The QA system operates across **5 distinct verification levels**:
1. **UI / Browser Flow Level**
2. **API & Server Action Level**
3. **Database Integrity & Schema Level (PostgreSQL / Supabase)**
4. **Business Logic & Accounting Math Level (GST, Multi-Warehouse Stock)**
5. **Integration & Resilience Level (TallyPrime XML, Offline Tolerance, Idempotency)**

---

## 2. Multi-Agent Organization Matrix

| Agent ID | Specialized Agent | Scope & Responsibilities | Verification Target |
|---|---|---|---|
| **Agent 1** | QA Lead / Orchestrator | Execution pipeline coordinator, run ID lifecycle, parallel batching, release sign-off | `tests/orchestrator/runner.ts` |
| **Agent 2** | Test Data Architect | Isolated test entity generation, factory stamping, unique prefixes | `tests/factories/index.ts` |
| **Agent 3** | Auth & Security QA | Bcrypt password security, session token randomness, RBAC permissions check | `tests/e2e/auth-rbac.test.ts` |
| **Agent 4** | Dashboard & Analytics QA | Real-time KPI aggregation, active entity counting, card metric alignment | `tests/e2e/dashboard.test.ts` |
| **Agent 5** | Master Data QA | Customer, Vendor, Product master CRUD lifecycle, uniqueness, GSTIN | `tests/integration/masters.test.ts` |
| **Agent 6** | Inventory & Stock QA | Multi-warehouse isolation, variant stock tracking, movement integrity | `tests/integration/inventory.test.ts` |
| **Agent 7** | Sales & Invoicing QA | Sales invoice generation, Intrastate (CGST+SGST) vs Interstate (IGST) math | `tests/integration/sales.test.ts` |
| **Agent 8** | Purchase & Procurement QA | Vendor bills, procurement items, purchase order references | `tests/integration/purchase.test.ts` |
| **Agent 9** | Finance & Accounting QA | Invoicing payment settlements, partial status progression, balance updates | `tests/integration/finance.test.ts` |
| **Agent 10** | Reports & Analytics QA | Sales report reconciliation, database aggregate matching | `tests/integration/reports.test.ts` |
| **Agent 11** | Settings & Admin QA | Company profile, branch configuration, settings persistence | `tests/integration/administration.test.ts` |
| **Agent 12** | TallyPrime Integration QA | XML envelopes, ledger/stock item/voucher mapping, offline tolerance, parser | `tests/tally/tally-integration.test.ts` |
| **Agent 13** | Database Integrity QA | Timestamp tracking (`createdAt`, `updatedAt`), foreign key orphan validation | `tests/database/integrity.test.ts` |
| **Agent 14** | API & Server Action QA | REST endpoints, sync status handlers, fallback tolerance | `tests/api/api-suite.test.ts` |
| **Agent 15** | UI / Form Validation QA | Form schema validations (Zod, React Hook Form), mandatory constraints | Client form components |
| **Agent 16** | Security & Secret Leak QA | Environment variable privacy, `SUPABASE_SERVICE_ROLE_KEY` isolation | `tests/security/security.test.ts` |
| **Agent 17** | Performance & Latency QA | Benchmark query execution times (< 1000ms SLA) | `tests/performance/performance.test.ts` |
| **Agent 18** | Regression Pipeline QA | Multi-step cross-module transactions (Master -> Stock -> Invoice -> Payment -> Tally) | `tests/regression/regression-suite.test.ts` |
| **Agent 19** | Safe Data Cleanup QA | Scoped purging of only `TEST_RUN_ID`-tagged entities without touching prod | `tests/helpers/cleanup.ts` |
| **Agent 20** | Final Release Gatekeeper | Automated quality gate evaluating 100% pass criteria and database confirmations | `tests/release/final-qa.test.ts` |

---

## 3. Test Execution Command
To execute the automated QA pipeline:
```bash
npm run test:qa
```
