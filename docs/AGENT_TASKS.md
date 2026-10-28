# Agent Tasks & Coordination Matrix

This document defines the tasks and coordination protocols for virtual specialized agents.

---

## 1. Directory Permissions & File Ownership

To avoid overwriting files, each virtual agent owns specific directories and modules:

| Agent | Module Ownership | Core Directories |
| :--- | :--- | :--- |
| **DATABASE** | Prisma Schema & Client | `/prisma/*` |
| **AUTHENTICATION**| Auth, Sessions, RBAC | `/src/lib/auth/*`, `/src/app/(auth)/*` |
| **ERP_LAYOUT** | Shell UI, Header, Sidebar | `/src/components/erp/*`, `/src/app/(dashboard)/layout.tsx` |
| **DASHBOARD** | Summary view & charts | `/src/app/(dashboard)/dashboard/*` |
| **PRODUCTS** | Product details & units | `/src/app/(dashboard)/stock/products/*` |
| **INVENTORY** | Stock ledgers & updates | `/src/lib/inventory/*` |
| **WAREHOUSE** | Warehouses, bins, transfers | `/src/app/(dashboard)/stock/warehouses/*` |
| **CUSTOMERS** | Customer masters | `/src/app/(dashboard)/sales/customers/*` |
| **SALES** | Quotations & orders | `/src/app/(dashboard)/sales/orders/*` |
| **INVOICE** | SixOrbit Invoice screen | `/src/app/(dashboard)/sales/invoices/*` |
| **PURCHASE** | Vendors, POs, bills | `/src/app/(dashboard)/purchase/*` |
| **GOODS_RECEIPT** | GRN & Stock-in | `/src/app/(dashboard)/purchase/grn/*` |
| **FINANCE** | Ledgers & double-entry | `/src/lib/finance/*`, `/src/app/(dashboard)/finance/*` |
| **GST_TAX** | Indian GST engine | `/src/lib/tax/*` |
| **APPROVAL** | Workflows & logs | `/src/lib/approval/*`, `/src/app/(dashboard)/administration/*` |
| **BARCODE_QR** | Scanning & image gen | `/src/lib/barcode/*`, `/src/components/forms/BarcodeScanner.tsx` |
| **REPORTS** | CSV, Excel, PDF gen | `/src/app/(dashboard)/reports/*`, `/src/components/documents/*` |

---

## 2. Virtual Agent Task Checklist

### Stage A: Foundation & Setup
1. **DATABASE Agent**: Set up the initial `schema.prisma` file, verify connection parameters, and run first migration.
2. **AUTHENTICATION Agent**: Implement session endpoints, middleware route blocks, password hashing, and user role verification.
3. **ERP_LAYOUT Agent**: Implement the navbar, header, outlet selector, and responsive sidebar templates.
4. **GST_TAX Agent**: Write the localized GST engine (`src/lib/tax/gst.ts`) for CGST, SGST, IGST, and HSN calculations.

### Stage B: Inventory & Core Master Data
5. **PRODUCTS Agent**: Create product categories, units, and brand forms. Write the product creation dashboard.
6. **WAREHOUSE Agent**: Define warehouses, racks, and bins configuration screens.
7. **INVENTORY Agent**: Implement transaction triggers. Ensure that any change in stock records an `InventoryLedger` entry in a database transaction.
8. **CUSTOMERS Agent**: Build customer groups, outstanding trackers, and address management forms.

### Stage C: Procurement Workflow
9. **PURCHASE Agent**: Write vendor creation screens, Purchase Requisitions, and Purchase Orders.
10. **GOODS_RECEIPT Agent**: Write the Goods Receipt Note (GRN) action. Ensure that validating a GRN calls `INVENTORY Agent` functions to write stock ledger rows.

### Stage D: Sales & Invoice Layout
11. **SALES Agent**: Build quotations and order tracking.
12. **INVOICE Agent**: Implement the full SixOrbit Sales Invoice creation layout (Billing/Shipping panels, Transport options, items list table with automatic discount/tax calculations). Connect it to the barcode scanning components.

### Stage E: Financial Accounting & Utilities
13. **FINANCE Agent**: Write Chart of Accounts setup, General Ledgers, and Trial Balance queries. Connect Sales Invoice and Purchase Bill creation events to generate double-entry `JournalEntry` records.
14. **APPROVAL Agent**: Build approval triggers for POs, stock transfers, and expenses.
15. **BARCODE_QR Agent**: Integrate camera-based barcode scanning components.
16. **REPORTS Agent**: Write tabular report screens for stock summary, sales logs, day book, and GST summaries. Connect client-side PDF and Excel download buttons.
