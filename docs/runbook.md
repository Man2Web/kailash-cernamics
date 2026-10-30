# Runbook

Add every production error and its fix here during the build and after go-live.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tally sync items stuck in PENDING | Agent not running or Tally closed | Check Windows service "KailashTallyAgent"; open TallyPrime and load company |
| Tally error "Ledger does not exist" | Master not synced first | Retry; queue should push master first; check tally_mapping |
| SSL not issued for crm subdomain | A record missing or not propagated | Check DNS A record → 82.29.165.177; redeploy in Coolify |
| Disk almost full | Old Docker images / logs | `docker system prune` (careful), rotate logs, check backup retention |
| `pnpm install` skips Prisma/SWC postinstall | pnpm 10+ blocks dependency build scripts | Packages are listed under `allowBuilds` in pnpm-workspace.yaml; run `pnpm exec prisma generate` if the client is missing |
| `initdb: could not create directory ... File exists` on `pnpm db:start` | Two db-start processes initialising `.pgdata` at once | Stop all `db-start.mjs` processes, delete `.pgdata`, start once |
| E2E tests fail with 429 on login | Login rate limit (5/min) | Tests set `LOGIN_RATE_LIMIT=10000` in apps/api/test/setup.ts |
| `400 Idempotency-Key header is required` | A write call without the header | The web `api()` client adds it; scripts/agents must send a unique key per action |
| `Do not know how to serialize a BigInt` | BigInt money reached JSON.stringify | API patches BigInt.toJSON in main.ts (patchBigIntJson); tests in test/setup.ts |
| Ctrl+S does nothing in a dialog form | Form mounted after the keyboard hook ran | `useFormKeys` returns a callback ref; pass it as `<form ref={...}>` |
| MinIO image can't be pulled | MinIO stopped publishing Docker images | Uploads use the `kailash-ceramics-files` volume (UPLOAD_DIR); set S3_* to use any S3-compatible store |
| Login works locally but not on the hosted URL (logged out at once) | Secure cookies over plain http, or proxy hops wrong | COOKIE_SECURE=auto (follows the request protocol) and TRUST_PROXY=2 on Coolify |
| Everyone hits the login rate limit together on the hosted URL | API saw the proxy's IP for all users | TRUST_PROXY must equal the number of proxies in front of the API (2 on Coolify) |
