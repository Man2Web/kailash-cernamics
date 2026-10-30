import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { addDays, financialYear, formatQty, GRADES, rupeesToPaise, validateGstin } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { LedgerService } from "../../core/ledger.service";
import { stampCreate } from "../../common/context";
import { SEED_USERS } from "../../seed/base";

export interface ImportRowResult {
  row: number;
  key: string;
  action: "create" | "update" | "error";
  errors: string[];
  notes: string[];
}

export interface ImportPreview {
  total: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  committed?: boolean;
  results: ImportRowResult[];
}

type Raw = Record<string, unknown>;

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

function summarise(results: ImportRowResult[], committed?: boolean): ImportPreview {
  return {
    total: results.length,
    createCount: results.filter((r) => r.action === "create").length,
    updateCount: results.filter((r) => r.action === "update").length,
    errorCount: results.filter((r) => r.action === "error").length,
    committed,
    results,
  };
}

/** Accepts 2026-10-24, 24/10/2026, 24-10-2026 or anything Date can parse. Dates are IST midnight. */
export function parseDate(v: unknown): Date | null {
  const t = s(v);
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+05:30`);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00+05:30`);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface StockPlan {
  productId: string;
  batchNo: string;
  shadeCode: string;
  caliber: string;
  grade: (typeof GRADES)[number];
  godownId: string;
  rackId: string | null;
  qtyPcs: number;
  landedPerPiecePaise: number | null;
  isTile: boolean;
}

interface BillPlan {
  partyId: string;
  number: string;
  date: Date;
  dueDate: Date;
  amountPaise: number;
  placeOfSupply: string;
  isInterState: boolean;
}

/** Phase 9 go-live: opening stock by shade per godown, opening outstanding by bill, readiness checklist. */
@Injectable()
export class GoliveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- opening stock

  private async planStock(rows: Raw[], branchId: string) {
    const results: ImportRowResult[] = [];
    const plans: (StockPlan | null)[] = [];
    const seen = new Set<string>();
    const godowns = await this.prisma.godown.findMany({ where: { branchId, deletedAt: null }, include: { racks: { where: { deletedAt: null } } } });
    const skus = [...new Set(rows.map((r) => s(r.sku).toUpperCase()).filter(Boolean))];
    const products = await this.prisma.product.findMany({ where: { sku: { in: skus, mode: "insensitive" }, deletedAt: null } });

    for (const [i, r] of rows.entries()) {
      const errors: string[] = [];
      const notes: string[] = [];
      const sku = s(r.sku);
      const product = products.find((p) => p.sku.toUpperCase() === sku.toUpperCase());
      if (!sku) errors.push("sku is required");
      else if (!product) errors.push(`Product ${sku} not found`);
      const godown = godowns.find((g) => g.code.toUpperCase() === s(r.godown_code).toUpperCase());
      if (!godown) errors.push(`Godown "${s(r.godown_code)}" not found in this branch`);
      const rackCode = s(r.rack_code);
      const rack = rackCode && godown ? godown.racks.find((x) => x.code.toUpperCase() === rackCode.toUpperCase()) : null;
      if (rackCode && godown && !rack) errors.push(`Rack "${rackCode}" not found in ${godown.code}`);

      const isTile = product?.uomType === "PIECE_BOX_AREA";
      let batchNo = s(r.batch_no);
      let shadeCode = s(r.shade_code);
      let caliber = s(r.caliber);
      const gradeRaw = s(r.grade).toUpperCase() || "STANDARD";
      if (!(GRADES as readonly string[]).includes(gradeRaw)) errors.push(`Grade must be one of ${GRADES.join(", ")}`);
      if (product && isTile) {
        if (!batchNo) errors.push("batch_no is required for tiles");
        if (!shadeCode) errors.push("shade_code is required for tiles");
        if (!caliber) errors.push("caliber is required for tiles");
      } else if (product) {
        batchNo = batchNo || "DEFAULT";
        shadeCode = shadeCode || "-";
        caliber = caliber || "-";
      }

      const boxes = Number(s(r.boxes) || 0);
      const loose = Number(s(r.loose_pcs) || 0);
      if (!Number.isInteger(boxes) || boxes < 0 || !Number.isInteger(loose) || loose < 0) errors.push("boxes and loose_pcs must be whole numbers");
      const pcsPerBox = isTile ? (product?.pcsPerBox ?? 0) : 1;
      const qtyPcs = boxes * pcsPerBox + loose;
      if (product && qtyPcs <= 0) errors.push("Quantity must be more than zero");
      if (product && isTile && pcsPerBox && loose >= pcsPerBox) notes.push(`${loose} loose pcs is a full box or more`);

      let landedPerPiecePaise: number | null = null;
      if (s(r.landed_cost_per_box)) {
        try {
          const perBox = rupeesToPaise(s(r.landed_cost_per_box));
          landedPerPiecePaise = Math.round(perBox / (pcsPerBox || 1));
        } catch {
          errors.push("landed_cost_per_box is not a valid amount");
        }
      }

      const dupKey = `${product?.id}|${batchNo.toUpperCase()}|${godown?.id}|${rack?.id ?? "-"}`;
      if (product && godown && seen.has(dupKey)) errors.push("Same product, batch, godown and rack appears twice in the file");
      seen.add(dupKey);

      let action: ImportRowResult["action"] = "create";
      if (product && godown && batchNo) {
        const batch = await this.prisma.batch.findUnique({ where: { productId_batchNo: { productId: product.id, batchNo } } });
        if (batch) {
          const already = await this.prisma.stockLedger.count({ where: { refType: "OPENING_STOCK", productId: product.id, batchId: batch.id, godownId: godown.id } });
          if (already) errors.push(`Opening stock for batch ${batchNo} in ${godown.code} was already imported`);
          else {
            action = "update";
            if (batch.shadeCode !== shadeCode && isTile) notes.push(`Existing batch has shade ${batch.shadeCode}; it is kept`);
          }
        }
      }
      if (product && !errors.length) {
        notes.push(`${formatQty(qtyPcs, product)} into ${godown!.code}${rack ? "/" + rack.code : ""}${isTile ? ` · shade ${shadeCode} · ${caliber}` : ""}`);
      }

      const failed = errors.length > 0;
      results.push({ row: i + 2, key: sku || "(blank)", action: failed ? "error" : action, errors, notes });
      plans.push(
        failed || !product || !godown
          ? null
          : { productId: product.id, batchNo, shadeCode, caliber, grade: gradeRaw as StockPlan["grade"], godownId: godown.id, rackId: rack?.id ?? null, qtyPcs, landedPerPiecePaise, isTile },
      );
    }
    return { results, plans };
  }

  async previewStock(rows: Raw[], branchId: string) {
    return summarise((await this.planStock(rows, branchId)).results);
  }

  async commitStock(rows: Raw[], branchId: string) {
    const { results, plans } = await this.planStock(rows, branchId);
    if (results.some((r) => r.action === "error")) return summarise(results, false);
    const importId = randomUUID();
    await this.prisma.$transaction(
      async (tx) => {
        for (const p of plans) {
          if (!p) continue;
          const batch = await tx.batch.upsert({
            where: { productId_batchNo: { productId: p.productId, batchNo: p.batchNo } },
            create: {
              productId: p.productId,
              batchNo: p.batchNo,
              shadeCode: p.shadeCode,
              caliber: p.caliber,
              grade: p.grade,
              purchaseRatePaise: BigInt(p.landedPerPiecePaise ?? 0),
              landedCostPaise: BigInt(p.landedPerPiecePaise ?? 0),
              ...stampCreate(),
            },
            update: p.landedPerPiecePaise !== null ? { landedCostPaise: BigInt(p.landedPerPiecePaise) } : {},
          });
          const dup = await tx.stockLedger.count({ where: { refType: "OPENING_STOCK", productId: p.productId, batchId: batch.id, godownId: p.godownId } });
          if (dup) throw new NotFoundException(`Opening stock for batch ${p.batchNo} was imported meanwhile`);
          await this.ledger.post(tx, [
            {
              branchId,
              productId: p.productId,
              batchId: batch.id,
              godownId: p.godownId,
              rackId: p.rackId,
              qtyPcs: p.qtyPcs,
              stockType: "SALEABLE",
              refType: "OPENING_STOCK",
              refId: importId,
              ratePaise: p.landedPerPiecePaise ?? 0,
              note: "Opening stock",
            },
          ]);
        }
        await this.audit.log({ entity: "opening_stock", entityId: importId, action: "import", after: { rows: results.length, branchId } }, tx);
      },
      { maxWait: 10000, timeout: 120000 },
    );
    return summarise(results, true);
  }

  // ---------------------------------------------------------------- opening outstanding

  private async planBills(rows: Raw[], branchId: string) {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const results: ImportRowResult[] = [];
    const plans: (BillPlan | null)[] = [];
    const seen = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const errors: string[] = [];
      const notes: string[] = [];
      const gstin = s(r.party_gstin).toUpperCase();
      const name = s(r.party_name);
      let party: { id: string; name: string; stateCode: string; creditDays: number } | null = null;
      if (gstin) {
        party = await this.prisma.party.findFirst({ where: { gstin, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } } });
        if (!party) errors.push(`No customer with GSTIN ${gstin}`);
      } else if (name) {
        const found = await this.prisma.party.findMany({
          where: { name: { equals: name, mode: "insensitive" }, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
          take: 2,
        });
        if (found.length === 0) errors.push(`No customer named "${name}"`);
        else if (found.length > 1) errors.push(`More than one customer named "${name}"; use party_gstin`);
        else party = found[0];
      } else errors.push("party_name or party_gstin is required");

      const number = s(r.bill_no);
      if (!number) errors.push("bill_no is required");
      else if (seen.has(number.toUpperCase())) errors.push("bill_no appears twice in the file");
      else {
        seen.add(number.toUpperCase());
        const exists = await this.prisma.invoice.findFirst({ where: { branchId, number } });
        if (exists) errors.push(`Bill ${number} already exists in this branch`);
      }
      const date = parseDate(r.bill_date);
      if (!date) errors.push("bill_date is missing or not a date (use dd/mm/yyyy or yyyy-mm-dd)");
      let amountPaise = 0;
      try {
        amountPaise = rupeesToPaise(s(r.amount));
        if (amountPaise <= 0) errors.push("amount must be more than zero");
      } catch {
        errors.push("amount is not a valid number");
      }
      let dueDate = parseDate(r.due_date);
      if (s(r.due_date) && !dueDate) errors.push("due_date is not a date");
      if (!dueDate && date && party) {
        dueDate = addDays(date, party.creditDays);
        notes.push(`Due date from ${party.creditDays} credit days`);
      }
      if (party && !errors.length) notes.unshift(`${party.name} · ₹${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);

      const failed = errors.length > 0;
      results.push({ row: i + 2, key: number || "(blank)", action: failed ? "error" : "create", errors, notes });
      plans.push(
        failed || !party || !date
          ? null
          : {
              partyId: party.id,
              number,
              date,
              dueDate: dueDate ?? date,
              amountPaise,
              placeOfSupply: party.stateCode,
              isInterState: party.stateCode !== branch.stateCode,
            },
      );
    }
    return { results, plans };
  }

  async previewBills(rows: Raw[], branchId: string) {
    return summarise((await this.planBills(rows, branchId)).results);
  }

  async commitBills(rows: Raw[], branchId: string) {
    const { results, plans } = await this.planBills(rows, branchId);
    if (results.some((r) => r.action === "error")) return summarise(results, false);
    const importId = randomUUID();
    await this.prisma.$transaction(
      async (tx) => {
        for (const p of plans) {
          if (!p) continue;
          await tx.invoice.create({
            data: {
              branchId,
              number: p.number,
              date: p.date,
              partyId: p.partyId,
              placeOfSupply: p.placeOfSupply,
              isInterState: p.isInterState,
              status: "POSTED",
              postedAt: new Date(),
              totalPaise: BigInt(p.amountPaise),
              dueDate: p.dueDate,
              notes: "Opening balance (Tally bill-wise)",
              // already in Tally's books; never pushed again
              syncStatus: "SYNCED",
              ...stampCreate(),
            },
          });
        }
        await this.audit.log(
          { entity: "opening_outstanding", entityId: importId, action: "import", after: { bills: results.length, totalPaise: plans.reduce((a, p) => a + (p?.amountPaise ?? 0), 0) } },
          tx,
        );
      },
      { maxWait: 10000, timeout: 120000 },
    );
    return summarise(results, true);
  }

  // ---------------------------------------------------------------- checklist

  async checklist(branchId: string) {
    type Check = { key: string; label: string; status: "pass" | "warn" | "fail"; detail: string; href?: string };
    const checks: Check[] = [];
    const add = (c: Check) => checks.push(c);
    const fy = financialYear();

    const branches = await this.prisma.branch.findMany({ where: { deletedAt: null, isActive: true }, include: { godowns: { where: { deletedAt: null } } } });
    const badGstin = branches.filter((b) => !validateGstin(b.gstin).valid);
    add({
      key: "branch-gstin",
      label: "Every branch has a valid GSTIN",
      status: badGstin.length ? "fail" : "pass",
      detail: badGstin.length ? `Fix: ${badGstin.map((b) => b.code).join(", ")}` : `${branches.length} branch(es) OK`,
      href: "/settings/branches",
    });
    const noTally = branches.filter((b) => !b.tallyCompanyName);
    add({
      key: "branch-tally",
      label: "Every branch is mapped to a Tally company",
      status: noTally.length ? "warn" : "pass",
      detail: noTally.length ? `Missing: ${noTally.map((b) => b.code).join(", ")}` : "Mapped",
      href: "/settings/branches",
    });
    const noGodown = branches.filter((b) => !b.godowns.length);
    add({
      key: "godowns",
      label: "Every branch has at least one godown",
      status: noGodown.length ? "fail" : "pass",
      detail: noGodown.length ? `Missing: ${noGodown.map((b) => b.code).join(", ")}` : `${branches.reduce((a, b) => a + b.godowns.length, 0)} godown(s)`,
      href: "/settings/branches",
    });
    const series = await this.prisma.numberSeries.count({ where: { branchId, fy, docType: "INVOICE" } });
    add({
      key: "series",
      label: `Invoice number series for FY ${fy}`,
      status: series ? "pass" : "warn",
      detail: series ? "Set up" : "Not created yet — the first invoice starts at 0001. Set a starting number if you continue an existing series.",
      href: "/settings/branches",
    });

    const products = await this.prisma.product.count({ where: { deletedAt: null, isActive: true } });
    add({ key: "products", label: "Product master loaded", status: products ? "pass" : "fail", detail: `${products} active product(s)`, href: "/catalogue/products" });
    const missingHsn = await this.prisma.product.count({ where: { deletedAt: null, isActive: true, OR: [{ hsn: "" }] } });
    const tileGaps = await this.prisma.product.count({
      where: { deletedAt: null, isActive: true, uomType: "PIECE_BOX_AREA", OR: [{ pcsPerBox: null }, { sqftPerBox: null }] },
    });
    add({
      key: "product-units",
      label: "Products have HSN and tile box sizes",
      status: missingHsn || tileGaps ? "fail" : "pass",
      detail: missingHsn || tileGaps ? `${missingHsn} without HSN, ${tileGaps} tiles without pcs/sq ft per box` : "All complete",
      href: "/catalogue/products",
    });
    const unpriced = await this.prisma.product.count({ where: { deletedAt: null, isActive: true, mrpPaise: 0 } });
    add({
      key: "prices",
      label: "Products have an MRP",
      status: unpriced ? "warn" : "pass",
      detail: unpriced ? `${unpriced} product(s) with MRP ₹0 — price lists must cover them` : "All have MRP",
      href: "/catalogue/price-lists",
    });

    const [customers, suppliers] = await Promise.all([
      this.prisma.party.count({ where: { deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } } }),
      this.prisma.party.count({ where: { deletedAt: null, type: { in: ["SUPPLIER", "BOTH"] } } }),
    ]);
    add({
      key: "parties",
      label: "Customers and suppliers loaded",
      status: customers && suppliers ? "pass" : "warn",
      detail: `${customers} customer(s), ${suppliers} supplier(s)`,
      href: "/parties/customers",
    });
    const unmapped = await this.prisma.party.count({ where: { deletedAt: null, tallyLedgerGuid: null } });
    add({
      key: "tally-ledgers",
      label: "Parties matched to Tally ledgers",
      status: unmapped ? "warn" : "pass",
      detail: unmapped ? `${unmapped} not matched yet (they are created in Tally on first sync)` : "All matched",
      href: "/settings/tally",
    });

    const opening = await this.prisma.stockLedger.count({ where: { refType: "OPENING_STOCK", branchId } });
    const grns = await this.prisma.grn.count({ where: { branchId, status: "POSTED", deletedAt: null } });
    add({
      key: "opening-stock",
      label: "Opening stock by shade per godown",
      status: opening ? "pass" : grns ? "warn" : "fail",
      detail: opening ? `${opening} opening stock row(s) posted` : grns ? `No opening import; ${grns} GRN(s) posted` : "No stock in this branch yet",
      href: "/settings/import?kind=opening-stock",
    });
    const openingBills = await this.prisma.invoice.count({ where: { branchId, notes: "Opening balance (Tally bill-wise)", deletedAt: null } });
    add({
      key: "opening-outstanding",
      label: "Opening outstanding by bill",
      status: openingBills ? "pass" : "warn",
      detail: openingBills ? `${openingBills} opening bill(s)` : "Not imported — receipts against old Tally bills can't be allocated",
      href: "/settings/import?kind=opening-outstanding",
    });

    const agents = await this.prisma.tallyAgent.findMany({ where: { branchId, isActive: true, deletedAt: null } });
    const fresh = agents.filter((a) => a.lastSeenAt && a.lastSeenAt > new Date(Date.now() - 15 * 60_000));
    add({
      key: "tally-agent",
      label: "Tally agent online (seen in the last 15 minutes)",
      status: fresh.length ? "pass" : agents.length ? "warn" : "fail",
      detail: fresh.length ? fresh.map((a) => a.name).join(", ") : agents.length ? "Agent installed but silent" : "No agent set up for this branch",
      href: "/settings/tally",
    });
    const failed = await this.prisma.tallySyncQueue.count({ where: { status: "FAILED", deletedAt: null } });
    add({
      key: "tally-failures",
      label: "No failed Tally sync items",
      status: failed ? "warn" : "pass",
      detail: failed ? `${failed} failed item(s)` : "Clean",
      href: "/settings/tally",
    });

    const owners = await this.prisma.user.findMany({ where: { deletedAt: null, isActive: true, role: { code: "OWNER" } }, select: { name: true, totpEnabled: true } });
    const no2fa = owners.filter((o) => !o.totpEnabled);
    add({
      key: "owner-2fa",
      label: "Owner accounts use 2-factor sign-in",
      status: no2fa.length ? "warn" : "pass",
      detail: no2fa.length ? `Not enabled: ${no2fa.map((o) => o.name).join(", ")}` : "Enabled",
      href: "/account#security",
    });
    const demoEmails = SEED_USERS.filter((u) => u.role !== "OWNER").map((u) => u.email);
    const demo = await this.prisma.user.findMany({ where: { email: { in: demoEmails }, isActive: true, deletedAt: null }, select: { email: true } });
    add({
      key: "demo-users",
      label: "Demo logins disabled",
      status: demo.length ? "warn" : "pass",
      detail: demo.length ? `Still active: ${demo.map((d) => d.email).join(", ")}` : "None active",
      href: "/settings/users",
    });

    const summary = {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };
    return { fy, summary, ready: summary.fail === 0, checks };
  }
}
