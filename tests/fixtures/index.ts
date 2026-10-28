/**
 * Base Fixtures for SixOrbit ERP Testing
 */

export const BASE_CUSTOMER_FIXTURE = {
  name: "Acme Enterprises",
  email: "billing@acme-enterprises.test",
  phone: "9876543210",
  gstin: "27AAACA0000A1Z5",
  creditLimit: 500000,
  paymentTermsDays: 30,
  state: "Maharashtra",
  addressLine1: "123 Business Park, Andheri East",
  city: "Mumbai",
  postalCode: "400069",
};

export const BASE_VENDOR_FIXTURE = {
  name: "Global Steel Suppliers",
  email: "sales@globalsteel.test",
  phone: "9123456780",
  gstin: "24AAACG1234G1Z9",
  paymentTermsDays: 45,
  state: "Gujarat",
  addressLine1: "456 Industrial Area, GIDC",
  city: "Surat",
  postalCode: "395001",
};

export const BASE_PRODUCT_FIXTURE = {
  name: "Aluminium Composite Panel 4mm",
  sku: "ACP-4MM-SILVER",
  hsnCode: "76061200",
  baseUnit: "NOS",
  gstRate: 18.0,
  costPrice: 450.0,
  sellingPrice: 650.0,
  openingStock: 100,
  minStockLevel: 20,
};

export const BASE_WAREHOUSE_FIXTURE = {
  name: "Main Central Hub",
  code: "WH-MUM-01",
  address: "Plot 12, Logistic Hub, Bhiwandi",
  city: "Mumbai",
  state: "Maharashtra",
};
