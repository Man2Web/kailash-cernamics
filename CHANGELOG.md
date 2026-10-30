# Changelog

## [0.2.0] — 2026-10-24 (tile & sanitary inventory)

### Shade & lot control
- Shade lot finder: requirement in sq ft (with wastage), boxes or pieces → lots that can supply the whole order from ONE shade, ranked oldest-first, then exact clear, then a sellable remainder; odd leftovers under two boxes flagged; shade last delivered to the customer/site marked; same size/finish alternatives.
- Shade-wise stock per lot with ageing, site shade history (mixed-shade flag).

### Godown operations
- Blind physical stock counts by godown/rack/brand with phone-friendly count sheet, scan-to-count and variances posted only after approval.
- QR labels for box lots and racks (A4 sheet or 100×50 mm thermal) and a scan lookup (USB scanner or phone camera).
- Inter-branch transfers held IN_TRANSIT at the destination until received; damage and shortage become transit breakage.
- In-transit and samples-out columns, sq m alongside sq ft, load weight on transfers and challans.

### Sanitary, samples & display
- Sanitary/CP colour variants stocked as their own lots from the GRN.
- Samples issued to customers/architects/leads (SAMPLE stock) with return, damage and write-off; overdue tracking with WhatsApp reminders.
- Showroom display boards backed by DISPLAY stock.
- Supplier breakage claims valued at landed cost with settle; breakage rate by supplier/brand.

### Replenishment & analysis
- Reorder planner from 90-day sales speed, lead time (product or brand), safety days, reorder level and open POs, in full boxes, grouped by brand → draft PO per supplier.
- Stock analysis by size, finish, application, brand, category, godown or grade with days of cover.
- Products carry applications (floor, wall, parking, elevation…), lead time and safety days; brands a preferred supplier and lead time.

### Not done yet
- Adding found stock from the count screen (API only); colour picker on GRN edit and PO lines; claim settlement does not raise a debit note; vehicle capacity check.

## [0.1.0] — 2026-10-24 (first build)

### Phase 0 — Foundation
- pnpm + Turborepo monorepo: apps/web (Next.js 15), apps/api (NestJS 11 + worker), packages/shared, prisma.
- Full Prisma schema (~70 tables) from docs/specs/schema.md with the initial migration; embedded Postgres 16 for local dev (`pnpm db:start`).
- Auth: argon2 passwords, 15-min JWT access + rotating refresh token in httpOnly cookies with reuse detection, login rate limit, optional TOTP 2FA, login history.
- Global permission guard, Idempotency-Key on every write, audit log on every mutation, soft delete, branch header.
- Web shell matching Geetha Timbers' look (recoloured): sidebar by module, branch switcher, Ctrl+K search, notifications, light/dark; shared list table (search, filters, column chooser, Excel export, server paging) and keyboard-friendly forms (Enter → next, Ctrl+S, draft autosave).
- Dockerfiles (web, api/worker), docker-compose, GitHub Actions CI, Coolify steps in docs/deploy.md, `/health` on web and `/api/health`.

### Phase 1 — Masters
- Company, branches (GSTIN checksum), godowns, racks, number series, vehicles; users with branch access; roles with permission matrix and discount limits.
- Brands, categories, series, sizes, finishes, colours; products (tile box/sq ft fields, images, sanitary colour variants); segment price lists with price lookup; customers/suppliers with sites and credit terms; influencers.
- Product and party import from the client template with validation preview.

### Phase 2 — Inventory
- Stock ledger service is the only way stock changes; balances per product/batch/godown/rack/stock type kept in the same transaction.
- Stock by product → shade/batch → godown/rack shown as "box + pcs (sq ft)"; ledger drill-down; transfers and display moves; adjustments and write-offs through approval; breakage with photos; low, dead, ageing and stock value reports.

### Phase 3 — Sales
- Room-wise quotation builder (floor/wall/skirting/highlighter, wastage, auto boxes), revisions, validity, WhatsApp share, A4 print.
- Quote → sales order with single-batch reservation and split on shortage; discount and credit approvals.
- Invoices with CGST/SGST vs IGST and branch/FY numbering; post, cancel and re-issue (never edit); Tally queue.
- Challans, dispatch with vehicle and proof of delivery; returns to saleable/damaged with credit notes; shade-mismatch warning per site.

### Phase 4 — Purchase
- Purchase orders, GRN with batch/shade/caliber/grade and freight/unloading/other charges allocated by value or weight to batch landed cost.
- Purchase invoices with quantity/rate variance warnings, debit notes / purchase returns, brand schemes with slab progress and claims.

### Phase 5 — Accounts
- Receipts (cash, UPI, cheque, NEFT, card) with oldest-first or manual allocation and advances; cheque register with bounce reversal; supplier payments.
- Outstanding with 0-30/31-60/61-90/90+ ageing, party statements, WhatsApp reminder links, credit status, influencer accrual on full payment.

### Phase 6 — Tally
- Agent API (queue, ack with 1/5/30-min backoff, inbound ledgers/receipts/balances, heartbeat) with hashed per-branch keys; XML builders; sync screen, retry and daily reconciliation.
- .NET 8 Windows service agent (apps/tally-agent) with install steps.

### Phase 7 — GST & messaging (groundwork)
- NIC e-invoice JSON builder and GSP adapter (`GSP_PROVIDER=mock` for testing), e-way bill endpoint; WhatsApp Business API adapter with wa.me fallback.
- E-invoice panel on posted invoices (payload preview, generate IRN, e-way bill); IRN, ack and e-way numbers on the invoice print.
- Direct invoices refuse line discounts above the user's role limit (orders go through approval).

### Phase 8 — CRM, dashboards, reports
- Leads, follow-ups, site visits with GPS and photos, lead → quotation; owner dashboard; 11 reports with Excel export; PWA manifest.

### Phase 9 — Go-live tools
- Opening stock import by batch/shade per godown/rack and opening outstanding import from Tally bill-wise details, both with validation preview.
- Go-live checklist page (Settings) with pass/warning/fail checks; UAT sheet in docs/uat.md.
- Influencer commission ledger and payout recording.

### Not done yet
- Playwright PDF rendering (print views use the browser's Save as PDF); signed QR image on the invoice print; SMTP email.
- Field PWA offline lead capture and barcode/QR scanning for GRN and dispatch.
- Edit screens for draft POs/GRNs/purchase invoices (API supports it); price list bulk import.
- Tally XML verified only against the spec, not a live TallyPrime; ESLint (lint currently runs the type checker); Docker images not yet built on a machine with Docker.
- Real client inputs: branch GSTIN (seed uses a placeholder that the go-live checklist flags), logo, price/approval rules, invoice formats.
