// Local development Postgres 16 without Docker (binaries from the `embedded-postgres`
// npm package). Data lives in ./.pgdata (gitignored). Stop with Ctrl+C.
//
//   pnpm db:start
//
// With Docker installed, `docker compose -f docker/docker-compose.yml up -d postgres` gives the
// same port and credentials.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.DEV_DB_PORT ?? 5442);
const dataDir = path.resolve(".pgdata");
const firstRun = !existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PORT,
  user: "erp",
  password: "erp",
  authMethod: "scram-sha-256",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "timezone=UTC", "-c", "max_connections=200"],
  onLog: () => {},
});

if (firstRun) {
  console.log("Initialising local Postgres in .pgdata ...");
  await pg.initialise();
}
await pg.start();

for (const name of ["kailash_erp", "kailash_erp_test"]) {
  try {
    await pg.createDatabase(name);
    console.log(`Created database ${name}`);
  } catch {
    // already exists
  }
}

console.log(`Postgres ready on 127.0.0.1:${PORT} (user erp / password erp). Ctrl+C to stop.`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
