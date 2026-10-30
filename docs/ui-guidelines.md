# UI/UX guidelines

Match Geetha Timbers. Until docs/reference/ is filled, use these defaults; all colours and fonts live
in one place (tailwind.config + CSS variables in globals.css) so they can be swapped later.

| Element | Rule |
| --- | --- |
| Layout | Collapsible left sidebar grouped by module; top bar with global search (Ctrl+K), branch switcher, notifications, user menu |
| Theme | Light and dark mode via CSS variables; one brand primary colour, neutral greys, status colours for paid/overdue/pending |
| Type | Inter (or the Geetha Timbers font); 14 px body; tabular numbers in tables |
| Lists | Server-side paging, sticky header, column chooser, saved filters, Excel/PDF export, row actions menu |
| Forms | Two columns on desktop, one on mobile; Enter → next field; Ctrl+S save; inline Zod errors; unsaved-changes guard |
| Billing screen | Keyboard-first: product search by SKU/name/size; shade picker shows available boxes per batch; live totals panel |
| Numbers | Indian format, ₹ symbol, quantities as "12 box + 3 pcs (155.0 sq ft)" |
| Status chips | Draft, Pending approval, Posted, Synced to Tally, Sync failed, Cancelled |
| Mobile | PWA for field sales and godown: lead capture, visit check-in, stock lookup, barcode/QR scan for GRN and dispatch |
| States | Every page has empty, loading (skeletons) and error states |
| Accessibility | Visible focus, labels on all inputs, contrast AA |

## Main navigation
1. Dashboard — sales today/month, outstanding, stock value, pending approvals, Tally sync health
2. CRM — leads, follow-ups, site visits, influencers
3. Sales — quotations, orders, invoices, challans, returns
4. Purchase — POs, GRN, purchase invoices, schemes
5. Inventory — stock, batches/shades, transfers, breakage, display stock
6. Accounts — receipts, payments, outstanding, credit control
7. Catalogue — products, price lists, image gallery
8. Reports
9. Settings — branches, users, roles, number series, Tally, GST, WhatsApp
