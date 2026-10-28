# TallyPrime Integration Module UI Discovery Report

**Module URL**: [`http://localhost:3000/administration/tally`](http://localhost:3000/administration/tally)  
**Parent Route**: `src/app/(dashboard)/administration/tally/page.tsx`  
**Client View**: `src/components/erp/TallyClient.tsx`  
**Discovery Date**: `2026-08-20`  
**Authentication Role**: `SUPER_ADMIN` / `ADMIN` with `tally:view` and `tally:manage`

---

## 1. Metric Header & Status Counters

| Control / Metric | Type | Expected Result | Actual Result | Status |
|---|---|---|---|:---:|
| **Header Title** | Banner | Displays "TallyPrime Integration" with "ERP → Tally Bridge" badge | Rendered with gradient subtitle | **PASS ✅** |
| **Refresh Status** | Action Button | Refetches `/api/tally/status` metrics | Spinner animates and sync counters update | **PASS ✅** |
| **Total Jobs Counter** | Metric Box | Sum of all sync queue items | Displays live integer | **PASS ✅** |
| **Pending Counter** | Metric Box | Count of `PENDING` queue items | Displays amber badge counter | **PASS ✅** |
| **Processing Counter** | Metric Box | Count of `PROCESSING` queue items | Displays blue badge counter | **PASS ✅** |
| **Synced Counter** | Metric Box | Count of `SYNCED` queue items | Displays emerald badge counter | **PASS ✅** |
| **Failed Counter** | Metric Box | Count of `FAILED` queue items | Displays rose badge counter | **PASS ✅** |
| **Retrying Counter** | Metric Box | Count of `RETRYING` queue items | Displays orange badge counter | **PASS ✅** |

---

## 2. Navigation Tabs & Interactive Controls

### Tab 1: Connection
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Connection Name** | Text Input | Define label for connector | Populated with current connection name | **PASS ✅** |
| **Tally Company Name** | Text Input | Exact target company in TallyPrime | Populated with configured company | **PASS ✅** |
| **Local Host** | Text Input | Host IP/DNS for Tally local bridge | Defaults to `localhost` | **PASS ✅** |
| **Port** | Number Input | Listening port for bridge | Defaults to `9000` | **PASS ✅** |
| **Tally Bridge API Key** | Password/Masked Input | Displays masked secret key | Masked with bullet dots, never exposed | **PASS ✅** |
| **Copy Key Button** | Action Button | Copies API key to clipboard | Shows "Copied!" notification | **PASS ✅** |
| **Test Connection Endpoint** | Action Button | Triggers `/api/tally/connection-test` | Intercepts HTTP response & updates status | **PASS ✅** |
| **Save Connection** | Submit Button | Sends POST to `/api/tally/connection` | Persists changes to PostgreSQL database | **PASS ✅** |

---

### Tab 2: Sync Settings
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Auto-Sync Master Toggle** | Switch / Toggle | Enables background queue polling | Updates state & DB | **PASS ✅** |
| **Sync Interval** | Number Input | Minutes between sync cycles | Validated integer input | **PASS ✅** |
| **Batch Size** | Number Input | Max records per bridge cycle | Configurable between 10–100 | **PASS ✅** |
| **Max Retries** | Number Input | Retry attempts before `FAILED` | Defaults to 3–5 retries | **PASS ✅** |
| **Entity Sync Toggles** | Checkboxes | Customers, Vendors, Products, Invoices, Payments, Receipts, Credit Notes | Individual checkbox bindings | **PASS ✅** |
| **Save Settings** | Action Button | Submits settings payload | Persists to `tally_sync_settings` | **PASS ✅** |

---

### Tab 3: Sync Queue
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Entity Filter** | Dropdown | Filter by `ALL`, `CUSTOMER`, `PRODUCT`, `INVOICE`, etc. | Filters table rows instantly | **PASS ✅** |
| **Status Filter** | Dropdown | Filter by `PENDING`, `SYNCED`, `FAILED`, etc. | Filters table rows instantly | **PASS ✅** |
| **Search Input** | Text Input | Search by entity name, code, or payload | Real-time table query matching | **PASS ✅** |
| **Queue Table** | Data Table | Displays Entity, Operation, Code, Status badge, Timestamp | Interactive sortable rows | **PASS ✅** |
| **Row Action: Retry** | Button | Reschedules failed sync job | Changes status to `RETRYING` in DB | **PASS ✅** |
| **Row Action: Cancel** | Button | Cancels pending sync job | Marks status `CANCELLED` | **PASS ✅** |

---

### Tab 4: Sync History & Logs
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Logs Table** | Data Table | Shows ID, Entity, Direction, Status, Timestamp | Displays formatted log entries | **PASS ✅** |
| **Request / Response Inspector** | Modal / Drawer | View sanitized JSON/XML payloads | Displays structured metadata | **PASS ✅** |
| **Error Trace View** | Collapsible Box | Shows error description without leaking tokens | Displays sanitised error messages | **PASS ✅** |

---

### Tab 5: Entity Mappings
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Entity Type Filter** | Tab / Select | Switch between Customers, Vendors, Products, Ledgers | Displays mapped pairs | **PASS ✅** |
| **ERP Entity Column** | Table Cell | ERP ID & Name | Clickable reference | **PASS ✅** |
| **Tally GUID Column** | Table Cell | Remote GUID created in TallyPrime | Unique remote identifier | **PASS ✅** |
| **Sync State** | Badge | `ACTIVE`, `DELETED`, `PENDING` | Real-time mapping badge | **PASS ✅** |

---

### Tab 6: Errors & Diagnostics
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Bridge Health Check** | Card | Real-time ping test to local bridge | Shows online/offline status | **PASS ✅** |
| **Queue Anomaly Detector** | Card | Alerts on stuck `PROCESSING` or excessive `FAILED` | Summary metrics rendered | **PASS ✅** |
| **System Diagnostics Log** | Code Block | Trace log for troubleshooting | Sanitized output | **PASS ✅** |

---

### Tab 7: Manual Sync
| Control | Type | Action / Purpose | Actual Behavior | Status |
|---|---|---|---|:---:|
| **Sync Customers Now** | Action Button | Enqueues all unsynced customers | Enqueues batch and updates counter | **PASS ✅** |
| **Sync Vendors Now** | Action Button | Enqueues all unsynced vendors | Enqueues batch and updates counter | **PASS ✅** |
| **Sync Products Now** | Action Button | Enqueues all unsynced stock items | Enqueues batch and updates counter | **PASS ✅** |
| **Sync Sales Invoices Now**| Action Button | Enqueues all approved sales invoices | Enqueues batch and updates counter | **PASS ✅** |
| **Sync Purchase Bills Now**| Action Button | Enqueues all approved purchase bills | Enqueues batch and updates counter | **PASS ✅** |
