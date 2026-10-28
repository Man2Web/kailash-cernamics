import "dotenv/config";
import bcrypt from "bcryptjs";
import db from "@/lib/db/db";

/**
 * Read-only audit: lists accounts whose password still matches a known default/seed password.
 * Prints emails only - never hashes or passwords. Reset affected accounts via the admin
 * "reset password" action (which also invalidates their sessions).
 */
const KNOWN_DEFAULTS = [
  "admin123", "admin", "password",
  "Admin@12345", "Sales@12345", "Purchase@12345", "Warehouse@12345", "Finance@12345", "Viewer@12345",
];

async function main() {
  const users = await db.user.findMany();
  let flagged = 0;
  for (const u of users as any[]) {
    for (const candidate of KNOWN_DEFAULTS) {
      if (await bcrypt.compare(candidate, u.passwordHash)) {
        console.log(`DEFAULT PASSWORD IN USE: ${u.email}`);
        flagged++;
        break;
      }
    }
  }
  console.log(`${flagged} of ${users.length} accounts use a known default password.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
