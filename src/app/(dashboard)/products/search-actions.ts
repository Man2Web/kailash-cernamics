"use server";

import db from "@/lib/db/db";
import { getSession, sessionCan } from "@/lib/auth/auth";

export interface ProductSearchOption {
  variantId: string;
  productId: string;
  name: string;
  variantName: string;
  sku: string;
  code: string;
  sellingPrice: number;
  purchasePrice: number;
  label: string;
}

/** Server-side product search for pickers. Matches name, code, SKU and variant SKU; returns at most 20 variants. */
export async function searchProductsAction(query: string): Promise<{ options: ProductSearchOption[]; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { options: [], error: "Please sign in again." };
    const allowed = ["stock:view", "sales:create", "sales:view", "purchase:create", "purchase:view", "invoices:create"].some((c) =>
      sessionCan(session, c)
    );
    if (!allowed) return { options: [], error: "You do not have permission to search products." };

    const q = String(query ?? "").trim().slice(0, 80);
    const where: any = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {};
    const products = await db.product.findMany({
      where,
      include: { variants: true },
      orderBy: { name: "asc" },
      take: 20,
    });
    const options: ProductSearchOption[] = [];
    for (const p of products as any[]) {
      for (const v of p.variants || []) {
        options.push({
          variantId: v.id,
          productId: p.id,
          name: p.name,
          variantName: v.name,
          sku: v.sku || p.sku,
          code: p.code,
          sellingPrice: Number(p.sellingPrice || 0),
          purchasePrice: Number(p.purchasePrice || 0),
          label: `${p.name}${v.name && v.name !== "Standard" ? ` – ${v.name}` : ""} (${v.sku || p.sku})`,
        });
      }
    }
    return { options: options.slice(0, 20) };
  } catch (e: any) {
    console.error("searchProductsAction failed:", e);
    return { options: [], error: "Product search failed. Please try again." };
  }
}
