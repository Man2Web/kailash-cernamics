# Kailash Tally sync agent (.NET 8 Windows Service)

Runs on the PC where TallyPrime runs. It only makes **outbound** HTTPS calls to the ERP and talks to
Tally on `http://localhost:9000`, so the office needs no open ports or static IP. Contract:
`docs/specs/tally.md`.

## What it does

| Every | Action |
| --- | --- |
| 30 s | `GET /api/tally/queue` → POST each XML envelope to Tally → parse `CREATED/ALTERED/ERRORS/LINEERROR` → `POST /api/tally/ack` with the GUID |
| 60 s | `POST /api/tally/heartbeat` (Tally running, company, version). The ERP alerts the owner if silent for 15 min in business hours |
| 5 min | Export ledgers and Receipt vouchers with `AlterID > last` → `POST /api/tally/inbound` (receipts are allocated to ERP invoices by bill reference) |
| 15 min | Export ledger closing balances → `POST /api/tally/inbound` (`BALANCE`) for credit control |

Masters (ledgers, stock items) always come before vouchers. Each voucher carries `REMOTEID=erp-<type>-<id>`,
so a retry alters the same voucher instead of creating a duplicate. Failures are retried by the ERP at
1, 5 and 30 minutes, then shown as **Sync failed** in Settings › Tally sync with Tally's error text.

## Tally setup (once)

1. TallyPrime (Silver/Gold): *F1 Help › Settings › Connectivity* → **TallyPrime acts as: Both**, port **9000**.
2. Company loads automatically on start; Tally starts with Windows.
3. Create ledgers used by the ERP vouchers: `Sales GST 5% / 12% / 18% / 28%`, `Purchase GST …`, `Output CGST`,
   `Output SGST`, `Output IGST`, `Input CGST`, `Input SGST`, `Input IGST`, `Sales Returns`, `Purchase Returns`,
   `Input GST Reversal`, `Transport & Loading Charges`, `Freight & Unloading Inward`, `Round Off`, `Cash`, `Bank Account`.
4. **Test on a COPY of the company data first — never on the live books.**

## Install

1. In the ERP: *Settings › Tally sync › Agents › New agent*. Copy the key (shown once).
2. Build on any machine with the .NET 8 SDK:

   ```bash
   dotnet publish apps/tally-agent -c Release -r win-x64 -o publish
   ```

3. Copy `publish\` to `C:\KailashTallyAgent\` on the Tally PC and edit `appsettings.json`:
   `ErpUrl` (`https://crm.kailashceramics.com`), `ApiKey`, `TallyUrl` (`http://localhost:9000`), `CompanyName`
   (exactly as in Tally).
4. Check connectivity (prints Tally and ERP status):

   ```bat
   C:\KailashTallyAgent\KailashTallyAgent.exe --status
   ```

5. Install and start the service (Administrator command prompt):

   ```bat
   sc create KailashTallyAgent binPath= "C:\KailashTallyAgent\KailashTallyAgent.exe" start= delayed-auto DisplayName= "Kailash Tally Agent"
   sc failure KailashTallyAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000
   sc start KailashTallyAgent
   ```

## Operate

| Task | Command |
| --- | --- |
| Status | `sc query KailashTallyAgent` and `KailashTallyAgent.exe --status` |
| Stop / start | `sc stop KailashTallyAgent` / `sc start KailashTallyAgent` |
| Uninstall | `sc stop KailashTallyAgent` then `sc delete KailashTallyAgent` |
| Logs | `C:\KailashTallyAgent\logs\agent-yyyyMMdd.log` (14 days kept) |
| Rotate key | ERP › Settings › Tally sync › Agents › Rotate key, paste into `appsettings.json`, restart the service |

## Development

`dotnet build apps/tally-agent` builds on macOS/Linux too (the Windows Service host is a no-op off Windows).
The XML tag set follows `docs/specs/tally.md`; verify against the current TallyPrime XML reference with
recorded responses before go-live (Phase 6 done-when: 100 test vouchers round-trip, zero duplicates).
