# SixOrbit TallyPrime Local Connector / Bridge

This standalone bridge enables real-time and scheduled one-way synchronization (**ERP -> TallyPrime**) from your deployed SixOrbit Cloud ERP to your local **TallyPrime** installation.

---

## 1. Prerequisites on the Local Windows Machine

1. **TallyPrime Installed & Running**:
   - Open TallyPrime.
   - Go to **F1: Help** -> **Settings** -> **Connectivity**.
   - Set **Client/Server configuration** to:
     - **TallyPrime acts as**: `Both` (or `Server`)
     - **Enable ODBC**: `Yes`
     - **Port**: `9000` (default)
   - Restart TallyPrime and open your target Company.
2. **Node.js (v18 or newer)** installed on the Windows PC.

---

## 2. Setup & Installation

1. Navigate to the `tally-connector` directory:
   ```bash
   cd tally-connector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` configuration:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your details:
   ```env
   ERP_API_BASE_URL=https://your-deployed-erp-domain.com
   TALLY_BRIDGE_API_KEY=your-tally-bridge-api-key-from-administration-tally-page
   TALLY_HOST=localhost
   TALLY_PORT=9000
   TALLY_COMPANY_NAME=Your Exact Tally Company Name
   POLL_INTERVAL_SECONDS=15
   BATCH_SIZE=10
   ```

---

## 3. Running the Connector

### In Development / Test Mode:
```bash
npm run dev
```

### In Production (Build & Start):
```bash
npm run build
npm start
```

### Running as a Windows Background Service (Recommended using PM2):
```bash
npm install -g pm2
npm install pm2-windows-startup -g
pm2-startup install

pm2 start dist/index.js --name "tally-bridge"
pm2 save
```

---

## 4. How It Works

1. **ERP Side**: When Customers, Vendors, Products, Sales Invoices, or Purchase Bills are created/updated in SixOrbit ERP, they are automatically validated and scheduled into `tally_sync_queue`.
2. **Bridge Polling**: The local bridge periodically contacts your cloud ERP over secure HTTPS (`/api/tally/sync`) using your private `x-tally-bridge-key`.
3. **Local Posting**: It posts the formatted XML payload directly to TallyPrime at `http://localhost:9000`.
4. **Response Feedback**: Tally's response is parsed and acknowledged back to the cloud ERP, marking the queue record as `SYNCED` and storing the Tally GUID and Voucher number in `tally_entity_mappings`.
5. **Offline Protection**: If TallyPrime is closed or offline, ERP operations continue without interruption. The bridge waits and automatically processes pending records once Tally is reopened.
