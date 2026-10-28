// One-off data copy: Supabase (PostgREST) -> standalone PostgreSQL.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TARGET_DATABASE_URL=... BACKUP_DIR=... node scripts/migrate-data-from-supabase.cjs
// Read-only against Supabase. Writes a JSON backup of every table to BACKUP_DIR (keep it OUT of git), then loads the
// target. The target schema must already exist (prisma migrate deploy). Never prints row contents.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_DATABASE_URL, BACKUP_DIR } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TARGET_DATABASE_URL || !BACKUP_DIR) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_DATABASE_URL and BACKUP_DIR.");
  process.exit(1);
}
const SKIP = new Set(["_prisma_migrations"]);
const PAGE = 1000;
// Tables backed up but not loaded (comma-separated env). Used for tables whose live Supabase layout differs from the schema.
const NO_LOAD = new Set((process.env.NO_LOAD_TABLES || "").split(",").filter(Boolean));

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok && res.status !== 206) throw new Error(`${table}: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

(async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const pg = new Client({ connectionString: TARGET_DATABASE_URL });
  await pg.connect();
  const tables = (
    await pg.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
  ).rows.map((r) => r.table_name).filter((t) => !SKIP.has(t));

  const report = [];
  await pg.query("begin");
  try {
    await pg.query("set local session_replication_role = replica"); // defer FK checks; verified afterwards
    for (const t of tables) {
      let rows;
      try {
        rows = await fetchAll(t);
      } catch (e) {
        report.push({ table: t, source: "n/a", loaded: 0, note: e.message });
        continue;
      }
      fs.writeFileSync(path.join(BACKUP_DIR, `${t}.json`), JSON.stringify(rows));
      if (rows.length === 0) { report.push({ table: t, source: 0, loaded: 0 }); continue; }
      if (NO_LOAD.has(t)) { report.push({ table: t, source: rows.length, loaded: rows.length, note: "backed up only (NO_LOAD_TABLES)" }); continue; }
      const cols = (await pg.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [t])).rows;
      const type = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));
      const names = Object.keys(rows[0]).filter((k) => type[k]);
      const dropped = Object.keys(rows[0]).filter((k) => !type[k]);
      let loaded = 0;
      for (const row of rows) {
        const vals = names.map((k) => {
          const v = row[k];
          if (v !== null && v !== undefined && (type[k] === "jsonb" || type[k] === "json")) return JSON.stringify(v);
          return v;
        });
        const r = await pg.query(
          `insert into "${t}" (${names.map((n) => `"${n}"`).join(",")}) values (${names.map((_, i) => `$${i + 1}`).join(",")})`,
          vals
        );
        loaded += r.rowCount;
      }
      report.push({ table: t, source: rows.length, loaded, note: dropped.length ? `ignored columns: ${dropped.join(",")}` : undefined });
    }
    await pg.query("commit");
  } catch (e) {
    await pg.query("rollback");
    console.error("FAILED, rolled back:", e.message);
    process.exit(1);
  }

  const bad = report.filter((r) => r.source !== "n/a" && r.source !== r.loaded);
  console.table(report.filter((r) => r.source || r.note));
  console.log(bad.length ? `MISMATCH in ${bad.length} table(s)` : "All source row counts match loaded counts.");
  await pg.end();
})();
