import "dotenv/config";
import db from "@/lib/db/db";
import { hashPassword } from "@/lib/auth/auth";

// Initial password for NEWLY created accounts only, supplied via environment (never hardcoded or logged).
// Existing accounts are never modified: their passwords are not reset.
function getInitialPassword(): string {
  const pw = process.env.SEED_ACCOUNT_PASSWORD;
  if (!pw || pw.length < 12) {
    throw new Error("Set SEED_ACCOUNT_PASSWORD (min 12 characters) to create new accounts.");
  }
  return pw;
}

async function seedRoleAccounts() {
  const initialPassword = getInitialPassword();
  console.log("Seeding / Verifying Role Login Accounts...");
  const roles = await db.role.findMany();
  const roleMap = new Map(roles.map((r: any) => [r.name, r.id]));

  const accounts = [
    { email: "admin@kailashceramics.com", name: "Super Admin", roles: ["SUPER_ADMIN"] },
    { email: "admin@sixorbit.com", name: "System Administrator", roles: ["ADMIN"] },
    { email: "sales@kailashceramics.com", name: "Sales Manager", roles: ["SALES_MANAGER", "SALES_STAFF"] },
    { email: "purchase@kailashceramics.com", name: "Purchase Manager", roles: ["PURCHASE_MANAGER", "PURCHASE_STAFF"] },
    { email: "warehouse@kailashceramics.com", name: "Warehouse Manager", roles: ["WAREHOUSE_MANAGER", "INVENTORY_STAFF"] },
    { email: "finance@kailashceramics.com", name: "Finance Manager", roles: ["FINANCE_MANAGER", "ACCOUNTANT"] },
    { email: "viewer@kailashceramics.com", name: "Auditor / Viewer", roles: ["VIEWER"] },
  ];

  for (const acc of accounts) {
    let user = await db.user.findUnique({ where: { email: acc.email } });
    if (!user) {
      const passwordHash = await hashPassword(initialPassword);
      user = await db.user.create({
        data: {
          email: acc.email,
          name: acc.name,
          passwordHash,
          status: "ACTIVE",
        },
      });
      console.log(`✅ Created user: ${acc.email} (${acc.name})`);
    } else {
      console.log(`⏭️  Exists, password and status left unchanged: ${acc.email}`);
    }

    for (const roleName of acc.roles) {
      const roleId = roleMap.get(roleName);
      if (roleId) {
        const existingUserRole = await db.userRole.findFirst({
          where: { userId: user.id, roleId },
        });
        if (!existingUserRole) {
          await db.userRole.create({
            data: { userId: user.id, roleId },
          });
          console.log(`   + Assigned role '${roleName}' to ${acc.email}`);
        }
      }
    }
  }

  console.log("\n🎉 All Department Logins successfully ready in database!");
}

seedRoleAccounts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error seeding accounts:", err);
    process.exit(1);
  });
