# Tally two-way integration

A Windows sync agent on the Tally PC makes outbound HTTPS calls to the ERP and talks to TallyPrime on
localhost:9000. No Tally port is ever exposed to the internet. ERP owns stock and sales operations;
Tally owns the books.

## Ownership

| Data | Created in | Flow | Notes |
| --- | --- | --- | --- |
| Customer/supplier ledgers | ERP (new) or Tally (existing) | Both | Matched by GUID after first import; name changes sync both ways |
| Stock items, units, godowns | ERP | ERP → Tally | Tally unit Pcs with alternate unit Box |
| Sales invoices, credit notes | ERP | ERP → Tally | With stock items, GST and bill reference |
| Purchase invoices, debit notes | ERP | ERP → Tally | Landed cost charges as separate ledgers |
| Receipts and payments | Either | Both | Tally receipts come back and allocate to ERP invoices by bill reference |
| Journals, expenses, bank | Tally | Tally → ERP (read only) | Only for outstanding and ledger balances |
| Closing balances, bill-wise outstanding | Tally | Tally → ERP | Snapshot every 15 min for credit control |

## API between agent and ERP
- `GET  /api/tally/queue?limit=50`  → pending items, masters before vouchers
- `POST /api/tally/ack`             → { queueId, status, tallyGuid, rawResponse, error }
- `POST /api/tally/inbound`         → { kind: LEDGER|VOUCHER|BALANCE|OUTSTANDING, items[], lastAlterId }
- `POST /api/tally/heartbeat`       → { tallyRunning, companyLoaded, companyName, version }
- Auth: per-branch API key in header `X-Agent-Key` (stored hashed; rotatable in Settings > Tally).

## Agent behaviour
1. Every 30 s: pull queue; process in order.
2. POST each XML envelope to http://localhost:9000; parse CREATED / ALTERED / ERRORS / LINEERROR;
   read back GUID; ack.
3. Every 5 min: export ledgers, receipts, payments, credit/debit notes with AlterID > last stored
   AlterID → /inbound.
4. Every 15 min: export ledger closing balances and bill-wise outstanding.
5. Heartbeat every minute. ERP alerts if silent 15 min in business hours.
6. Local log file with rotation; config file holds ERP URL, API key, Tally URL, company name.

## Rules that prevent duplicates and mismatches
- Each voucher carries the ERP document's unique id as REMOTEID and the ERP invoice number as
  voucher number. Retrying the same REMOTEID alters, never creates a second voucher.
- Missing master (party, stock item, ledger) blocks the voucher; the queue sends the master first.
- Retries back off at 1, 5, 30 min, then FAILED with the Tally error visible on the Sync screen.
  Manual retry button. Nothing is dropped silently.
- Cancelled ERP invoices → cancellation of the same voucher, never deletion.
- Daily reconciliation report: count and value of sales, purchases, receipts per day, ERP vs Tally.
- One agent per Tally machine; each branch maps to its Tally company name.

## Sample XML (verify tags against current TallyPrime XML docs in Phase 6)

Import a sales voucher:
```xml
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>Kailash Ceramics</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="erp-inv-6f1c..." VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>20261024</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>KC/CBE/26-27/0001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Sri Murugan Constructions</PARTYLEDGERNAME>
            <ISINVOICE>Yes</ISINVOICE>
            <!-- ALLINVENTORYENTRIES.LIST per item, LEDGERENTRIES.LIST for party, CGST, SGST, round-off -->
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
```

Export ledgers changed since last AlterID: use an Export Data request with a TDL collection of
Ledger filtered by `$AlterID > <last>` and fetch GUID, NAME, PARENT, PARTYGSTIN, CLOSINGBALANCE, ALTERID.

## Tally-side setup checklist
- [ ] TallyPrime (Silver/Gold), "TallyPrime acts as server" enabled on port 9000
- [ ] Company auto-loads on start; Tally runs at Windows startup
- [ ] Ledgers: sales/purchase by GST rate, output/input CGST/SGST/IGST, freight, loading, round-off
- [ ] Agent installed as Windows service with branch API key
- [ ] All testing on a COPY of the client's company data first
