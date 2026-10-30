import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Creates the test database (TEST_DATABASE_URL, default kailash_erp_test) and applies migrations.
 * Parallel work streams can each point TEST_DATABASE_URL at their own database.
 */
export default async function setup() {
  const root = path.resolve(__dirname, "../../..");
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {
    /* CI provides env */
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const dbName = new URL(url).pathname.slice(1);
  const adminUrl = url.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch {
    // exists
  } finally {
    await admin.$disconnect();
  }
  execSync("npx prisma migrate deploy", { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
