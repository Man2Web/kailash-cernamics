# Deployment (Coolify + standalone PostgreSQL)

The app talks to PostgreSQL directly through Prisma (`DATABASE_URL`). There is no Supabase dependency at runtime.

## Required environment variables
| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Coolify **internal** Postgres URL (`postgresql://user:pass@<db-host>:5432/<db>`) |
| `ATTENDANCE_QR_SECRET`, `CRON_SECRET` | random, min 16 chars |
| `SERVER_ACTION_ALLOWED_ORIGINS` | public host(s), e.g. `erp.example.com` |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ATTENDANCE_URL` | public URLs. **Build variables** (inlined at build time) |
| `TALLY_BRIDGE_API_KEY` | Tally bridge auth |

## Build / run
`Dockerfile` builds with `prisma generate && next build` and starts with `npm start` on port 3000 (`HOSTNAME=0.0.0.0`).
Health check: `GET /api/public/health` (checks DB connectivity).

## Schema migrations (controlled step, never on startup)
Run once per release from the app container / Coolify "post-deployment command":

    npm run db:migrate        # prisma migrate deploy

## Moving data from Supabase (one-off)
`scripts/migrate-data-from-supabase.cjs` copies every table (read-only on Supabase), writes a JSON backup to `BACKUP_DIR`
(keep outside git) and loads the target inside one transaction, then prints source vs loaded row counts.
Run it only against a database that already had `npm run db:migrate` applied and is empty.
`NO_LOAD_TABLES=tally_connections` skips loading tables whose live Supabase layout differs from the schema.

## Backups and restore
Enable scheduled backups on the Coolify PostgreSQL resource (Backups tab). Restore test:

    createdb restore_test && pg_restore -d restore_test <backup.dump>   # or psql -f for plain SQL dumps
    # compare row counts with production before relying on a backup
