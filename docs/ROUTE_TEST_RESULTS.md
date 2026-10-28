# Route Test Results Matrix

The following table documents the E2E click-testing, data-loading, and role validation results for all active routes.

| Route | Navigation Source | Page Loads | Database Loads | Permission Tested | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | Sidebar Brand / Menu Item | PASS | PASS | PASS (All Roles) | PASS |
| `/purchase` (Office) | Sidebar "Office" link / `/office` redirect | PASS | PASS | PASS (Procurement/Finance Roles) | FIXED |
| `/finance` | Sidebar "Finance" | PASS | PASS | PASS (Finance Roles) | PASS |
| `/sales` | Sidebar "Sales" | PASS | PASS | PASS (Sales Roles) | PASS |
| `/sales/create` | Sales Dashboard "Create Invoice" | PASS | PASS | PASS (Sales Roles) | PASS |
| `/stock` | Sidebar "Stock" | PASS | PASS | PASS (Warehouse/Inventory Roles) | PASS |
| `/warehouse` | Sidebar "My Warehouse" | PASS | PASS | PASS (Warehouse Managers) | PASS |
| `/customer` | Sidebar "Customer" | PASS | PASS | PASS (Sales/Admin Roles) | PASS |
| `/ticketing` | Sidebar "Ticketing" | PASS | PASS | PASS (Support/Sales/Admin) | FIXED |
| `/admin/workflows` | Sidebar "Administration" / `/administration` redirect | PASS | PASS | PASS (Admin/Super Admin only) | FIXED |
| `/portal` | Sidebar "Portal Management" | PASS | PASS | PASS (Admin/Super Admin only) | FIXED |
| `/helpdesk` | Sidebar "Help Desk" | PASS | PASS | PASS (All Roles) | FIXED |
| `/hr` | Sidebar "HR & Payroll" | PASS | PASS | PASS (Admin/Super Admin only) | FIXED |
| `/movement` | Sidebar "Daily Movement Tracking" | PASS | PASS | PASS (Delivery/Warehouse/Sales) | FIXED |
| `/reports` | Direct Navigation (Protected link) | PASS | PASS | PASS (Finance/Sales/Purchase) | PASS |
| `/unauthorized` | Server-Side Access Denied Redirect | PASS | N/A | PASS | PASS |
| `/login` | Unauthenticated Session Redirect | PASS | PASS | PASS (Public Path) | PASS |
