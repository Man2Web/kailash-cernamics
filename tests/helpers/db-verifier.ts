/**
 * Database Verification Helper for Multi-Agent QA
 * Performs direct database queries to verify data persistence and business constraints.
 */

import db from "@/lib/db/db";

export class DatabaseVerifier {
  /**
   * Confirms a record exists in the specified table
   */
  static async verifyRecordExists(modelName: string, queryWhere: Record<string, any>): Promise<any> {
    const model = (db as any)[modelName];
    if (!model || typeof model.findFirst !== "function") {
      throw new Error(`Database model '${modelName}' not recognized.`);
    }

    const record = await model.findFirst({ where: queryWhere });
    if (!record) {
      throw new Error(`[DB Verification Failed] Record in '${modelName}' with query ${JSON.stringify(queryWhere)} was NOT found.`);
    }
    return record;
  }

  /**
   * Confirms a record does NOT exist in the specified table
   */
  static async verifyRecordDoesNotExist(modelName: string, queryWhere: Record<string, any>): Promise<boolean> {
    const model = (db as any)[modelName];
    if (!model || typeof model.findFirst !== "function") {
      throw new Error(`Database model '${modelName}' not recognized.`);
    }

    const record = await model.findFirst({ where: queryWhere });
    if (record) {
      throw new Error(`[DB Verification Failed] Record in '${modelName}' with query ${JSON.stringify(queryWhere)} was unexpectedly found.`);
    }
    return true;
  }

  /**
   * Verifies field values on a database row
   */
  static async verifyRecordFields(modelName: string, id: string, expectedFields: Record<string, any>): Promise<boolean> {
    const model = (db as any)[modelName];
    const record = await model.findUnique({ where: { id } });
    if (!record) {
      throw new Error(`[DB Verification Failed] Record ${id} in '${modelName}' not found.`);
    }

    for (const [key, val] of Object.entries(expectedFields)) {
      if (record[key] !== val && Number(record[key]) !== Number(val)) {
        throw new Error(
          `[DB Verification Failed] Field mismatch on ${modelName}.${key}: expected '${val}', got '${record[key]}'.`
        );
      }
    }
    return true;
  }

  /**
   * Calculates current stock from stock ledger entries
   */
  static async calculateProductStock(productId: string): Promise<number> {
    try {
      const ledgers = await db.stockLedger.findMany({
        where: { productId },
      });
      let stock = 0;
      (ledgers || []).forEach((entry: any) => {
        if (entry.type === "IN" || entry.movementType === "PURCHASE" || entry.movementType === "OPENING") {
          stock += Number(entry.quantity || 0);
        } else if (entry.type === "OUT" || entry.movementType === "SALE") {
          stock -= Number(entry.quantity || 0);
        }
      });
      return stock;
    } catch {
      return 0;
    }
  }

  /**
   * Calculates total customer balance from invoices & payments
   */
  static async calculateCustomerOutstanding(customerId: string): Promise<number> {
    try {
      const invoices = await db.invoice.findMany({
        where: { customerId },
      });
      let balance = 0;
      (invoices || []).forEach((inv: any) => {
        balance += Number(inv.balanceDue || inv.totalAmount || 0);
      });
      return balance;
    } catch {
      return 0;
    }
  }
}
