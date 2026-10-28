import React from "react";
import db from "@/lib/db/db";
import InvoiceCreateClient from "@/components/erp/InvoiceCreateClient";

export default async function InvoiceCreatePage() {
  // 1. Fetch Customers, Outlets, Warehouses, Bins, and Products for dropdown selectors
  const customers = await db.customer.findMany({
    include: {
      addresses: true,
      group: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const outlets = await db.outlet.findMany({
    include: {
      branch: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const products = await db.product.findMany({
    include: {
      variants: true,
      unit: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const warehouses = await db.warehouse.findMany({
    include: {
      locations: {
        include: {
          racks: {
            include: {
              bins: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const branches = await db.branch.findMany({
    orderBy: {
      name: "asc",
    },
  });

  // Format price list schema if needed
  const priceLists = await db.priceList.findMany({
    orderBy: {
      name: "asc",
    },
  });

  const formattedCustomers = customers.map((c) => ({
    ...c,
    creditLimit: Number(c.creditLimit),
    outstandingAmt: Number(c.outstandingAmt),
    group: {
      ...c.group,
      discountPercent: Number(c.group.discountPercent),
    },
  }));

  const formattedProducts = products.map((p) => ({
    ...p,
    purchasePrice: Number(p.purchasePrice),
    sellingPrice: Number(p.sellingPrice),
    mrp: Number(p.mrp),
    gstRate: Number(p.gstRate),
    minStock: Number(p.minStock),
    reorderLevel: Number(p.reorderLevel),
  }));

  return (
    <InvoiceCreateClient
      customers={formattedCustomers}
      outlets={outlets}
      products={formattedProducts}
      warehouses={warehouses}
      branches={branches}
      priceLists={priceLists}
    />
  );
}
