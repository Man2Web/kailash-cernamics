# Deployment (Hostinger KVM 4 + Coolify)

Production: KVM 4 · 82.29.165.177 · Ubuntu 24.04 + Coolify (4 vCPU, 16 GB RAM, 200 GB)
Staging:    KVM 2 · 200.234.43.196 (recommended, keeps production isolated)

## DNS (in the Hostinger account that holds kailashceramics.com)

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| A | crm | 82.29.165.177 | Production app |
| A | staging.crm | 200.234.43.196 | Staging |
| CAA | @ | 0 issue "letsencrypt.org" | Restrict SSL issuers |

API is served under https://crm.kailashceramics.com/api (no separate subdomain needed).

## Containers per environment

| Service | Image | Notes |
| --- | --- | --- |
| web | Next.js standalone build | Port 3000, behind Coolify's Traefik |
| api | NestJS | Port 4000, routed on /api |
| worker | same image as api, `node dist/worker` | BullMQ: Tally queue, PDFs, WhatsApp, reports |
| postgres | postgres:16 | Not exposed publicly |
| redis | redis:7 | AOF persistence on |
| minio | minio/minio | Private bucket |

## Coolify steps
1. Add the GitHub repo as a resource (Docker Compose or separate Dockerfile apps).
2. Set domain crm.kailashceramics.com → web; path /api → api. Coolify issues Let's Encrypt SSL.
3. Add environment variables from .env.example (production values) in Coolify, not in git.
4. Enable auto-deploy on `main` for staging; production deploys from tagged releases only.
5. Run migrations as a pre-deploy command: `pnpm prisma migrate deploy`.

### Current setup: one Docker Compose resource (temporary sslip.io URL)

The stack in `/docker-compose.coolify.yml` runs postgres, redis, api (runs migrations + seed on start),
worker and web on the KVM 4 alongside other projects (CPU/memory limits set per service).
1. Coolify → Projects → **Kailash Ceramics ERP** → + New → Private Repository (GitHub App) →
   `Man2Web/CRM-Kailash-Ceramics`, branch `main`, Build Pack **Docker Compose**,
   Docker Compose Location `/docker-compose.coolify.yml`.
2. Service **web** → Domains: `https://kailash-ceramics.82.29.165.177.sslip.io:3000`
   (later add `https://crm.kailashceramics.com:3000` once the A record `crm → 82.29.165.177` exists
   in the vnetindia/man2web DNS panel; the domain is not in the Hostinger account).
3. Environment Variables: Coolify fills the SERVICE_* secrets. Owner's first password =
   `SERVICE_PASSWORD_OWNER` (login `admin@kailashceramics.com`). `SEED_DEMO=true` loads demo data;
   set `false` before go-live. Demo role logins stay disabled (`SEED_DEMO_USERS=false`).
4. Deploy. Health: `https://<domain>/health` (web) and `https://<domain>/api/health` (through web).

### Exact Coolify setup (one project, three apps + three databases)

1. **Project** → New → `kailash-erp`, environment `production` (and `staging` on the KVM 2 server).
2. **Databases** (Coolify → + New → Database): PostgreSQL 16 (`kailash_erp`), Redis 7 (enable AOF),
   MinIO (private bucket `kailash-erp`). Keep "Make it publicly available" OFF. Copy their internal URLs.
3. **api** (+ New → Application → GitHub repo `CRM-Kailash-Ceramics`, branch `main`):
   Build pack *Dockerfile*, Dockerfile location `docker/Dockerfile.api`, base directory `/`,
   port `4000`. Domain `https://crm.kailashceramics.com/api` (Coolify/Traefik path routing; strip
   prefix OFF — the API serves under `/api`). Health check path `/api/health`.
   Pre-deployment command: `cd /app && pnpm exec prisma migrate deploy`.
4. **worker**: same repo and Dockerfile as api, no domain, custom start command `node dist/worker`.
5. **web**: Dockerfile `docker/Dockerfile.web`, port `3000`, domain `https://crm.kailashceramics.com`,
   build argument `API_URL=http://<api internal hostname>:4000`, health check path `/health`.
6. **Environment variables** (api + worker; Coolify → Environment Variables, mark secrets as
   "Is Literal"/locked): `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   (64 random chars each: `openssl rand -hex 32`), `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=7d`,
   `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `TZ=Asia/Kolkata`,
   `NODE_ENV=production`, plus GSP / WhatsApp / SMTP / Sentry values when those phases go live.
7. First deploy: deploy api (runs migrations), then run once in the api terminal:
   `cd /app && SEED_DEMO=false pnpm exec tsx prisma/seed.ts` to create roles, branch and the owner
   login; change the owner password immediately and enable 2FA in My account.
8. Staging: same steps on 200.234.43.196 with domain `staging.crm.kailashceramics.com` and
   auto-deploy on push to `main`. Production: deploy from tags (`v0.x.y`) only.

## Server hardening (once)
- [ ] SSH key login only; password and root password login disabled
- [ ] Hostinger firewall: 22 (your IP only), 80, 443; everything else blocked
- [ ] Coolify dashboard on its own subdomain with 2FA
- [ ] Unattended security upgrades
- [ ] Fail2ban on SSH

## Backups
- [ ] Coolify scheduled Postgres backup every 6 h, keep 30 days
- [ ] Off-site copy to Backblaze B2 / AWS S3 (Mumbai) with encryption
- [ ] MinIO bucket mirrored nightly off-site
- [ ] Monthly restore test into staging, logged
- [ ] Hostinger weekly VPS snapshot as last resort

## Monitoring
- [ ] Uptime Kuma checking /health every minute; WhatsApp/email alerts
- [ ] Sentry / GlitchTip for web and API errors
- [ ] Disk usage alert at 75%
- [ ] Tally agent silent > 15 min in business hours → alert
