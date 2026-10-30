# Testing, security and go-live checklist

Go live only when every box is ticked on staging with the client's real master data.

## Testing
- [ ] Unit tests: unit conversion, wastage, batch reservation, GST split, landed cost, number series
- [ ] API e2e tests for every posting flow (GRN, invoice, return, receipt, transfer)
- [ ] Playwright UI tests: login, quote-to-invoice, GRN, receipt
- [ ] Tally round-trip: 100 mixed vouchers, rerun twice, zero duplicates, totals match Tally Day Book
- [ ] Load test: 30 concurrent billing users, p95 < 500 ms
- [ ] Restore test from off-site backup into staging

## Security
- [ ] Rate limiting, CSRF on cookie auth, input validation, no string-built SQL
- [ ] Permissions tested on every endpoint (sales user cannot see cost price or margin)
- [ ] Tally agent: per-branch key, HTTPS only, rotatable
- [ ] Admin 2FA, 12 h session timeout, login history visible to owner
- [ ] Secrets only in Coolify environment variables

## Data migration
- [ ] Product master from Tally stock items + client Excel (pcs/box, sqft/box, images)
- [ ] Parties from Tally ledgers with GUID mapping
- [ ] Opening stock by batch/shade per godown from physical count
- [ ] Opening outstanding by invoice from Tally bill-wise details
- [ ] Client signs off counts and balances

## Go-live
- [ ] Training per role + short video per main flow
- [ ] One-week parallel run
- [ ] Cut-over at month start; branch entries move to ERP only
- [ ] Hypercare: daily check-in for two weeks
