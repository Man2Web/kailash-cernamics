import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TallyAgent, TallySyncQueue } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { stateName, TallyAck, TallyInbound } from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { stampCreate, stampUpdate } from "../../common/context";
import { amt, cancelVoucherXml, envelope, ledgerXml, LedgerLine, stockItemXml, voucherXml } from "./tally-xml";

export const BACKOFF_MIN = [1, 5, 30];
export const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Which ERP document table holds the Tally GUID/sync status for each queue entity type. */
const DOC_MODEL: Record<string, "invoice" | "creditNote" | "purchaseInvoice" | "debitNote" | "receipt" | "payment"> = {
  INVOICE: "invoice",
  CREDIT_NOTE: "creditNote",
  PURCHASE_INVOICE: "purchaseInvoice",
  DEBIT_NOTE: "debitNote",
  RECEIPT: "receipt",
  PAYMENT: "payment",
};

@Injectable()
export class TallyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  // ------------------------------------------------------------------ agents

  async authenticate(key: string | undefined): Promise<TallyAgent | null> {
    if (!key) return null;
    const agent = await this.prisma.tallyAgent.findUnique({ where: { apiKeyHash: hashKey(key) } });
    if (!agent || !agent.isActive || agent.deletedAt) return null;
    await this.prisma.tallyAgent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
    return agent;
  }

  newKey() {
    const key = `gcta_${randomBytes(32).toString("base64url")}`;
    return { key, hash: hashKey(key), prefix: key.slice(0, 10) };
  }

  async createAgent(branchId: string, name: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
    if (!branch) throw new NotFoundException("Branch not found");
    const k = this.newKey();
    const agent = await this.prisma.tallyAgent.create({
      data: { branchId, name, apiKeyHash: k.hash, apiKeyPrefix: k.prefix, companyName: branch.tallyCompanyName, ...stampCreate() },
    });
    await this.audit.log({ entity: "tally_agent", entityId: agent.id, action: "create", after: { ...agent, apiKeyHash: "***" } });
    return { agent: { ...agent, apiKeyHash: undefined }, apiKey: k.key };
  }

  async rotateKey(id: string) {
    const agent = await this.prisma.tallyAgent.findFirst({ where: { id, deletedAt: null } });
    if (!agent) throw new NotFoundException("Agent not found");
    const k = this.newKey();
    await this.prisma.tallyAgent.update({ where: { id }, data: { apiKeyHash: k.hash, apiKeyPrefix: k.prefix, ...stampUpdate() } });
    await this.audit.log({ entity: "tally_agent", entityId: id, action: "rotate_key", before: { apiKeyPrefix: agent.apiKeyPrefix }, after: { apiKeyPrefix: k.prefix } });
    return { apiKey: k.key, apiKeyPrefix: k.prefix };
  }

  async heartbeat(agent: TallyAgent, hb: { tallyRunning: boolean; companyName?: string | null; version?: string | null }) {
    await this.prisma.tallyAgent.update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date(), tallyRunning: hb.tallyRunning, companyName: hb.companyName ?? agent.companyName, tallyVersion: hb.version ?? agent.tallyVersion },
    });
    return { ok: true, serverTime: new Date().toISOString(), lastAlterId: Number(agent.lastAlterId) };
  }

  // ------------------------------------------------------------------ queue pull

  /** Pending items for this agent's branch, masters before vouchers, with XML built now. */
  async pull(agent: TallyAgent, limit: number) {
    const now = new Date();
    // The database stamps "due at" with its own clock, which can run a few milliseconds ahead of this server's, so an
    // item queued a moment ago must not look "not due yet". Retries are minutes apart, so 2 seconds of slack is safe.
    const dueBy = new Date(now.getTime() + 2_000);
    // reclaim items sent but never acknowledged (agent crashed mid-batch)
    await this.prisma.tallySyncQueue.updateMany({
      where: { status: "SENT", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      data: { status: "PENDING" },
    });
    const rows = await this.prisma.tallySyncQueue.findMany({
      where: { status: "PENDING", direction: "TO_TALLY", nextAttemptAt: { lte: dueBy }, deletedAt: null, OR: [{ branchId: agent.branchId }, { branchId: null }] },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: agent.branchId } });
    const company = branch.tallyCompanyName || agent.companyName || "Kailash Ceramics";
    const batchIds = new Set(rows.map((r) => r.id));
    const out: { queueId: string; entityType: string; entityId: string; remoteId: string; xml: string }[] = [];
    for (const row of rows) {
      try {
        if (row.priority >= 50 && (await this.blockedByMaster(row, batchIds))) continue;
        const xml = await this.buildXml(row, company);
        await this.prisma.tallySyncQueue.update({ where: { id: row.id }, data: { status: "SENT", payloadXml: xml, agentId: agent.id } });
        out.push({ queueId: row.id, entityType: row.entityType, entityId: row.entityId, remoteId: remoteId(row), xml });
      } catch (e) {
        await this.fail(row, e instanceof Error ? e.message : String(e));
      }
    }
    return { items: out, company };
  }

  /** A voucher waits while its party ledger master is still unsynced and not in this batch. */
  private async blockedByMaster(row: TallySyncQueue, batch: Set<string>) {
    const model = DOC_MODEL[row.entityType.replace(/_CANCEL$/, "")];
    if (!model) return false;
    const doc = (await (this.prisma as any)[model].findUnique({ where: { id: row.entityId } })) as { partyId?: string; supplierId?: string } | null;
    const partyId = doc?.partyId ?? doc?.supplierId;
    if (!partyId) return false;
    const masters = await this.prisma.tallySyncQueue.findMany({
      where: { entityType: "LEDGER", entityId: partyId, status: { in: ["PENDING", "SENT", "FAILED"] }, deletedAt: null },
      select: { id: true },
    });
    return masters.some((m) => !batch.has(m.id));
  }

  async buildXml(row: TallySyncQueue, company: string): Promise<string> {
    const rid = remoteId(row);
    switch (row.entityType) {
      case "LEDGER": {
        const p = await this.prisma.party.findUniqueOrThrow({ where: { id: row.entityId } });
        return envelope(company, "All Masters", ledgerXml({
          remoteId: rid,
          name: p.tallyLedgerName || p.name,
          parent: p.type === "SUPPLIER" ? "Sundry Creditors" : "Sundry Debtors",
          gstin: p.gstin,
          stateName: stateName(p.stateCode),
          address: p.billingAddress,
          phone: p.phone,
          exists: !!p.tallyLedgerGuid,
        }));
      }
      case "STOCK_ITEM": {
        const p = await this.prisma.product.findUniqueOrThrow({ where: { id: row.entityId } });
        return envelope(company, "All Masters", stockItemXml({
          remoteId: rid,
          name: stockItemName(p),
          hsn: p.hsn,
          gstRate: p.gstRate,
          pcsPerBox: p.uomType === "PIECE_BOX_AREA" ? p.pcsPerBox : null,
          baseUnit: p.uomType === "PIECE_BOX_AREA" ? "Pcs" : p.unitName === "set" ? "Set" : "Nos",
          exists: !!p.tallyStockItemGuid,
        }));
      }
      case "INVOICE":
      case "CREDIT_NOTE": {
        if (row.entityType === "CREDIT_NOTE") return envelope(company, "Vouchers", await this.creditNoteXml(row.entityId, rid));
        const inv = await this.prisma.invoice.findUniqueOrThrow({
          where: { id: row.entityId },
          include: { party: true, lines: { include: { product: true, batch: true } } },
        });
        const godowns = await this.prisma.godown.findMany({ where: { id: { in: inv.lines.map((l) => l.godownId).filter(Boolean) as string[] } } });
        const charges = n(inv.transportPaise) + n(inv.loadingPaise);
        const ledgers: LedgerLine[] = [
          { ledger: partyLedger(inv.party), debitPaise: n(inv.totalPaise), isParty: true, billRefs: [{ name: inv.number ?? rid, type: "New Ref", amountPaise: n(inv.totalPaise) }] },
          ...taxLedgers("Output", inv.cgstPaise, inv.sgstPaise, inv.igstPaise, -1),
          ...(charges ? [{ ledger: "Transport & Loading Charges", debitPaise: -charges }] : []),
          ...(n(inv.roundOffPaise) ? [{ ledger: "Round Off", debitPaise: -n(inv.roundOffPaise) }] : []),
        ];
        return envelope(company, "Vouchers", voucherXml({
          remoteId: rid,
          vchType: "Sales",
          date: inv.date,
          number: inv.number ?? rid,
          partyLedger: partyLedger(inv.party),
          narration: inv.notes,
          inventory: inv.lines.map((l) => ({
            stockItem: stockItemName(l.product),
            qty: l.qtyPcs,
            unit: l.product.uomType === "PIECE_BOX_AREA" ? "Pcs" : "Nos",
            ratePaise: n(l.ratePaise),
            amountPaise: n(l.taxablePaise),
            godown: godowns.find((g) => g.id === l.godownId)?.name,
            batch: l.batch && l.batch.batchNo !== "DEFAULT" ? `${l.batch.batchNo}/${l.batch.shadeCode}` : null,
            ledger: `Sales GST ${l.gstRate}%`,
          })),
          ledgers,
        }));
      }
      case "INVOICE_CANCEL": {
        const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: row.entityId } });
        return envelope(company, "Vouchers", cancelVoucherXml({ remoteId: `erp-invoice-${inv.id}`, vchType: "Sales", date: inv.date, number: inv.number ?? "", narration: inv.cancelReason ?? undefined }));
      }
      case "PURCHASE_INVOICE": {
        const pi = await this.prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: row.entityId }, include: { supplier: true, lines: { include: { product: true } } } });
        return envelope(company, "Vouchers", voucherXml({
          remoteId: rid,
          vchType: "Purchase",
          date: pi.date,
          number: pi.supplierInvoiceNo,
          reference: pi.supplierInvoiceNo,
          partyLedger: partyLedger(pi.supplier),
          inventoryIsDebit: true,
          inventory: pi.lines.map((l) => ({
            stockItem: stockItemName(l.product),
            qty: l.qtyPcs,
            unit: l.product.uomType === "PIECE_BOX_AREA" ? "Pcs" : "Nos",
            ratePaise: n(l.ratePaise),
            amountPaise: n(l.taxablePaise),
            ledger: `Purchase GST ${l.gstRate}%`,
          })),
          ledgers: [
            { ledger: partyLedger(pi.supplier), debitPaise: -n(pi.totalPaise), isParty: true, billRefs: [{ name: pi.supplierInvoiceNo, type: "New Ref", amountPaise: n(pi.totalPaise) }] },
            ...taxLedgers("Input", pi.cgstPaise, pi.sgstPaise, pi.igstPaise, 1),
            ...(n(pi.otherChargesPaise) ? [{ ledger: "Freight & Unloading Inward", debitPaise: n(pi.otherChargesPaise) }] : []),
            ...(n(pi.roundOffPaise) ? [{ ledger: "Round Off", debitPaise: n(pi.roundOffPaise) }] : []),
          ],
        }));
      }
      case "DEBIT_NOTE": {
        const dn = await this.prisma.debitNote.findUniqueOrThrow({ where: { id: row.entityId }, include: { supplier: true } });
        return envelope(company, "Vouchers", voucherXml({
          remoteId: rid,
          vchType: "Debit Note",
          date: dn.date,
          number: dn.number,
          partyLedger: partyLedger(dn.supplier),
          narration: dn.reason,
          ledgers: [
            { ledger: partyLedger(dn.supplier), debitPaise: n(dn.totalPaise), isParty: true },
            { ledger: "Purchase Returns", debitPaise: -n(dn.taxablePaise) },
            { ledger: "Input GST Reversal", debitPaise: -n(dn.taxPaise) },
          ],
        }));
      }
      case "RECEIPT": {
        const r = await this.prisma.receipt.findUniqueOrThrow({ where: { id: row.entityId }, include: { party: true, allocations: { where: { deletedAt: null }, include: { invoice: true } } } });
        const bills = r.allocations.map((a) => ({ name: a.invoice.number ?? a.invoiceId, type: "Agst Ref" as const, amountPaise: n(a.amountPaise) }));
        if (n(r.unallocatedPaise) > 0) bills.push({ name: r.number, type: "On Account" as never, amountPaise: n(r.unallocatedPaise) });
        return envelope(company, "Vouchers", voucherXml({
          remoteId: rid,
          vchType: "Receipt",
          date: r.date,
          number: r.number,
          partyLedger: partyLedger(r.party),
          narration: [r.mode, r.chequeNo && `Chq ${r.chequeNo}`, r.bankName, r.reference].filter(Boolean).join(" · "),
          ledgers: [
            { ledger: r.mode === "CASH" ? "Cash" : "Bank Account", debitPaise: n(r.amountPaise) },
            { ledger: partyLedger(r.party), debitPaise: -n(r.amountPaise), isParty: true, billRefs: bills },
          ],
        }));
      }
      case "PAYMENT": {
        const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: row.entityId }, include: { party: true, allocations: { where: { deletedAt: null }, include: { purchaseInvoice: true } } } });
        return envelope(company, "Vouchers", voucherXml({
          remoteId: rid,
          vchType: "Payment",
          date: p.date,
          number: p.number,
          partyLedger: partyLedger(p.party),
          narration: [p.mode, p.reference].filter(Boolean).join(" · "),
          ledgers: [
            { ledger: partyLedger(p.party), debitPaise: n(p.amountPaise), isParty: true, billRefs: p.allocations.map((a) => ({ name: a.purchaseInvoice.supplierInvoiceNo, type: "Agst Ref" as const, amountPaise: n(a.amountPaise) })) },
            { ledger: p.mode === "CASH" ? "Cash" : "Bank Account", debitPaise: -n(p.amountPaise) },
          ],
        }));
      }
      case "RECEIPT_CANCEL":
      case "PAYMENT_CANCEL": {
        const isR = row.entityType === "RECEIPT_CANCEL";
        const d = isR ? await this.prisma.receipt.findUniqueOrThrow({ where: { id: row.entityId } }) : await this.prisma.payment.findUniqueOrThrow({ where: { id: row.entityId } });
        return envelope(company, "Vouchers", cancelVoucherXml({ remoteId: `erp-${isR ? "receipt" : "payment"}-${d.id}`, vchType: isR ? "Receipt" : "Payment", date: d.date, number: d.number }));
      }
      default:
        throw new BadRequestException(`No Tally XML builder for ${row.entityType}`);
    }
  }

  private async creditNoteXml(id: string, rid: string) {
    const cn = await this.prisma.creditNote.findUniqueOrThrow({ where: { id }, include: { party: true } });
    const inv = cn.invoiceId ? await this.prisma.invoice.findUnique({ where: { id: cn.invoiceId } }) : null;
    return voucherXml({
      remoteId: rid,
      vchType: "Credit Note",
      date: cn.date,
      number: cn.number,
      partyLedger: partyLedger(cn.party),
      narration: cn.reason,
      ledgers: [
        { ledger: partyLedger(cn.party), debitPaise: -n(cn.totalPaise), isParty: true, billRefs: inv?.number ? [{ name: inv.number, type: "Agst Ref", amountPaise: n(cn.totalPaise) }] : [] },
        { ledger: "Sales Returns", debitPaise: n(cn.taxablePaise) },
        ...taxLedgers("Output", cn.cgstPaise, cn.sgstPaise, cn.igstPaise, 1),
      ],
    });
  }

  // ------------------------------------------------------------------ ack

  async ack(agent: TallyAgent, a: TallyAck) {
    const row = await this.prisma.tallySyncQueue.findFirst({ where: { id: a.queueId, deletedAt: null } });
    if (!row) throw new NotFoundException("Queue item not found");
    if (row.status === "SUCCESS") return { ok: true, status: "SUCCESS", duplicate: true };
    if (a.status === "SUCCESS") {
      await this.prisma.tx(async (tx) => {
        await tx.tallySyncQueue.update({
          where: { id: row.id },
          data: { status: "SUCCESS", tallyGuid: a.tallyGuid ?? null, rawResponse: a.rawResponse?.slice(0, 20000) ?? null, lastError: null, agentId: agent.id },
        });
        if (a.tallyGuid) await this.applyGuid(tx, row, a.tallyGuid);
      });
      return { ok: true, status: "SUCCESS" };
    }
    const status = await this.fail(row, a.error || "Tally returned an error", a.rawResponse ?? undefined);
    return { ok: true, status };
  }

  private async fail(row: TallySyncQueue, error: string, raw?: string) {
    const attempts = row.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    await this.prisma.tallySyncQueue.update({
      where: { id: row.id },
      data: {
        attempts,
        status: final ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(Date.now() + wait * 60_000),
        lastError: error.slice(0, 4000),
        rawResponse: raw?.slice(0, 20000) ?? row.rawResponse,
      },
    });
    if (final) await this.setDocSync(this.prisma, row, "FAILED");
    return final ? "FAILED" : "PENDING";
  }

  private async applyGuid(tx: Tx, row: TallySyncQueue, guid: string) {
    const base = row.entityType.replace(/_CANCEL$/, "");
    if (row.entityType.endsWith("_CANCEL")) return;
    await tx.tallyMapping.upsert({
      where: { erpEntity_erpId: { erpEntity: base, erpId: row.entityId } },
      create: { erpEntity: base, erpId: row.entityId, tallyGuid: guid },
      update: { tallyGuid: guid },
    });
    if (base === "LEDGER") {
      const p = await tx.party.findUniqueOrThrow({ where: { id: row.entityId } });
      await tx.party.update({ where: { id: p.id }, data: { tallyLedgerGuid: guid, tallyLedgerName: p.tallyLedgerName ?? p.name } });
    } else if (base === "STOCK_ITEM") {
      await tx.product.update({ where: { id: row.entityId }, data: { tallyStockItemGuid: guid } });
    } else if (DOC_MODEL[base]) {
      await (tx as any)[DOC_MODEL[base]].update({ where: { id: row.entityId }, data: { tallyVoucherGuid: guid, syncStatus: "SYNCED" } });
    }
  }

  private async setDocSync(db: Tx | PrismaService, row: TallySyncQueue, state: "SYNCED" | "FAILED" | "PENDING") {
    const model = DOC_MODEL[row.entityType.replace(/_CANCEL$/, "")];
    if (model) await (db as any)[model].update({ where: { id: row.entityId }, data: { syncStatus: state } }).catch(() => undefined);
  }

  async retry(id: string) {
    const row = await this.prisma.tallySyncQueue.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException("Queue item not found");
    if (row.status === "SUCCESS") throw new BadRequestException("Already synced");
    const after = await this.prisma.tallySyncQueue.update({ where: { id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), ...stampUpdate() } });
    await this.setDocSync(this.prisma, row, "PENDING");
    await this.audit.log({ entity: "tally_sync_queue", entityId: id, action: "retry", before: row, after });
    return after;
  }

  // ------------------------------------------------------------------ inbound (Tally → ERP)

  async inbound(agent: TallyAgent, body: TallyInbound) {
    const result = { processed: 0, created: 0, skipped: 0, errors: [] as string[] };
    for (const item of body.items) {
      try {
        if (body.kind === "LEDGER") {
          const r = await this.inboundLedger(item);
          result[r]++;
        } else if (body.kind === "VOUCHER") {
          const r = await this.inboundVoucher(agent, item);
          result[r]++;
        } else {
          const party = await this.findParty(item.guid ?? item.partyGuid, item.name ?? item.partyName);
          if (!party) {
            result.skipped++;
            continue;
          }
          const closing = body.kind === "BALANCE" ? (item.closingPaise ?? 0) : (item.billRefs ?? []).reduce((a, b) => a + b.amountPaise, 0);
          await this.prisma.ledgerBalanceSnapshot.create({ data: { partyId: party.id, closingPaise: BigInt(closing), asOf: new Date(), source: `TALLY_${body.kind}` } });
          result.processed++;
        }
      } catch (e) {
        result.errors.push(`${item.name ?? item.voucherNumber ?? item.guid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (body.lastAlterId && body.lastAlterId > Number(agent.lastAlterId)) {
      await this.prisma.tallyAgent.update({ where: { id: agent.id }, data: { lastAlterId: BigInt(body.lastAlterId) } });
    }
    return result;
  }

  private async findParty(guid?: string | null, name?: string | null) {
    if (guid) {
      const byGuid = await this.prisma.party.findFirst({ where: { tallyLedgerGuid: guid, deletedAt: null } });
      if (byGuid) return byGuid;
    }
    if (name) {
      return this.prisma.party.findFirst({
        where: { deletedAt: null, OR: [{ tallyLedgerName: { equals: name, mode: "insensitive" } }, { name: { equals: name, mode: "insensitive" } }] },
      });
    }
    return null;
  }

  private async inboundLedger(item: TallyInbound["items"][number]): Promise<"processed" | "created" | "skipped"> {
    const party = await this.findParty(item.guid, item.name);
    if (party) {
      await this.prisma.party.update({
        where: { id: party.id },
        data: { tallyLedgerGuid: item.guid ?? party.tallyLedgerGuid, tallyLedgerName: item.name ?? party.tallyLedgerName, gstin: party.gstin ?? item.gstin ?? null },
      });
      if (item.guid) {
        await this.prisma.tallyMapping.upsert({
          where: { erpEntity_erpId: { erpEntity: "LEDGER", erpId: party.id } },
          create: { erpEntity: "LEDGER", erpId: party.id, tallyGuid: item.guid, tallyName: item.name },
          update: { tallyGuid: item.guid, tallyName: item.name },
        });
      }
      return "processed";
    }
    if (!item.name || !item.parent || !/sundry (debtors|creditors)/i.test(item.parent)) return "skipped";
    const created = await this.prisma.party.create({
      data: {
        type: /creditors/i.test(item.parent) ? "SUPPLIER" : "CUSTOMER",
        name: item.name,
        gstin: item.gstin ?? null,
        stateCode: item.gstin?.slice(0, 2) || "33",
        tallyLedgerGuid: item.guid ?? null,
        tallyLedgerName: item.name,
        notes: "Imported from Tally",
      },
    });
    if (item.guid) await this.prisma.tallyMapping.create({ data: { erpEntity: "LEDGER", erpId: created.id, tallyGuid: item.guid, tallyName: item.name } });
    return "created";
  }

  /** Receipts entered in Tally come back as ERP receipts allocated to invoices by bill reference. */
  private async inboundVoucher(agent: TallyAgent, item: TallyInbound["items"][number]): Promise<"processed" | "created" | "skipped"> {
    if (!item.voucherType || !/receipt/i.test(item.voucherType)) return "skipped";
    if (!item.guid) return "skipped";
    const existing = await this.prisma.receipt.findFirst({ where: { tallyVoucherGuid: item.guid } });
    if (existing) return "skipped";
    const mapped = await this.prisma.tallyMapping.findFirst({ where: { tallyGuid: item.guid } });
    if (mapped) return "skipped"; // created by the ERP and already synced
    const party = await this.findParty(item.partyGuid, item.partyName);
    if (!party) throw new Error(`Party "${item.partyName}" not found in ERP`);
    const amountPaise = Math.abs(item.amountPaise ?? 0);
    if (!amountPaise) return "skipped";
    const date = item.date ? parseTallyDate(item.date) : new Date();
    await this.prisma.tx(async (tx) => {
      const number = await this.numbering.next(tx, agent.branchId, "RECEIPT", date);
      const r = await tx.receipt.create({
        data: {
          branchId: agent.branchId,
          number,
          date,
          partyId: party.id,
          mode: "NEFT",
          reference: item.voucherNumber ? `Tally ${item.voucherNumber}` : "Tally",
          amountPaise: BigInt(amountPaise),
          unallocatedPaise: BigInt(amountPaise),
          source: "TALLY",
          tallyVoucherGuid: item.guid,
          syncStatus: "SYNCED",
        },
      });
      let left = amountPaise;
      for (const b of item.billRefs ?? []) {
        if (left <= 0) break;
        const inv = await tx.invoice.findFirst({ where: { number: b.name, partyId: party.id, status: "POSTED", deletedAt: null } });
        if (!inv) continue;
        const due = n(inv.totalPaise) - n(inv.paidPaise);
        const a = Math.min(due, Math.abs(b.amountPaise), left);
        if (a <= 0) continue;
        await tx.receiptAllocation.create({ data: { receiptId: r.id, invoiceId: inv.id, amountPaise: BigInt(a) } });
        await tx.invoice.update({ where: { id: inv.id }, data: { paidPaise: { increment: BigInt(a) } } });
        left -= a;
      }
      await tx.receipt.update({ where: { id: r.id }, data: { unallocatedPaise: BigInt(left) } });
      await tx.tallyMapping.create({ data: { erpEntity: "RECEIPT", erpId: r.id, tallyGuid: item.guid!, tallyName: item.voucherNumber } });
      await this.audit.log({ entity: "receipt", entityId: r.id, action: "import_from_tally", after: r }, tx);
    });
    return "created";
  }

  // ------------------------------------------------------------------ reconciliation

  async reconciliation(dateStr?: string) {
    const day = dateStr ? new Date(`${dateStr}T00:00:00+05:30`) : startOfIstDay(new Date());
    const end = new Date(day.getTime() + 86_400_000);
    const range = { gte: day, lt: end };
    const sum = (rows: { totalPaise?: bigint; amountPaise?: bigint }[]) => rows.reduce((a, r) => a + n(r.totalPaise ?? r.amountPaise), 0);
    const [inv, pis, rcs] = await Promise.all([
      this.prisma.invoice.findMany({ where: { date: range, status: "POSTED", deletedAt: null }, select: { totalPaise: true, syncStatus: true } }),
      this.prisma.purchaseInvoice.findMany({ where: { date: range, status: "POSTED", deletedAt: null }, select: { totalPaise: true, syncStatus: true } }),
      this.prisma.receipt.findMany({ where: { date: range, status: "POSTED", deletedAt: null }, select: { amountPaise: true, syncStatus: true } }),
    ]);
    const row = (label: string, all: { syncStatus: string; totalPaise?: bigint; amountPaise?: bigint }[]) => {
      const synced = all.filter((x) => x.syncStatus === "SYNCED");
      return { type: label, erpCount: all.length, erpValuePaise: sum(all), tallyCount: synced.length, tallyValuePaise: sum(synced), matched: all.length === synced.length };
    };
    return { date: day.toISOString(), rows: [row("Sales invoices", inv), row("Purchase invoices", pis), row("Receipts", rcs)] };
  }

  async health() {
    const [pending, failed, sent, agents] = await Promise.all([
      this.prisma.tallySyncQueue.count({ where: { status: "PENDING", deletedAt: null } }),
      this.prisma.tallySyncQueue.count({ where: { status: "FAILED", deletedAt: null } }),
      this.prisma.tallySyncQueue.count({ where: { status: "SENT", deletedAt: null } }),
      this.prisma.tallyAgent.findMany({ where: { deletedAt: null }, select: { id: true, name: true, lastSeenAt: true, tallyRunning: true, isActive: true } }),
    ]);
    return { pending, failed, sent, agents };
  }
}

export function remoteId(row: { entityType: string; entityId: string }) {
  return `erp-${row.entityType.toLowerCase().replace(/_cancel$/, "").replace(/_/g, "-")}-${row.entityId}`;
}

function partyLedger(p: { name: string; tallyLedgerName: string | null }) {
  return p.tallyLedgerName || p.name;
}

function stockItemName(p: { sku: string; name: string }) {
  return `${p.name} (${p.sku})`;
}

function taxLedgers(kind: "Output" | "Input", cgst: bigint, sgst: bigint, igst: bigint, sign: 1 | -1): LedgerLine[] {
  return [
    { ledger: `${kind} CGST`, debitPaise: sign * n(cgst) },
    { ledger: `${kind} SGST`, debitPaise: sign * n(sgst) },
    { ledger: `${kind} IGST`, debitPaise: sign * n(igst) },
  ].filter((l) => l.debitPaise !== 0);
}

function parseTallyDate(s: string): Date {
  if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00+05:30`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function startOfIstDay(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

export { amt };
