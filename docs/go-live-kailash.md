# Go-live: Kailash Ceramics (new app replaces the old one)

The new app (NestJS API + Next.js web + worker + Postgres + Redis) replaces the old Kailash app. It is a different
application with a different database layout, so it is deployed as a NEW Coolify resource first, loaded with your key
data and checked, and only then does the real address move to it. The old app and its database stay untouched until the
last step and can be switched back on at any time.

## What moves and what does not

| Moves (script `scripts/migrate-from-old-kailash.ts`) | Starts fresh |
| --- | --- |
| Users, with their passwords (bcrypt is accepted once at sign-in, then upgraded to argon2) | Invoices, sales orders, quotations |
| Employees and their past attendance | Purchase bills, goods receipts |
| Categories, brands, products (MRP and selling price in a price list) | Stock quantities (load with Settings > Import data or a goods receipt) |
| Customers and suppliers (with opening balances) | Accounting entries, Tally sync history |

Notes
- Products arrive as plain "units". Tiles can be switched to box-and-area once pieces and sq ft per box are entered.
- Products with no HSN get `0000`; invalid GSTINs are blanked. The script lists every case.
- Users who had **custom access** in the old app get their role's access; re-choose their access in
  Office > Employees (Super Admin only).
- The Super Admin account `admin@kailashceramics.com` is created by the new app with the password Coolify generates
  (`SERVICE_PASSWORD_OWNER`); the old Super Admin password is not copied for that one address.

## Safety rules

1. **Nothing live is changed without a backup you have confirmed.** Coolify > `kailash-postgres` > Backups > Backup Now,
   then check a new entry with today's time and a non-zero size.
2. The script opens the old database **read-only** and does a **dry run** unless `CONFIRM=IMPORT_NOW` is set.
3. No secrets are stored in git. Coolify generates the database, JWT and Super Admin passwords.
4. The old app and database are **switched off, not deleted**, for at least two weeks after the switch.

## Steps

### 1. Push the code (needs your approval)
`geetha-base` is pushed to GitHub as a NEW branch `kailash-erp-v2`. `main` stays exactly as it is.

### 2. Deploy the new app beside the old one (Coolify, you click)
1. Coolify > the Kailash project > **+ New** > Private Repository (GitHub App) > `Man2Web/kailash-cernamics`,
   branch `kailash-erp-v2`, Build Pack **Docker Compose**, Docker Compose Location `/docker-compose.coolify.yml`.
2. Service **web** > Domains: a temporary address, e.g. `https://kailash-new.82.29.165.177.sslip.io:3000`
   (the `:3000` is the container port).
3. Environment Variables: leave the generated secrets. Set `APP_URL` to the same temporary address.
   `SEED_DEMO` is `false` by default: keep it that way.
4. Deploy. When all five services are healthy, open the address and sign in as
   `admin@kailashceramics.com` with the `SERVICE_PASSWORD_OWNER` value from Coolify. Change it in My account.

### 3. Back up, then move the data
1. Back up the OLD database (rule 1) and confirm it.
2. In Coolify open the OLD `kailash-postgres` and temporarily switch on "Make it publicly available" (note the port).
   Copy its connection string and replace the host with the server IP and the public port.
3. Open the NEW **api** service > Terminal and run (dry run first; nothing is saved):
   ```
   cd /app && OLD_DATABASE_URL='postgresql://USER:PASSWORD@82.29.165.177:PORT/DBNAME' node_modules/.bin/tsx scripts/migrate-from-old-kailash.ts
   ```
4. Read the counts and the "Please read" list with me. If it looks right, run the same command with
   `CONFIRM=IMPORT_NOW` in front. It can be run again safely.
5. **Switch "Make it publicly available" back OFF on the old database.**

### 4. Check it with real data
Sign in as the Super Admin and as one real employee (their old password works). Check products, customers, employees,
attendance, Office > Employees > Access, Settings > Modules on/off (turn Tally off if you do not use it).
Create the QR screen login in Settings > Users (role "Attendance QR screen", the username and password you choose) and
try a scan from a phone.

### 5. Switch the real address
1. Coolify: remove the real domain from the OLD app, add it to the NEW **web** service (with `:3000`), set `APP_URL`
   to it, redeploy `web`.
2. Stop (do not delete) the old app and its database.
3. Turn on scheduled backups for the NEW Postgres.

## Going back
Re-attach the domain to the old app, start it and its database again. The old data was never changed.
