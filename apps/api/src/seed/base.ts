// Base seed shared by `pnpm db:seed` and the API e2e tests: company, branch, godowns, permissions,
// default roles and the owner login. Idempotent (safe to run twice).
import type { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { DEFAULT_ROLES, PERMISSIONS, permissionModule } from "@gc/shared";

export const SEED_PASSWORD = "Kailash@123";
export const SEED_USERS = [
  { email: "admin@kailashceramics.com", name: "Super Admin", role: "OWNER" },
  { email: "manager@kailashceramics.com", name: "Branch Manager", role: "BRANCH_MANAGER" },
  { email: "sales@kailashceramics.com", name: "Sales Counter", role: "SALES" },
  { email: "accounts@kailashceramics.com", name: "Accounts", role: "ACCOUNTS" },
  { email: "godown@kailashceramics.com", name: "Godown Staff", role: "GODOWN" },
];

export async function seedBase(prisma: PrismaClient) {
  const company =
    (await prisma.company.findFirst()) ??
    (await prisma.company.create({
      data: { name: "Kailash Ceramics", legalName: "Kailash Ceramics", address: "Coimbatore, Tamil Nadu", phone: "", email: "accounts@kailashceramics.com" },
    }));

  const branch = await prisma.branch.upsert({
    where: { code: "CBE" },
    create: {
      companyId: company.id,
      code: "CBE",
      name: "Kailash Ceramics - Main",
      city: "Coimbatore",
      state: "Tamil Nadu",
      stateCode: "33",
      gstin: "33AABCG1234F1Z5",
      tallyCompanyName: "Kailash Ceramics",
    },
    update: {},
  });

  const godowns = [];
  for (const g of [
    { code: "MAIN", name: "Main Godown", isDisplay: false },
    { code: "SHOW", name: "Showroom", isDisplay: true },
  ]) {
    godowns.push(
      await prisma.godown.upsert({
        where: { branchId_code: { branchId: branch.id, code: g.code } },
        create: { branchId: branch.id, ...g },
        update: {},
      }),
    );
  }
  for (const code of ["A1", "A2", "B1", "B2"]) {
    await prisma.rack.upsert({
      where: { godownId_code: { godownId: godowns[0].id, code } },
      create: { godownId: godowns[0].id, code, name: `Rack ${code}` },
      update: {},
    });
  }

  const known = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  for (const [code, label] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, create: { code, label, module: permissionModule(code) }, update: { label } });
  }
  const perms = await prisma.permission.findMany();
  // permissions added in a later release go to the default roles that include them, without
  // re-adding anything an admin removed from a role in the matrix
  const added = known.size ? perms.filter((p) => !known.has(p.code)) : [];
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, discountLimitPct: r.discountLimitPct, isSystem: true },
      update: { name: r.name },
    });
    roles[r.code] = role.id;
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    const grantNew = added.filter((p) => (r.permissions as string[]).includes(p.code));
    if (existing > 0 && grantNew.length) {
      await prisma.rolePermission.createMany({ data: grantNew.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    }
    if (existing === 0) {
      await prisma.rolePermission.createMany({
        data: r.permissions.map((code) => ({ roleId: role.id, permissionId: perms.find((p) => p.code === code)!.id })),
        skipDuplicates: true,
      });
    }
  }

  // Hosted environments: OWNER_PASSWORD (a Coolify-generated secret) sets the owner's first password,
  // and SEED_DEMO_USERS=false keeps the other demo logins disabled. Only applied when a user is
  // created, so a password changed later in My account is never reset by a redeploy.
  const argon = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
  const passwordHash = await hash(SEED_PASSWORD, argon);
  const ownerHash = process.env.OWNER_PASSWORD ? await hash(process.env.OWNER_PASSWORD, argon) : passwordHash;
  const demoLogins = process.env.SEED_DEMO_USERS !== "false";
  const lockedHash = await hash(randomBytes(32).toString("hex"), argon);
  for (const u of SEED_USERS) {
    const isOwner = u.role === "OWNER";
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: isOwner ? ownerHash : demoLogins ? passwordHash : lockedHash,
        isActive: isOwner || demoLogins,
        roleId: roles[u.role],
        defaultBranchId: branch.id,
      },
      update: isOwner || demoLogins ? {} : { isActive: false },
    });
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: user.id, branchId: branch.id } },
      create: { userId: user.id, branchId: branch.id },
      update: {},
    });
  }

  return { company, branch, mainGodown: godowns[0], showroom: godowns[1], roles };
}
