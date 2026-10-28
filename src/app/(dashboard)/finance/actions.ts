"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";

const DEFAULT_ACCOUNTS = [
  { code: "1200", name: "Accounts Receivable (Customers)", type: "ASSET" },
  { code: "2100", name: "Accounts Payable (Vendors)", type: "LIABILITY" },
  { code: "4100", name: "Sales Revenue", type: "INCOME" },
  { code: "5100", name: "Purchase Expense", type: "EXPENSE" },
  
  // Tax Accounts
  { code: "1300", name: "Input CGST", type: "ASSET" },
  { code: "1301", name: "Input SGST", type: "ASSET" },
  { code: "1302", name: "Input IGST", type: "ASSET" },
  
  { code: "2200", name: "Output CGST", type: "LIABILITY" },
  { code: "2201", name: "Output SGST", type: "LIABILITY" },
  { code: "2202", name: "Output IGST", type: "LIABILITY" },

  // Equity
  { code: "3100", name: "Share Capital", type: "EQUITY" },
];

export async function initializeChartOfAccounts() {
  const session = await authorize({ adminOnly: true });
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const results = await db.$transaction(async (tx) => {
      const created = [];
      for (const account of DEFAULT_ACCOUNTS) {
        const existing = await tx.chartOfAccount.findUnique({
          where: { code: account.code },
        });

        if (!existing) {
          const coa = await tx.chartOfAccount.create({
            data: {
              code: account.code,
              name: account.name,
              type: account.type,
            },
          });
          
          // Create ledger entry
          await tx.ledger.create({
            data: {
              accountId: coa.id,
              balance: 0,
            },
          });
          created.push(coa);
        }
      }
      return created;
    });

    revalidatePath("/finance");
    return { success: true, count: results.length };
  } catch (error: any) {
    console.error("Error initializing Chart of Accounts:", error);
    return { error: error.message || "Failed to initialize Chart of Accounts" };
  }
}
