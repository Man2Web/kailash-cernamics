# System Architecture - SixOrbit ERP & Inventory

This document defines the core architecture, file layout, directory structure, data flow, and standard conventions for the SixOrbit-inspired ERP and Inventory Management System.

---

## 1. Technology Stack

### Frontend
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui + Radix UI primitives
- **Icons**: Lucide React
- **Form Management**: React Hook Form
- **Schema Validation**: Zod
- **Data Fetching/Caching**: TanStack Query (React Query)
- **State Management**: Zustand (where cross-component global state is required, such as local cart/invoice draft state, notification state, active outlet selection)

### Backend
- **Framework**: Next.js Server Actions & API Routes (Server Actions for forms/mutations, API Routes for data exports and high-performance reporting)
- **ORM**: Prisma ORM
- **Database**: PostgreSQL (v18+)
- **Migrations**: Prisma migrations

### Security & Authentication
- **Session Management**: JWT or secure database sessions with HTTP-only cookies
- **Password Hashing**: bcryptjs or argon2
- **Authorization**: Server-side Role-Based Access Control (RBAC) with middleware-level route protection and service-level permission checks.

### Integrations
- **Charting**: Recharts
- **PDF Generation**: `jspdf` / `jspdf-autotable` (A4 client-side or server-side print generation)
- **Excel/CSV Export**: `xlsx` / `papaparse`
- **Barcode & QR Generation**: `canvas` / `qrcode` / `bwip-js`
- **Barcode Scanning**: Camera-based scanning via `html5-qrcode` + USB scanner event listener capture.

---

## 2. Directory Structure

The codebase is organized as follows:

```
src/
├── app/                      # Next.js App Router routes
│   ├── (auth)/               # Authentication route group (login, logout, reset)
│   ├── (dashboard)/          # Authenticated ERP App route group
│   │   ├── layout.tsx        # ERP Main Layout (Sidebar, TopHeader)
│   │   ├── dashboard/        # Executive Dashboard
│   │   ├── office/           # Office: branches, outlets, employees, warehouses
│   │   ├── finance/          # Finance: ledgers, journal entries, trial balance, etc.
│   │   ├── sales/            # Sales: invoices, quotations, orders, delivery notes
│   │   ├── stock/            # Stock: products, stock levels, transfers, adjustments
│   │   ├── purchase/         # Purchase: requisition, orders, GRN, bills
│   │   ├── administration/   # Admin: roles, permissions, approval workflows
│   │   ├── reports/          # Reports: sales, purchase, finance, tax registers
│   │   └── page.tsx          # Root redirect
│   ├── api/                  # API routes (export endpoints, webhooks)
│   ├── layout.tsx            # Root HTML & metadata layout
│   └── globals.css           # Tailwind + Custom Global CSS
├── components/               # Shared reusable React components
│   ├── erp/                  # ERP Shell elements (Sidebar, TopHeader, etc.)
│   ├── ui/                   # shadcn/ui components (Button, Input, Table, etc.)
│   ├── forms/                # Shared ERP forms (AddressForm, CustomerSelector, etc.)
│   ├── tables/               # Custom DataTable, Pagination, DataTableToolbar
│   └── charts/               # Recharts wrappers
├── hooks/                    # Reusable React hooks (useAuth, useScan, etc.)
├── lib/                      # Business logic, configuration, and helpers
│   ├── auth/                 # Authentication utilities and sessions
│   ├── db/                   # Prisma database client (`db.ts`)
│   ├── inventory/            # Inventory transaction logic (Prisma transactions)
│   ├── finance/              # Accounting journal entries and double-entry rules
│   ├── tax/                  # Indian GST calculation engine
│   └── utils/                # Tailmerges, formatters, document sequence generator
├── schemas/                  # Shared Zod validation schemas
├── types/                    # TypeScript interfaces & types
└── tests/                    # E2E and unit tests
prisma/
├── schema.prisma             # Database schema
└── seed.ts                   # Realistic seed data (Geetha Ceramics)
```

---

## 3. UI/UX and Theme Guidelines

To ensure the application feels like a mature enterprise tool rather than a standard SaaS landing page, the UI uses:
- **Navy Dark Sidebar**: Tailwind `bg-slate-900` or `#0B132B`.
- **Blue Active Menu**: `bg-blue-600 text-white` or `#2563EB`.
- **White Content Background**: Main viewport background is `#F8FAFC` (slate-50) with white card backgrounds (`#FFFFFF`).
- **Dense/Compact Tables & Forms**: High information density. Table rows are compact (`py-1.5 px-3`). Fields use small sizes (`h-8`, text size `text-sm`).
- **Subtle Styling**: Standardized borders (`border-slate-200`), minimal rounded corners (`rounded-md` or `rounded-sm`), and soft, professional shadows.
- **Strictly No Placeholders**: Real data representation. Image generation or local SVGs must be used for product images. No generic lorem-ipsum values.

---

## 4. Key Architectural Patterns

### A. Database Transaction Integrity
All stock movement and financial ledgers must be recorded through **database transactions** (`db.$transaction`). We must never update inventory quantities directly in a table without writing a corresponding ledger entry in `InventoryLedger` and `ActivityLog`.
- *Example*: Creating a Sales Invoice must decrease `Stock`, write an `InventoryTransaction`, add a row to `Invoice`, and write `JournalEntry` rows in the general ledger.

### B. Double-Entry Accounting Engine
A specialized module (`src/lib/finance/accounting.ts`) handles automatic generation of debit and credit items:
- Sales Invoice → Debits Customer Accounts Receivable, Credits Sales Income, Credits Output GST (CGST/SGST/IGST).
- Payments → Debits Bank/Cash Account, Credits Customer Accounts Receivable.

### C. Indian GST Calculation Engine
A centralized engine (`src/lib/tax/gst.ts`) computes taxes depending on:
- Seller State (Branch Outlet location) vs. Buyer State (Billing/Shipping location).
- Interstate (IGST) vs. Intrastate (CGST + SGST).
- Tax Inclusive vs. Exclusive flags per line item.
- Product HSN code rate mapping.

### D. Server-Side Permission Verification
We enforce security at multiple levels:
- **Middleware**: Blocks unauthenticated access to the `(dashboard)/*` route group.
- **Server Actions**: Every Action must call `await verifyPermission(permissionName)` before performing database queries.
- **API Routes**: API routes verify session cookies and RBAC permissions.

### E. Configurable Document Numbering
Sequencing logic (`src/lib/utils/sequence.ts`) generates structured, unique document numbers based on prefix, financial year, branch, and padding. Examples:
- Invoice: `INV/2026/000001`
- Purchase Order: `PO/2026/000001`
