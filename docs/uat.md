# UAT test sheet — Kailash Ceramics ERP

Run on **staging** with the client's real masters (or the demo seed). Tick Pass/Fail and note the
tester and date. Every flow in docs/phases.md has at least one row. Logins come from the seed
(change passwords before sharing staging).

| # | Area | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Login | Sign in as owner; wrong password 6 times in a minute | Dashboard opens; 6th attempt is blocked (429); attempts listed in Settings › Audit & logins | | |
| 0.2 | Session | Stay idle 20 min, then open a page | Page loads without re-login (refresh token rotates); after logout the back button cannot reopen data | | |
| 0.3 | 2FA | My account › enable 2FA with an authenticator app; sign out and in | Login asks for the 6-digit code | | |
| 0.4 | Branch switch | Switch branch in the top bar | Lists show only that branch's documents | | |
| 1.1 | Tile product | Catalogue › Products › New: tile 600x1200, 2 pcs/box, 15.5 sq ft/box, HSN 6907, 18%, image | Saved; image visible; sq m per box auto-filled | | |
| 1.2 | Sanitary product | New sanitary product (UNIT) with two colour variants | Saved with variants; no box fields required | | |
| 1.3 | Parties | New builder customer with GSTIN, two sites, credit limit ₹5,00,000 / 30 days | Wrong GSTIN check digit is rejected; correct one saves | | |
| 1.4 | Roles | Settings › Roles: remove "See cost price" from Sales | Sales user no longer sees cost/margin in stock value and reports | | |
| 1.5 | Import | Settings › Import: upload product-master-template.csv with one bad row | Preview flags the bad row; commit imports the rest | | |
| 2.1 | GRN | Purchase › GRN: 3 shades of one tile, freight ₹6,000, allocate by value, post | Stock › product shows each shade with box + pcs (sq ft); batch landed cost includes freight | | |
| 2.2 | Transfer | Move 5 boxes of one shade from Main godown to Showroom (display) | Main reduces, Showroom DISPLAY increases; ledger shows two rows | | |
| 2.3 | Breakage | Record 3 pcs broken in godown with a photo | Stock moves to DAMAGED; available reduces | | |
| 2.4 | Adjustment | Adjust −2 boxes (count mismatch) | Goes to Approvals; stock changes only after approval | | |
| 2.5 | Counts | Compare Stock by shade/godown with a manual count of test data | Matches exactly | | |
| 3.1 | Room-wise quote | Quote with Hall 12×10 floor (5%) and Bath walls 8×6×7 minus 21 sq ft (8%) | Boxes = ceil(area × (1+wastage) ÷ sq ft per box); totals with CGST+SGST | | |
| 3.2 | Revision & share | Revise the quote; share on WhatsApp; print | Rev 2 shown with same number; WhatsApp opens with link; A4 print looks branded | | |
| 3.3 | Quote → order | Convert to sales order | Prices kept; each line reserves from ONE shade batch; short batch opens split dialog | | |
| 3.4 | Discount approval | Sales user gives 12% discount (limit 5%) | Order waits in Approvals; manager approves; order confirms | | |
| 3.5 | Invoice GST | Invoice a Tamil Nadu customer and a Kerala customer | TN: CGST+SGST; Kerala: IGST; numbers KC/CBE/26-27/000n in sequence | | |
| 3.6 | Cancel | Cancel a posted invoice with reason | Stock returns; number is not reused; Tally gets a cancellation | | |
| 3.7 | Challan & dispatch | Challan for the invoice; dispatch with vehicle, loading ₹500; upload POD | Delivered status with photo | | |
| 3.8 | Shade warning | Deliver a different shade of the same tile to the same site | Warning shown before posting | | |
| 3.9 | Return | Return 2 boxes to DAMAGED | Credit note created; DAMAGED stock increases | | |
| 4.1 | PO → GRN → bill | PO for 100 boxes, GRN 90, purchase invoice at a higher rate | PO partially received; invoice shows qty and rate variance warnings | | |
| 4.2 | Scheme | Brand scheme with slabs; post purchases crossing slab 1 | Progress and expected rebate on dashboard/schemes | | |
| 5.1 | Receipt | Receive ₹50,000 by cheque against 3 invoices, auto-allocate | Oldest invoices settled first; remainder kept as advance | | |
| 5.2 | Bounce | Mark the cheque bounced | Allocations reversed; invoices outstanding again | | |
| 5.3 | Credit hold | Order for a party past credit days | Order held for approval | | |
| 5.4 | Outstanding | Accounts › Outstanding | Ageing buckets 0-30 / 31-60 / 61-90 / 90+; statement prints | | |
| 6.1 | Tally push | Agent running on the Tally PC; post 100 mixed vouchers | All SUCCESS; Tally Day Book totals match ERP; rerun twice → no duplicates | | |
| 6.2 | Tally pull | Enter a receipt in Tally with bill reference = ERP invoice no. | Appears in ERP and settles that invoice | | |
| 6.3 | Agent down | Stop the agent service for 20 min in business hours | Owner gets an alert; queue resumes when restarted | | |
| 7.1 | E-invoice | Set GSP sandbox; post B2B invoice; Generate IRN | IRN, ack no and QR stored and printed | | |
| 8.1 | CRM | New lead → follow-up today → site visit check-in → convert to quotation | Quote opens prefilled; lead marked won | | |
| 8.2 | Dashboard | Open owner dashboard | Loads under 2 s with today's sales, outstanding, stock value, approvals, Tally health | | |
| 8.3 | Reports | Sales by brand, margin by brand, slow movers by shade; export to Excel | Numbers match invoices; Excel opens | | |
| 9.1 | Opening data | Import opening stock by shade per godown and opening outstanding by invoice | Counts and balances signed off by client | | |

Sign-off: ______________________ (Kailash Ceramics)    Date: ____________
