# Kailash Ceramics ERP

Exclusive ERP for a tiles & sanitaryware dealer. Single company, multiple branches and godowns.
Production: https://crm.kailashceramics.com  ·  Staging: https://staging.crm.kailashceramics.com

## Inputs to read first
- docs/reference/  → Geetha Timbers stack and UI. If it shows a different stack or look than below,
  STOP and propose updating this file to match before writing code.
- docs/client/     → client branding, invoice/quote formats, product master samples.
- docs/specs/      → schema, business rules, Tally sync. These are the source of truth.

## Stack (do not change without asking)
- apps/web: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, TanStack Table/Query, RHF + Zod
- apps/api: NestJS, Prisma, PostgreSQL 16, Redis 7 + BullMQ, MinIO
- apps/tally-agent: .NET 8 Windows Service
- packages/shared: Zod schemas + types + unit-conversion and GST helpers shared by web and api
- Package manager: pnpm workspaces + Turborepo
- Deploy: Docker images via Coolify on Hostinger KVM 4

## Non-negotiable rules
1. Money is stored as integer paise (BigInt). Never use float for money.
2. Quantities: tiles are stored in PIECES (integer). Boxes and sq ft are always derived from the
   product's pcs_per_box and sqft_per_box. Sanitary items are stored in units.
3. Stock never changes except through a stock_ledger row. No direct UPDATE of stock balances;
   balances are maintained by the ledger service inside the same DB transaction.
4. Every tile stock row carries batch_id (shade + caliber + grade). An order line reserves from a
   single batch unless the user explicitly splits it.
5. Every write endpoint is idempotent via an Idempotency-Key header.
6. Every table has created_at, updated_at, created_by, updated_by, branch_id where relevant, and soft
   delete (deleted_at). Posted documents (invoice, GRN, receipt) are never edited; they are cancelled
   and re-issued.
7. Every mutation writes an audit_log row (who, what, before, after).
8. Role-based permissions are checked in the API, never only in the UI.
9. GST: CGST/SGST vs IGST decided by branch state vs place of supply. HSN mandatory on products.
10. Tally sync is asynchronous through tally_sync_queue. Never call Tally from a request handler.
11. Dates stored in UTC, displayed in Asia/Kolkata. Indian number format (12,34,567.00).
12. No secrets in code. Use env vars; document each in .env.example.
13. Never copy third-party product UI, wording or branding (e.g. SixOrbit). Original design only.

## Workflow
- Before coding a feature: read the relevant docs/specs file, then show a short plan and wait for approval.
- Prisma migrations only through `pnpm db:migrate`; never edit an applied migration.
- Each feature ships with: API e2e test, Zod validation, permission check, audit log,
  UI empty/loading/error states.
- Run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
- Commit in small steps with conventional commits. Update CHANGELOG.md per phase.
- Add any new error + fix you hit to docs/runbook.md.

## UI rules
- Follow docs/ui-guidelines.md. Reuse components in apps/web/components/ui before creating new ones.
- Every list page: search, filters, column chooser, export to Excel, server-side pagination.
- Every form: keyboard friendly (Enter → next field, Ctrl+S saves), autosave drafts.
