# Route Audit Inventory

The following table documents all visible ERP navigation routes, expected URLs, validation statuses, issues detected, and fixes implemented.

| Navigation Item | Expected URL | Actual Route Exists | Status | Issue | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `/dashboard` | Yes | PASS | None | Initial page route exists |
| **Office** | `/purchase` | Yes | FIXED | Sidebar linked to `/office` (404) | Updated `Sidebar.tsx` to point to `/purchase` and created a redirect page from `/office` to `/purchase` |
| **Finance** | `/finance` | Yes | PASS | None | Enforced role-based access checks |
| **Sales** | `/sales` | Yes | PASS | None | Enforced role-based access checks |
| **Stock** | `/stock` | Yes | PASS | None | Enforced role-based access checks |
| **My Warehouse** | `/warehouse` | Yes | PASS | None | Enforced role-based access checks |
| **Customer** | `/customer` | Yes | PASS | None | Enforced role-based access checks |
| **Ticketing** | `/ticketing` | Yes | FIXED | Page was missing (404) | Created `src/app/(dashboard)/ticketing/`, backend tables, server actions, and `TicketingClient` UI |
| **Administration** | `/admin/workflows` | Yes | FIXED | Sidebar linked to `/administration` (404) | Updated `Sidebar.tsx` to point to `/admin/workflows` and created a redirect page from `/administration` to `/admin/workflows` |
| **Portal Management** | `/portal` | Yes | FIXED | Page was missing (404) | Created `src/app/(dashboard)/portal/`, announcements backend schema, server actions, and `PortalClient` UI |
| **Help Desk** | `/helpdesk` | Yes | FIXED | Page was missing (404) | Created `src/app/(dashboard)/helpdesk/`, FAQs backend schema, server actions, and `HelpDeskClient` UI |
| **HR & Payroll** | `/hr` | Yes | FIXED | Page was missing (404) | Created `src/app/(dashboard)/hr/`, employees backend schema, server actions, and `HrClient` UI |
| **Daily Movement Tracking** | `/movement` | Yes | FIXED | Page was missing (404) | Created `src/app/(dashboard)/movement/`, dispatch tracking backend schema, server actions, and `MovementClient` UI |
| **Reports** | `/reports` | Yes | PASS | None (Hidden module) | Exists in route files, now protected via server role verification |
