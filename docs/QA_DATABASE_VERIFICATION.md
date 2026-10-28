# Database Verification Matrix: PostgreSQL & Supabase

## 1. Principles of Real Database Verification
Unlike superficial UI tests, every test in the SixOrbit ERP QA suite executes explicit, direct queries against the database to confirm:
- Rows actually exist in PostgreSQL.
- Foreign keys and relationships resolve accurately.
- Timestamps (`createdAt`, `updatedAt`) are updated.
- Numerical fields (quantities, tax splits, totals) match mathematical rules.

---

## 2. Table-by-Table Verification Matrix

### 1. `customers`
- **Primary Key**: `id (UUID)`
- **Unique Fields**: `code`
- **Relations Verified**: `groupId -> customer_groups.id`
- **Verification Method**: `DatabaseVerifier.verifyRecordExists("customer", { id })`

### 2. `vendors`
- **Primary Key**: `id (UUID)`
- **Unique Fields**: `code`
- **Verification Method**: `DatabaseVerifier.verifyRecordExists("vendor", { id })`

### 3. `products` & `product_variants`
- **Primary Key**: `id (UUID)`
- **Unique Fields**: `sku`, `code`
- **Relations Verified**: `categoryId -> categories.id`, `unitId -> units.id`
- **Verification Method**: `DatabaseVerifier.verifyRecordExists("product", { id })`

### 4. `stock` & `warehouses`
- **Primary Key**: `id (UUID)`
- **Unique Fields**: `warehouses.code`
- **Relations Verified**: `stock.productId -> products.id`, `stock.variantId -> product_variants.id`, `stock.warehouseId -> warehouses.id`
- **Verification Method**: `DatabaseVerifier.verifyRecordExists("stock", { id })`

### 5. `invoices` & `invoice_items`
- **Primary Key**: `id (UUID)`
- **Unique Fields**: `invoice_no`
- **Relations Verified**: `customerId -> customers.id`, `branchId -> branches.id`, `outletId -> outlets.id`
- **Calculation Verification**:
  - `totalTaxableAmount = Σ(quantity * rate - discount)`
  - `totalTaxAmount = Σ(taxableAmount * gstRate / 100)`
  - `totalPayableAmount = totalTaxableAmount + totalTaxAmount`
- **Verification Method**: Direct assertion of computed fields against database records.

---

## 3. Safe Scoped Data Cleanup Architecture
All test entities created during automation runs are tagged with the unique `TEST_RUN_ID` (e.g. `RUN_270706_574L`).

The cleanup agent (`tests/helpers/cleanup.ts`):
1. Filters records strictly matching `where: { code: { contains: testRunId } }` or `where: { invoiceNo: { contains: testRunId } }`.
2. Never issues unbounded `DELETE FROM <table>` statements.
3. Leaves all existing production customers, products, and invoices untouched.
