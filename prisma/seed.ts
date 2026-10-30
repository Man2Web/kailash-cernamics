// pnpm db:seed — base org/roles/users, then realistic demo data per module (idempotent).
import { PrismaClient } from "@prisma/client";
import { seedBase, SEED_PASSWORD, SEED_USERS } from "../apps/api/src/seed/base";
import { seedDemoCatalogue } from "../apps/api/src/seed/demo-catalogue";
import { seedDemoInventory } from "../apps/api/src/seed/demo-inventory";
import { seedDemoSales } from "../apps/api/src/seed/demo-sales";
import { seedDemoAccounts } from "../apps/api/src/seed/demo-accounts";
import { seedDemoLots } from "../apps/api/src/seed/demo-lots";
import { seedDemoOps } from "../apps/api/src/seed/demo-ops";
import { seedDemoSamples } from "../apps/api/src/seed/demo-samples";
import { seedDemoOffice } from "../apps/api/src/seed/demo-office";

const prisma = new PrismaClient();

async function main() {
  const base = await seedBase(prisma);
  if (process.env.SEED_DEMO !== "false") {
    await seedDemoCatalogue(prisma, base);
    await seedDemoInventory(prisma, base);
    await seedDemoSales(prisma, base);
    await seedDemoAccounts(prisma, base);
    await seedDemoLots(prisma, base);
    await seedDemoOps(prisma, base);
    await seedDemoSamples(prisma, base);
    await seedDemoOffice(prisma, base);
  }
  if (process.env.OWNER_PASSWORD) {
    console.log("Seeded. Owner login: admin@kailashceramics.com (first password = OWNER_PASSWORD)");
  } else {
    console.log("Seeded. Logins (password %s):", SEED_PASSWORD);
  }
  if (process.env.SEED_DEMO_USERS === "false") console.log("  Demo role logins are disabled.");
  else for (const u of SEED_USERS) if (!(process.env.OWNER_PASSWORD && u.role === "OWNER")) console.log(`  ${u.role.padEnd(15)} ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
