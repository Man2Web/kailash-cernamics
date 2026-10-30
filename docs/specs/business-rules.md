# Tiles & sanitary business rules

These rules make the product exclusive to this trade. Every rule needs a unit test.

## Units and conversion
Tiles are stored in pieces and shown as boxes + loose pieces + sq ft.
With pcs_per_box = P and sqft_per_box = A:

    boxes = ceil( required_sqft × (1 + wastage%) / A )

- Display any piece count as `B box + L pcs` where B = floor(pcs / P), L = pcs mod P.
  Example: "12 box + 3 pcs (155.0 sq ft)".
- Sale price may be entered per sq ft or per box; convert and store per-piece rate in paise.
- Round up to full boxes by default; loose pieces only when product.allow_loose_sale = true.
- Sanitary, CP fittings and accessories use simple units (nos, set).
- 1 sq m = 10.7639 sq ft. Keep this constant in packages/shared only.

## Shade, caliber and grade
- Every tile GRN line must capture batch_no, shade_code, caliber and grade before stock posts.
- A sales order line reserves from ONE batch. If one batch cannot fill it, show available batches with
  quantity and let the user split the line or choose another product.
- Warn on invoice/challan when a customer site receives a different shade than an earlier delivery.
- Stock reports split by shade so slow-moving shades are visible.

## Stock types and breakage
- Stock types: SALEABLE, DISPLAY (showroom), DAMAGED, RESERVED. Available = SALEABLE − RESERVED.
- Breakage entry records stage (receipt, godown, transit, customer return), qty, reason, photos,
  and moves stock to DAMAGED.
- Damaged stock can be sold on the CLEARANCE price list, or written off with approval.

## Room-wise quotation
- Room: length, width, optional height. Floor area = L × W.
  Wall area = 2 × (L + W) × H − door/window deductions entered by the user.
- Each room can have several areas (floor, wall, skirting, highlighter), each with its own product and
  wastage % (defaults: 5% floor, 8% wall; editable in Settings).
- Quote shows per room: area, boxes, rate, amount; then totals, GST, transport and loading charges.
- Output: branded PDF with product images; share via WhatsApp link and email.
- One click converts quote → sales order, keeping prices. Validity days and revision history (Rev 1, 2…).

## Pricing, credit and approvals
- Price comes from the customer's segment price list.
- Line discount above the user's role limit → approval request to manager (in-app + WhatsApp).
- Order beyond credit limit or with invoices past credit_days → held for approval.
  Outstanding = ERP invoices − receipts, cross-checked with latest Tally ledger snapshot.
- Influencer (architect, plumber…) tagged on quote/invoice; commission/points accrue only when the
  invoice is fully paid.

## Purchase and landed cost
- GRN against PO records truck/container, freight, unloading and other charges.
- Landed cost allocated to lines by value or weight (setting) and stored on the batch.
- Brand schemes: purchase targets per period with slab rebates; expected rebate on dashboard.

## GST and documents
- Intra-state: CGST + SGST; inter-state: IGST; decided by branch state vs place of supply.
- E-invoice (IRN + QR) and e-way bill through a GSP API when applicable; store IRN, ack no, e-way no.
- Number series per branch per financial year (e.g. KC/CBE/25-26/0001). Never reuse a cancelled number.
- Posted invoices are never edited: cancel (and cancel IRN within the allowed window) and re-issue.
