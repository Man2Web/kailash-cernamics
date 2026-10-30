# Architecture

Only outbound HTTPS crosses the internet; Tally stays on the client's office LAN.

```
                 Staff browsers + field PWA
                            │ HTTPS
┌──────────── KVM 4 VPS · Coolify (82.29.165.177) ────────────┐       ┌──────────────────────────┐
│  Traefik proxy · SSL for crm.kailashceramics.com             │──────▶│ GSP e-invoice / e-way    │
│        │                        │                           │──────▶│ WhatsApp Business API    │
│  ┌─────▼───────┐         ┌──────▼──────┐                    │──────▶│ Off-site backups (B2/S3) │
│  │ Next.js web │         │ NestJS API  │◀──────────────┐    │       └──────────────────────────┘
│  └─────────────┘         └─────────────┘               │    │
│  ┌─────────────┐         ┌─────────────┐               │    │   ┌──── Client office LAN ─────┐
│  │ Worker      │         │ Redis 7     │      outbound HTTPS │   │                            │
│  │ (BullMQ)    │         └─────────────┘      (agent starts) └───┤  Tally sync agent          │
│  └─────────────┘         ┌─────────────┐                    │   │  (.NET Windows service)    │
│  ┌─────────────┐         │ MinIO       │                    │   │           │ XML            │
│  │PostgreSQL 16│         └─────────────┘                    │   │  TallyPrime :9000 (local)  │
│  └─────────────┘                                            │   └────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

The sync agent always initiates the connection, so the client office needs no open ports or static IP.

## Monorepo layout

```
kailash-ceramics-erp/
├── CLAUDE.md
├── docs/
│   ├── specs/            schema.md, business-rules.md, tally.md, one file per module
│   ├── reference/        Geetha Timbers stack + screenshots (input)
│   ├── client/           client formats, logo, product master (input)
│   ├── ui-guidelines.md
│   ├── deploy.md
│   └── runbook.md
├── apps/
│   ├── web/              Next.js 15 (screens, PWA, PDF templates)
│   ├── api/              NestJS modules: auth, masters, inventory, sales, purchase,
│   │                     accounts, crm, gst, tally, reports, notifications
│   │   └── src/worker.ts BullMQ processors (same codebase, separate container)
│   └── tally-agent/      .NET 8 Windows Service + installer
├── packages/
│   ├── shared/           Zod schemas, enums, unit-conversion and GST helpers
│   └── ui/               shared React components (optional)
├── prisma/               schema.prisma, migrations, seed
├── docker/               Dockerfiles, docker-compose.yml (dev)
└── .github/workflows/    CI: lint, typecheck, test, build images
```

Unit-conversion and GST helpers live in packages/shared so the billing screen and the API compute identical numbers.
