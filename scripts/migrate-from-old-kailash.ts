/**
 * Moves the key data from the PREVIOUS Kailash app's database into this app's database.
 *
 *   Moves:   users (with their passwords), employees, past attendance, categories, brands, products
 *            (with MRP and selling price), customers and suppliers (with opening balances).
 *   Leaves:  invoices, orders, purchase bills, stock quantities and accounting entries. This app keeps those in a
 *            different structure, so they are started fresh (stock is loaded afterwards with Settings > Import
 *            data or a goods receipt).
 *
 * SAFE BY DEFAULT
 *   - The old database is opened READ ONLY and is never changed.
 *   - Without CONFIRM=IMPORT_NOW this is a DRY RUN: everything is done inside a transaction that is rolled back, and
 *     only the report is printed. Run the dry run first, read the warnings, then run it again with CONFIRM.
 *   - Running it twice is harmless: rows are matched by email / employee ID / SKU / name and not duplicated.
 *
 * USAGE (from the repo root, with the new app's DATABASE_URL set)
 *   OLD_DATABASE_URL=postgresql://... node_modules/.bin/tsx scripts/migrate-from-old-kailash.ts
 *   OLD_DATABASE_URL=postgresql://... CONFIRM=IMPORT_NOW node_modules/.bin/tsx scripts/migrate-from-old-kailash.ts
 *
 *   Optional ROLE_MAP='{"ADMIN":"BRANCH_MANAGER"}' overrides how an old role becomes a new role.
 */
import { Client } from "pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { isValidGstin, stateCodeFromGstin } from "../packages/shared/src/gstin";

const CONFIRM = process.env.CONFIRM === "IMPORT_NOW";
const OLD_URL = process.env.OLD_DATABASE_URL;
if (!OLD_URL) throw new Error("Set OLD_DATABASE_URL to the previous Kailash database.");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to this app's database.");
if (OLD_URL === process.env.DATABASE_URL) throw new Error("OLD_DATABASE_URL and DATABASE_URL are the same database. Refusing to run.");

const hostOf = (u: string) => u.replace(/\/\/[^@]*@/, "//***@");

/** Old role name -> new role code. Anything else is reported and the user gets the Sales role until you decide. */
const DEFAULT_ROLE_MAP: Record<string, string> = {
  SUPER_ADMIN: "OWNER",
  ADMIN: "BRANCH_MANAGER",
  SALES_MANAGER: "SALES",
  SALES_STAFF: "SALES",
  SALES_PERSON: "SALES",
  WAREHOUSE_MANAGER: "GODOWN",
  INVENTORY_STAFF: "GODOWN",
  ACCOUNTANT: "ACCOUNTS",
  ACCOUNTS: "ACCOUNTS",
  FINANCE: "ACCOUNTS",
  FINANCE_MANAGER: "ACCOUNTS",
  PURCHASE_STAFF: "GODOWN",
  PURCHASE_MANAGER: "GODOWN",
  ATTENDANCE_DISPLAY: "ATTENDANCE_DISPLAY",
};
const ROLE_MAP: Record<string, string> = { ...DEFAULT_ROLE_MAP, ...(process.env.ROLE_MAP ? JSON.parse(process.env.ROLE_MAP) : {}) };
const PLACEHOLDERS = new Set(["manager@", "sales@", "accounts@", "godown@"].map((p) => `${p}kailashceramics.com`));
const ROLE_PRIORITY =["OWNER", "BRANCH_MANAGER", "ACCOUNTS", "GODOWN", "SALES", "ATTENDANCE_DISPLAY"];

class DryRun extends Error {}

const paise = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const clean = (v: unknown) => (v == null ? null : String(v).trim() || null);
const categoryType = (name: string) => {
  const n = name.toLowerCase();
  if (/tile|vitrified|ceramic|marble|granite/.test(n)) return "TILE" as const;
  if (/sanitar|basin|wc|closet|urinal|bath/.test(n)) return "SANITARY" as const;
  if (/tap|faucet|shower|cp |fitting|mixer/.test(n)) return "CP_FITTING" as const;
  if (/adhesive|grout|cement|epoxy/.test(n)) return "ADHESIVE" as const;
  return "ACCESSORY" as const;
};
const segmentOf = (group: string | null) => {
  const g = (group ?? "").toLowerCase();
  if (/dealer|distribut|wholesale/.test(g)) return "DEALER" as const;
  if (/contractor/.test(g)) return "CONTRACTOR" as const;
  if (/builder/.test(g)) return "BUILDER" as const;
  if (/institution|corporate/.test(g)) return "INSTITUTION" as const;
  return "RETAIL" as const;
};

async function main() {
  const old = new Client({ connectionString: OLD_URL });
  await old.connect();
  await old.query("BEGIN TRANSACTION READ ONLY");
  const q = async <T = Record<string, any>>(sql: string): Promise<T[]> => (await old.query(sql)).rows as T[];
  const prisma = new PrismaClient();

  const warnings: string[] = [];
  const counts: Record<string, string> = {};
  const note = (key: string, made: number, skipped = 0) => (counts[key] = `${made} added` + (skipped ? `, ${skipped} already there` : ""));

  console.log(`${CONFIRM ? "IMPORT" : "DRY RUN"}: ${hostOf(OLD_URL!)}  ->  ${hostOf(process.env.DATABASE_URL!)}`);

  try {
    await prisma.$transaction(
      async (tx) => {
        const branches = await tx.branch.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } });
        if (!branches.length) throw new Error("This app has no branch yet. Start the app once (it creates the company and branch), then run this again.");
        const roles = new Map((await tx.role.findMany()).map((r) => [r.code, r.id]));

        // ---------------------------------------------------------------- users
        const oldUsers = await q<{ id: string; email: string; password_hash: string; name: string; status: string; deleted_at: Date | null }>(
          "select id, email, password_hash, name, status, deleted_at from users where deleted_at is null",
        );
        const oldRoles = await q<{ user_id: string; name: string }>("select ur.user_id, r.name from user_roles ur join roles r on r.id = ur.role_id");
        const oldEmployees = await q<Record<string, any>>("select * from employees");
        const phoneByEmail = new Map(oldEmployees.filter((e) => e.email && e.phone).map((e) => [String(e.email).toLowerCase(), String(e.phone)]));
        let made = 0, had = 0;
        const userIdByOldId = new Map<string, string>();
        for (const u of oldUsers) {
          const email = u.email.trim().toLowerCase();
          const names = oldRoles.filter((r) => r.user_id === u.id).map((r) => r.name);
          const custom = names.filter((n) => n.startsWith("CUSTOM_ACCESS"));
          if (custom.length) warnings.push(`${email} had custom access in the old app. Re-choose it in Office > Employees > Access.`);
          const mapped = names.filter((n) => !n.startsWith("CUSTOM_ACCESS")).map((n) => ROLE_MAP[n]).filter(Boolean);
          const unknown = names.filter((n) => !n.startsWith("CUSTOM_ACCESS") && !ROLE_MAP[n]);
          if (unknown.length) warnings.push(`${email}: old role(s) ${unknown.join(", ")} have no match, so they get Sales for now. Use ROLE_MAP to change.`);
          const code = ROLE_PRIORITY.find((c) => mapped.includes(c)) ?? "SALES";
          const roleId = roles.get(code);
          if (!roleId) throw new Error(`New role ${code} does not exist. Run the app's seed first.`);
          if (code === "OWNER" && name_is_second_owner(userIdByOldId, oldUsers, u, oldRoles)) warnings.push(`${email} is a second Super Admin in the old app. Check this is intended.`);
          const exists = await tx.user.findUnique({ where: { email } });
          if (exists) {
            userIdByOldId.set(u.id, exists.id);
            // This app creates a few disabled placeholder logins (manager@, sales@, ...). If your old app has a real
            // account with the same address, the real one wins: it takes over the placeholder.
            if (PLACEHOLDERS.has(email) && !exists.isActive && !exists.lastLoginAt) {
              await tx.user.update({
                where: { id: exists.id },
                data: { name: u.name, phone: phoneByEmail.get(email) ?? exists.phone, passwordHash: u.password_hash, roleId, isActive: u.status === "ACTIVE" },
              });
              made++;
              continue;
            }
            if (email === "admin@kailashceramics.com") warnings.push("admin@kailashceramics.com already exists as the new Super Admin, so it was kept. Its password is the one set for this app, not the old app's.");
            had++;
            continue;
          }
          const row = await tx.user.create({
            data: {
              email,
              name: u.name,
              phone: phoneByEmail.get(email) ?? null,
              passwordHash: u.password_hash, // bcrypt: accepted once at sign-in, then upgraded
              roleId,
              isActive: u.status === "ACTIVE",
              defaultBranchId: branches[0].id,
            },
          });
          await tx.userBranch.createMany({ data: branches.map((b) => ({ userId: row.id, branchId: b.id })), skipDuplicates: true });
          userIdByOldId.set(u.id, row.id);
          made++;
        }
        note("users", made, had);

        // ---------------------------------------------------------------- employees
        made = 0; had = 0;
        const empIdByNo = new Map<string, string>();
        for (const e of oldEmployees) {
          const employeeNo = String(e.employee_no).trim().toUpperCase();
          const email = clean(e.email)?.toLowerCase() ?? null;
          const exists = await tx.employee.findUnique({ where: { employeeNo } });
          if (exists) {
            empIdByNo.set(employeeNo, exists.id);
            had++;
            continue;
          }
          const user = email ? await tx.user.findUnique({ where: { email }, include: { role: true } }) : null;
          const linkable = user && user.role.code !== "ATTENDANCE_DISPLAY" && !(await tx.employee.findUnique({ where: { userId: user.id } }));
          const row = await tx.employee.create({
            data: {
              employeeNo,
              name: String(e.name),
              email: email && !(await tx.employee.findUnique({ where: { email } })) ? email : null,
              phone: clean(e.phone),
              department: clean(e.department),
              jobTitle: clean(e.job_title),
              status: ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"].includes(String(e.status)) ? String(e.status) : "ACTIVE",
              joiningDate: e.joining_date ?? new Date(),
              branchId: null,
              userId: linkable ? user!.id : null,
            },
          });
          empIdByNo.set(employeeNo, row.id);
          made++;
        }
        note("employees", made, had);

        // ---------------------------------------------------------------- attendance history
        const logs = await q<{ description: string }>("select description from activity_logs where module = 'ATTENDANCE' order by timestamp");
        made = 0; had = 0;
        let bad = 0;
        for (const l of logs) {
          let m: any;
          try {
            m = JSON.parse(l.description);
          } catch {
            bad++;
            continue;
          }
          const empId = empIdByNo.get(String(m.employeeNo ?? "").trim().toUpperCase());
          if (!empId || !m.attendanceDate) {
            bad++;
            continue;
          }
          const where = { employeeId_attendanceDate: { employeeId: empId, attendanceDate: String(m.attendanceDate) } };
          if (await tx.attendanceRecord.findUnique({ where })) {
            had++;
            continue;
          }
          await tx.attendanceRecord.create({
            data: {
              employeeId: empId,
              attendanceDate: String(m.attendanceDate),
              checkInAt: m.checkInISO ? new Date(m.checkInISO) : null,
              checkOutAt: m.checkOutISO ? new Date(m.checkOutISO) : null,
              workingMinutes: Number(m.workingMinutes ?? 0),
              status: ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE"].includes(m.status) ? m.status : "PRESENT",
              method: m.method === "QR" ? "QR" : "ADMIN",
              correctionReason: clean(m.correctionReason),
            },
          });
          made++;
        }
        note("attendance days", made, had);
        if (bad) warnings.push(`${bad} old attendance row(s) could not be read (unknown employee or damaged) and were skipped.`);

        // ---------------------------------------------------------------- catalogue
        made = 0; had = 0;
        const catIdByOld = new Map<string, string>();
        for (const c of await q<{ id: string; name: string }>("select id, name from categories")) {
          const name = c.name.trim();
          const exists = await tx.category.findUnique({ where: { name } });
          if (exists) { catIdByOld.set(c.id, exists.id); had++; continue; }
          catIdByOld.set(c.id, (await tx.category.create({ data: { name, type: categoryType(name) } })).id);
          made++;
        }
        note("categories", made, had);
        made = 0; had = 0;
        const brandIdByOld = new Map<string, string>();
        for (const b of await q<{ id: string; name: string; code: string }>("select id, name, code from brands")) {
          const name = b.name.trim();
          const exists = await tx.brand.findUnique({ where: { name } });
          if (exists) { brandIdByOld.set(b.id, exists.id); had++; continue; }
          brandIdByOld.set(b.id, (await tx.brand.create({ data: { name, code: clean(b.code) } })).id);
          made++;
        }
        note("brands", made, had);

        const fallbackCategory = (await tx.category.findUnique({ where: { name: "Uncategorised" } })) ?? (await tx.category.create({ data: { name: "Uncategorised", type: "ACCESSORY" } }));
        const fallbackBrand = (await tx.brand.findUnique({ where: { name: "Unbranded" } })) ?? (await tx.brand.create({ data: { name: "Unbranded" } }));

        const priceList =
          (await tx.priceList.findFirst({ where: { name: "Standard (moved from old app)" } })) ??
          (await tx.priceList.create({ data: { name: "Standard (moved from old app)", segment: "RETAIL" } }));
        made = 0; had = 0;
        const oldProducts = await q<Record<string, any>>(
          "select p.*, u.name as unit_name from products p left join units u on u.id = p.unit_id where p.deleted_at is null",
        );
        let noHsn = 0;
        for (const p of oldProducts) {
          const sku = String(p.sku).trim().toUpperCase();
          const exists = await tx.product.findUnique({ where: { sku } });
          if (exists) { had++; continue; }
          const hsn = clean(p.hsn_code);
          if (!hsn) noHsn++;
          const prod = await tx.product.create({
            data: {
              sku,
              name: String(p.name),
              brandId: brandIdByOld.get(p.brand_id) ?? fallbackBrand.id,
              categoryId: catIdByOld.get(p.category_id) ?? fallbackCategory.id,
              hsn: hsn ?? "0000",
              gstRate: Number(p.gst_rate ?? 18),
              // Moved as plain "units". Tiles can be switched to box-and-area once pieces and sq ft per box are entered.
              uomType: "UNIT",
              unitName: String(p.unit_name ?? "nos").toLowerCase(),
              mrpPaise: BigInt(paise(p.mrp)),
              description: clean(p.description),
              reorderLevelPcs: Math.round(Number(p.reorder_level ?? 0)),
            },
          });
          if (Number(p.selling_price) > 0) {
            await tx.priceListItem.create({ data: { priceListId: priceList.id, productId: prod.id, priceBasis: "PER_UNIT", pricePaise: BigInt(paise(p.selling_price)) } });
          }
          made++;
        }
        note("products", made, had);
        if (noHsn) warnings.push(`${noHsn} product(s) had no HSN code and were given 0000. Fix them under Catalogue > Products.`);

        // ---------------------------------------------------------------- customers and suppliers
        const addresses = await q<Record<string, any>>("select * from customer_addresses order by is_default desc");
        const vAddresses = await q<Record<string, any>>("select * from vendor_addresses");
        const addrOf = (list: Record<string, any>[], key: string, id: string) => {
          const a = list.find((x) => x[key] === id);
          return a ? { text: [a.address, a.area, a.pincode].filter(Boolean).join(", "), city: clean(a.city) } : { text: null, city: null };
        };
        const partyData = (r: Record<string, any>, type: "CUSTOMER" | "SUPPLIER", addr: { text: string | null; city: string | null }, segment: any, credit: unknown) => {
          let gstin = clean(r.gstin)?.toUpperCase() ?? null;
          if (gstin && !isValidGstin(gstin)) { warnings.push(`${type === "CUSTOMER" ? "Customer" : "Supplier"} "${r.name}" has an invalid GSTIN (${gstin}); it was left blank.`); gstin = null; }
          return {
            type, segment, name: String(r.name).trim(), phone: clean(r.phone), email: clean(r.email)?.toLowerCase() ?? null, gstin,
            stateCode: stateCodeFromGstin(gstin) ?? "33", billingAddress: addr.text, shippingAddress: addr.text, city: addr.city,
            creditLimitPaise: BigInt(paise(credit)), openingBalancePaise: BigInt(paise(r.outstanding_amt)),
          };
        };
        made = 0; had = 0;
        const groups = new Map((await q<{ id: string; name: string }>("select id, name from customer_groups")).map((g) => [g.id, g.name]));
        for (const c of await q<Record<string, any>>("select * from customers where deleted_at is null")) {
          const data = partyData(c, "CUSTOMER", addrOf(addresses, "customer_id", c.id), segmentOf(groups.get(c.group_id) ?? null), c.credit_limit);
          const exists = await tx.party.findFirst({ where: { name: data.name, type: { in: ["CUSTOMER", "BOTH"] }, deletedAt: null } });
          if (exists) { had++; continue; }
          await tx.party.create({ data });
          made++;
        }
        note("customers", made, had);
        made = 0; had = 0;
        for (const v of await q<Record<string, any>>("select * from vendors where deleted_at is null")) {
          const data = partyData(v, "SUPPLIER", addrOf(vAddresses, "vendor_id", v.id), "RETAIL", 0);
          const exists = await tx.party.findFirst({ where: { name: data.name, type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null } });
          if (exists) { had++; continue; }
          await tx.party.create({ data });
          made++;
        }
        note("suppliers", made, had);

        if (!CONFIRM) throw new DryRun();
      },
      { timeout: 600_000, maxWait: 60_000 },
    );
  } catch (e) {
    if (!(e instanceof DryRun)) {
      console.error("FAILED, nothing was changed:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  } finally {
    await old.query("ROLLBACK").catch(() => undefined);
    await old.end();
    await prisma.$disconnect();
  }

  if (process.exitCode === 1) return;
  console.log("\nResult" + (CONFIRM ? "" : " (dry run, nothing was saved)") + ":");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(16)} ${v}`);
  if (warnings.length) {
    console.log(`\nPlease read (${warnings.length}):`);
    for (const w of warnings) console.log("  - " + w);
  }
  console.log(CONFIRM ? "\nDone. Old data was only read, never changed." : "\nNothing saved. To import for real, run again with CONFIRM=IMPORT_NOW.");
}

/** Is this a second Super Admin? (More than one old user mapped to OWNER.) */
function name_is_second_owner(seen: Map<string, string>, users: { id: string }[], u: { id: string }, roles: { user_id: string; name: string }[]) {
  const owners = users.filter((x) => roles.some((r) => r.user_id === x.id && ROLE_MAP[r.name] === "OWNER"));
  return owners.length > 1 && owners[0].id !== u.id;
}

main();
