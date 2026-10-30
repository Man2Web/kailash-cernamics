# Build phases — paste one prompt per Claude Code session

Rules: one phase per session · approve the plan first · test on staging · commit · then next phase.

| Phase | Delivers | Done when |
| --- | --- | --- |
| 0 | Repo, CI, Docker, Coolify deploy, auth, app shell | Login works on staging over HTTPS |
| 1 | Masters: org, users/roles, products, parties | Admin creates a tile and a sanitary product with images |
| 2 | Inventory: GRN, batches, ledger, transfers, breakage | Stock by shade and godown matches a manual count on test data |
| 3 | Sales: quotation, order, invoice, challan, returns | Room-wise quote converts to invoice with correct boxes and GST |
| 4 | Purchase, landed cost, schemes | GRN with freight updates batch landed cost |
| 5 | Accounts: receipts, payments, credit control | Overdue party's order goes to approval |
| 6 | Tally sync agent, both directions | 100 test vouchers round-trip, zero duplicates |
| 7 | GST e-invoice / e-way bill, WhatsApp, emails | IRN generated in GSP sandbox |
| 8 | CRM, field sales PWA, dashboards, reports | Owner dashboard loads under 2 s |
| 9 | Data migration, UAT, go-live | Client signs UAT sheet |

---

## Phase 0 — Foundation
```text
Read CLAUDE.md and everything in docs/reference/. If docs/reference shows a different stack or look,
propose changes to CLAUDE.md and docs/ui-guidelines.md first and wait for my approval.
Then set up the pnpm + Turborepo monorepo with apps/web, apps/api, packages/shared.
Add Dockerfiles for web, api and worker, docker/docker-compose.yml for local dev (postgres, redis,
minio), GitHub Actions for lint/typecheck/test/build, and keep .env.example in sync.
Implement auth in the API: email + password (argon2), JWT access 15 min + refresh token rotation in
httpOnly cookies, login rate limiting, optional TOTP 2FA for admin, login history.
Build the web app shell per docs/ui-guidelines.md: sidebar, top bar with branch switcher, Ctrl+K search
placeholder, login page, light/dark theme using CSS variables. Add /health on web and api.
Update docs/deploy.md with exact Coolify steps for crm.kailashceramics.com.
Show me the plan first.
```

## Phase 1 — Masters
```text
Read docs/specs/schema.md, docs/specs/business-rules.md and docs/client/.
Build masters: company, branch (GSTIN, state code, Tally company name), godown, rack; users, roles and a
permission matrix UI with per-role discount limit; brand, category, series, size, finish, color;
product with uom_type, pcs_per_box, sqft_per_box, sqm_per_box, HSN, GST rate, MRP, allow_loose_sale,
multiple images stored in MinIO; product variants for sanitary colours; price lists by customer segment;
parties with segment, sites, credit limit/days, GSTIN validation (format + checksum); influencers.
Each master: list page (search, filters, column chooser, Excel export), create/edit form,
bulk Excel import with a validation preview using docs/client/templates, audit log.
Seed realistic sample tile and sanitary data. Show me the plan first.
```

## Phase 2 — Inventory
```text
Read docs/specs/schema.md and business-rules.md (units, shade, stock types, breakage).
Implement the stock ledger service in apps/api: every stock change goes through it inside a DB
transaction and maintains stock_balance; no other code may change stock.
Build GRN (PO can be a stub for now) capturing batch_no, shade, caliber, grade per line, posting ledger
rows. Add stock transfer between godowns/racks, stock adjustment with approval, breakage entry with
photos (moves to DAMAGED), display stock moves.
Screens: stock summary product → batch/shade → godown/rack showing "box + pcs (sq ft)"; stock ledger
drill-down; low stock, dead stock and ageing reports.
Put unit conversion helpers in packages/shared with full unit tests. Show me the plan first.
```

## Phase 3 — Sales
```text
Read business-rules.md (room-wise quotation, pricing, approvals, GST, number series) and the invoice/
quotation formats in docs/client/.
Build: room-wise quotation builder (rooms, areas, wastage, auto boxes), revisions, validity, branded
PDF via Playwright matching docs/client formats, WhatsApp share link and email.
Convert quotation → sales order with single-batch reservation and a split dialog when a batch is short;
discount and credit-limit approvals via approval_request.
Invoice with GST logic (CGST/SGST vs IGST), number series per branch/FY, cancel instead of edit.
Delivery challan, dispatch with vehicle, loading/unloading charges, proof-of-delivery photo.
Sales return to SALEABLE or DAMAGED with credit note. Shade-mismatch warning per site.
Every posted invoice/credit note inserts a tally_sync_queue row (sync itself comes in Phase 6).
Show me the plan first.
```

## Phase 4 — Purchase, landed cost, schemes
```text
Read business-rules.md (purchase and landed cost) and schema.md.
Build purchase orders to suppliers/brands with expected delivery; GRN against PO (replace the Phase 2
stub) with truck/container number, freight, unloading and other charges; landed cost allocation by
value or weight (setting) stored on each batch; purchase invoice matching PO and GRN (quantity and
rate variance warnings); debit notes and purchase returns.
Brand schemes: target per period (value or sq ft), slab rebates, progress and expected rebate on the
dashboard, scheme claims.
Posted purchase invoices and debit notes insert tally_sync_queue rows. Show me the plan first.
```

## Phase 5 — Accounts and credit control
```text
Read business-rules.md (pricing, credit and approvals).
Build receipts (cash, UPI, cheque, NEFT, card) with allocation to invoices (auto oldest-first + manual),
advances, and payments to suppliers. Party outstanding with ageing buckets (0-30, 31-60, 61-90, 90+),
party statement PDF, WhatsApp payment reminders.
Credit control: block or hold orders beyond credit limit or credit days, approval flow, override log.
Cheque register with bounce handling. Influencer commission/points accrual when invoices are fully paid,
and payout entries. Receipts/payments insert tally_sync_queue rows. Show me the plan first.
```

## Phase 6 — Tally two-way sync
```text
Read docs/specs/tally.md completely; it is the contract.
API side: implement /api/tally/queue, /ack, /inbound, /heartbeat with per-branch agent keys (hashed,
rotatable), XML builders for ledgers, stock items, units, godowns, sales, credit notes, purchases,
debit notes, receipts and payments; dependency ordering (masters first); retry backoff 1/5/30 min then
FAILED; inbound processing that matches ledgers by GUID and allocates Tally receipts to ERP invoices by
bill reference; ledger balance and outstanding snapshots; Sync screen with filters, error text, retry;
daily ERP-vs-Tally reconciliation report; heartbeat alerts.
Agent side: apps/tally-agent as a .NET 8 Windows Service with a JSON config (ERP URL, key, Tally URL,
company), polling loop, XML post to localhost:9000, response parsing, AlterID-based exports, rotating
log files, and an installer (single exe or MSI) with install/uninstall/status commands.
Write integration tests with recorded Tally XML responses. Document install steps in docs/runbook.md.
Show me the plan first.
```

## Phase 7 — GST compliance and messaging
```text
Integrate the GSP configured in .env (sandbox first): generate IRN + signed QR on invoice post when
applicable, cancel IRN within the allowed window, generate/cancel e-way bills from invoice or challan
(vehicle, distance, transporter), store all reference numbers, retry queue and clear error messages.
Print QR and IRN on invoice PDF. WhatsApp Business API templates for quotation share, invoice share,
payment reminder and approval requests; email equivalents via SMTP. Notification centre in the app.
Show me the plan first.
```

## Phase 8 — CRM, field app, dashboards, reports
```text
Build CRM: leads (source, requirement, assigned salesperson), follow-ups with reminders, site visits
with GPS check-in and photos, lead → quotation conversion, influencer management.
Field sales PWA (installable, offline-tolerant for lead capture): today's follow-ups, check-in, stock
lookup with shade availability, quick quotation. Godown PWA: GRN and dispatch with barcode/QR scan.
Dashboards per role (owner, branch manager, sales, accounts) and reports: sales by brand/category/
salesperson/branch, margin by brand, fast/slow movers by shade and size, dead stock, ageing, breakage,
scheme progress, influencer performance, outstanding. All reports filterable and exportable.
Owner dashboard must load under 2 seconds (use summary tables or materialised views).
Show me the plan first.
```

## Phase 9 — Migration, UAT, go-live
```text
Build import tools with validation previews and error files: products (Tally stock items + client
Excel), parties (Tally ledgers with GUID mapping), opening stock by batch/shade per godown, opening
outstanding by invoice from Tally bill-wise details. Add a go-live checklist page in Settings.
Generate a UAT test sheet (docs/uat.md) covering every flow in docs/phases.md with expected results.
Run the full checklist in docs/testing-golive.md and report what is not yet passing.
Show me the plan first.
```
