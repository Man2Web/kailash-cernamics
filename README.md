# Kailash Ceramics ERP

Exclusive Tiles & Sanitary ERP for crm.kailashceramics.com
Hosting: Hostinger KVM 4 (82.29.165.177, Ubuntu 24.04 + Coolify) · Two-way TallyPrime sync

## Run it locally

Requirements: Node 22.18+ (24 works), pnpm 12 (`corepack enable`). No Docker needed.

```bash
pnpm install
cp .env.example .env            # then set DATABASE_URL to postgresql://erp:erp@127.0.0.1:5442/kailash_erp
pnpm db:start                   # embedded Postgres 16 on 127.0.0.1:5442 (keep it running)
pnpm db:deploy                  # apply migrations
pnpm db:seed                    # roles, branch, logins + demo tiles/sanitary data
pnpm dev                        # web http://localhost:3000 · api http://localhost:4000/api
```

Seed logins (password `Kailash@123`, change before sharing any environment):
admin@ · manager@ · sales@ · accounts@ · godown@kailashceramics.com

Checks before calling anything done: `pnpm lint && pnpm typecheck && pnpm test`
(API e2e tests use `TEST_DATABASE_URL` and truncate that database).

With Docker: `docker compose -f docker/docker-compose.yml up -d postgres redis minio`, or the whole
stack with `--profile app up -d --build`.

## Layout

| Path | Purpose |
| --- | --- |
| apps/web | Next.js 15 App Router UI (shadcn/ui, TanStack Table/Query, RHF + Zod), PWA manifest, print views |
| apps/api | NestJS API + `src/worker.ts` (BullMQ). Modules: auth, core (ledger, numbering, approvals, credit, audit, Tally queue, files), org, users, catalogue, parties, inventory, purchase, sales, accounts, crm, tally, reports, gst |
| apps/tally-agent | .NET 8 Windows service that syncs TallyPrime (localhost:9000) with the ERP over outbound HTTPS |
| packages/shared | Zod schemas, enums, permissions, unit conversion (box/pcs/sq ft), GST, money (paise), FY numbering, GSTIN check |
| prisma | schema.prisma, migrations, seed |
| docker | Dockerfiles (web, api/worker), docker-compose for local infra |
| docs | Specs, phases, deploy, runbook, UAT sheet |

## Project docs

| Path | Purpose |
| --- | --- |
| CLAUDE.md | Standing rules Claude Code reads every session |
| docs/architecture.md | System diagram + monorepo layout |
| docs/specs/schema.md | Database tables and key fields |
| docs/specs/business-rules.md | Tiles/sanitary rules (units, shade, breakage, quotes, GST) |
| docs/specs/tally.md | Two-way Tally sync spec + sample XML |
| docs/ui-guidelines.md | UI rules and navigation |
| docs/deploy.md | DNS, exact Coolify steps, hardening, backups, monitoring |
| docs/phases.md | Phase 0–9 prompts |
| docs/testing-golive.md | Testing, security, migration, go-live checklists |
| docs/uat.md | UAT test sheet for client sign-off |
| docs/maintenance-amc.md | AMC terms for the client |
| docs/runbook.md | Common errors and fixes (grows during the build) |

## Open items

- [ ] DNS: add A record `crm` → 82.29.165.177 in the Hostinger account that holds kailashceramics.com
- [ ] Client inputs in docs/client/ (logo, branch GSTINs, product master, invoice/quote formats, price & approval rules)
- [ ] GSP sandbox credentials (e-invoice / e-way bill), WhatsApp Business API, SMTP
- [ ] TallyPrime test copy on a Windows PC for the sync agent
