/**
 * Dynamic Test Data Factories for SixOrbit ERP Testing
 * Strictly conforms to PostgreSQL schema definitions in schema.sql.
 */

export function generateTestSuffix(): string {
  const timestamp = Date.now().toString().slice(-6);
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${timestamp}-${rand}`;
}

export function buildCustomer(runId: string, overrides: Record<string, any> = {}) {
  const suffix = generateTestSuffix();
  return {
    id: `cust-${runId}-${suffix}`,
    name: `QA-CUST-${runId}-${suffix}`,
    code: `QC-${runId}-${suffix}`,
    email: `qa-cust-${suffix}@test.sixorbit.local`,
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    gstin: `27AAACA${Math.floor(1000 + Math.random() * 9000)}A1Z5`,
    creditLimit: 500000,
    outstandingAmt: 0,
    ...overrides,
  };
}

export function buildVendor(runId: string, overrides: Record<string, any> = {}) {
  const suffix = generateTestSuffix();
  return {
    id: `vend-${runId}-${suffix}`,
    name: `QA-VEND-${runId}-${suffix}`,
    code: `QV-${runId}-${suffix}`,
    email: `qa-vend-${suffix}@test.sixorbit.local`,
    phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
    gstin: `24AAACG${Math.floor(1000 + Math.random() * 9000)}G1Z9`,
    outstandingAmt: 0,
    ...overrides,
  };
}

export function buildProduct(runId: string, overrides: Record<string, any> = {}) {
  const suffix = generateTestSuffix();
  return {
    id: `prod-${runId}-${suffix}`,
    name: `QA-PROD-${runId}-${suffix}`,
    sku: `QA-SKU-${runId}-${suffix}`,
    code: `QP-${runId}-${suffix}`,
    hsnCode: "76061200",
    description: `Automated Test Stock Item for ${runId}`,
    purchasePrice: 450,
    sellingPrice: 650,
    mrp: 750,
    gstRate: 18.0,
    unitName: "NOS",
    minStock: 10,
    reorderLevel: 20,
    ...overrides,
  };
}

export function buildWarehouse(runId: string, overrides: Record<string, any> = {}) {
  const suffix = generateTestSuffix();
  return {
    id: `wh-${runId}-${suffix}`,
    name: `QA-WH-${runId}-${suffix}`,
    code: `WH-${suffix}`,
    address: "Plot 12, Logistic Hub, Bhiwandi",
    ...overrides,
  };
}

export function buildSalesInvoice(runId: string, customerId: string, items: any[], overrides: Record<string, any> = {}) {
  const suffix = generateTestSuffix();
  let totalQty = 0;
  let totalTaxableAmount = 0;
  let totalDiscountAmount = 0;
  let totalTaxAmount = 0;

  const invoiceItems = items.map((item) => {
    const qty = Number(item.quantity || 1);
    const rate = Number(item.rate || 100);
    const discount = Number(item.discount || 0);
    const taxableAmt = qty * rate - discount;
    const gstRate = Number(item.gstRate || 18);
    const isInterstate = Boolean(overrides.isInterstate);
    const taxAmt = (taxableAmt * gstRate) / 100;
    const cgstAmt = isInterstate ? 0 : taxAmt / 2;
    const sgstAmt = isInterstate ? 0 : taxAmt / 2;
    const igstAmt = isInterstate ? taxAmt : 0;
    const totalAmt = taxableAmt + taxAmt;

    totalQty += qty;
    totalTaxableAmount += taxableAmt;
    totalDiscountAmount += discount;
    totalTaxAmount += taxAmt;

    return {
      productName: item.productName || "Test Product",
      unitName: item.unitName || "Nos",
      quantity: qty,
      rate,
      discount,
      taxableAmt,
      gstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      totalAmt,
    };
  });

  const totalPayableAmount = Math.round((totalTaxableAmount + totalTaxAmount) * 100) / 100;
  const now = new Date();
  const due = new Date(Date.now() + 30 * 86400000);

  return {
    id: `inv-${runId}-${suffix}`,
    invoiceNo: `QA-INV-${runId}-${suffix}`,
    customerId,
    invoiceDate: now,
    date: now,
    dueDate: due,
    totalQty,
    totalTaxableAmount,
    totalTaxable: totalTaxableAmount,
    totalDiscountAmount,
    totalTaxAmount,
    totalTax: totalTaxAmount,
    totalPayableAmount,
    totalPayable: totalPayableAmount,
    roundOff: 0,
    status: "CONFIRMED",
    paymentStatus: "UNPAID",
    billingAddress: "123 Business Park",
    billingState: "Maharashtra",
    billingCity: "Mumbai",
    billingPincode: "400069",
    deliveryAddress: "123 Business Park",
    deliveryState: "Maharashtra",
    deliveryCity: "Mumbai",
    deliveryPincode: "400069",
    customerName: overrides.customerName || "QA Customer",
    customerGstin: overrides.customerGstin || "27AAACA0000A1Z5",
    items: invoiceItems,
    ...overrides,
  };
}
