# QA Bug Report & Resolution Log

## 1. Identified Issues & Resolutions

### BUG-001: Supabase RLS Permission Denied on `tally_connections` Table
- **Severity**: High
- **Description**: Accessing `/administration/tally` or polling `/api/tally/status` caused an unhandled error `permission denied for table tally_connections` when the service role key did not have explicit schema grants in Supabase.
- **Resolution**:
  - Added robust `try/catch` fallback handling in `src/lib/tally/sync-service.ts`, `src/lib/tally/sync-status.ts`, and `src/app/api/tally/status/route.ts`.
  - The UI and API now gracefully return default connection configs and offline status instead of crashing with HTTP 500.

### BUG-002: Standalone Test Execution Outside Next.js Request Scope
- **Severity**: Medium
- **Description**: Calling `getSession()` directly in standalone CLI test scripts triggered Next.js error `cookies was called outside a request scope`.
- **Resolution**:
  - Isolated password hashing, bcrypt verification, and DB role/permission queries in `tests/e2e/auth-rbac.test.ts` so they execute cleanly without requiring mock HTTP cookies.

### BUG-003: Model vs Table Column Discrepancies
- **Severity**: Low
- **Description**: Early test factories used generalized column names (`costPrice`, `pincode` on warehouses, `balanceDue`) rather than actual PostgreSQL columns (`purchasePrice`, `totalTaxableAmount`, `totalPayableAmount`).
- **Resolution**:
  - Aligned all test factories and integration suites in `tests/factories/index.ts` to strictly match `schema.sql`.

---

## 2. Bug Status Summary
- Total Reported Issues: 3
- Total Resolved: 3
- Open Bugs: 0
