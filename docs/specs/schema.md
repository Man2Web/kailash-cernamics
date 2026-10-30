# Database schema

Three core tables: **product** (what), **batch** (which shade/caliber/grade lot) and **stock_ledger**
(every movement). Everything else creates ledger rows or reads from them.

Common columns on every table: id (uuid), created_at, updated_at, created_by, updated_by,
deleted_at (soft delete), branch_id where relevant. Money = BigInt paise. Tile qty = integer pieces.

| Area | Table | Key fields |
| --- | --- | --- |
| Org | company, branch, godown, rack | branch: gstin, state_code, address, tally_company_name · rack: godown_id, code |
| Users | user, role, permission, role_permission, user_branch | role-permission matrix, branch access, discount_limit_pct per role |
| Masters | brand, category, series, size, finish, color | category.type: TILE / SANITARY / CP_FITTING / ACCESSORY / ADHESIVE · size: length_mm, width_mm, thickness_mm |
| Product | product | sku, name, brand_id, category_id, series_id, size_id, finish_id, hsn, gst_rate, uom_type (PIECE_BOX_AREA / UNIT), pcs_per_box, sqft_per_box, sqm_per_box, weight_per_box_kg, mrp_paise, allow_loose_sale, images[], is_active, tally_stock_item_guid |
| Product | product_variant | sanitary colour/variant: product_id, color_id, sku_suffix, mrp_paise |
| Product | price_list, price_list_item | price_list.segment (RETAIL / CONTRACTOR / DEALER / BUILDER / CLEARANCE) · item: product_id, price_basis (PER_SQFT / PER_BOX / PER_UNIT), price_paise, valid_from |
| Batch | batch | product_id, batch_no, shade_code, caliber, grade (PREMIUM / STANDARD / COMMERCIAL), mfg_date, purchase_rate_paise, landed_cost_paise |
| Stock | stock_ledger | product_id, batch_id, godown_id, rack_id, qty_pcs (signed), stock_type (SALEABLE / DISPLAY / DAMAGED / RESERVED), ref_type, ref_id, rate_paise, posted_at |
| Stock | stock_balance | materialised balance per product+batch+godown+rack+stock_type, updated in the same transaction as the ledger row |
| Stock | stock_transfer(+_line), stock_adjustment(+_line), breakage_entry | breakage: stage (RECEIPT / GODOWN / TRANSIT / CUSTOMER), reason, qty_pcs, photos[], approved_by |
| Parties | party | type (CUSTOMER / SUPPLIER / BOTH), segment (RETAIL / CONTRACTOR / BUILDER / DEALER / INSTITUTION), name, phone, gstin, state_code, billing/shipping address, credit_limit_paise, credit_days, tally_ledger_guid, tally_ledger_name |
| Parties | site | party_id, name, address, contact_name, contact_phone (builder/contractor site-wise orders) |
| Parties | influencer | type (ARCHITECT / INTERIOR / PLUMBER / MASON), phone, commission_rule_id, points_balance |
| CRM | lead, followup, site_visit | lead: source, status, assigned_to, requirement, next_followup_at · site_visit: lat, lng, photos[], notes |
| Sales | quotation, quotation_room, quotation_area, quotation_line | room: name, length_ft, width_ft, height_ft, deductions_sqft · area: area_type (FLOOR / WALL / SKIRTING / HIGHLIGHTER), wastage_pct · line: product_id, req_sqft, boxes, loose_pcs, rate_paise, discount_pct · quotation: revision_no, valid_until, influencer_id |
| Sales | sales_order, sales_order_line | line: batch_id (reserved), qty_pcs, rate_paise, delivery_date · order: site_id, approval_status |
| Sales | invoice, invoice_line | invoice_no (series per branch + FY), place_of_supply, irn, ack_no, ack_date, eway_bill_no, status (DRAFT / POSTED / CANCELLED), tally_voucher_guid, sync_status |
| Sales | delivery_challan, dispatch, vehicle | dispatch: vehicle_id, driver, loading_paise, unloading_paise, pod_photo, delivered_at |
| Sales | sales_return(+_line), credit_note | return line: to_stock_type (SALEABLE / DAMAGED) |
| Purchase | purchase_order(+_line), grn(+_line), purchase_invoice(+_line), debit_note | grn: truck_no, container_no, freight_paise, unloading_paise, other_charges_paise, allocation_basis (VALUE / WEIGHT) |
| Schemes | scheme, scheme_slab, scheme_claim | brand_id, period, target_paise or target_sqft, rebate_pct per slab |
| Accounts | receipt, payment, receipt_allocation | mode (CASH / UPI / CHEQUE / NEFT / CARD), reference, allocated to invoices |
| Accounts | ledger_balance_snapshot | pulled from Tally: party_id, closing_paise, as_of |
| Approvals | approval_request | type (DISCOUNT / CREDIT / ADJUSTMENT / WRITE_OFF), ref_type, ref_id, requested_by, decided_by, status |
| Tally | tally_sync_queue | entity_type, entity_id, direction (TO_TALLY / FROM_TALLY), payload_xml, status (PENDING / SENT / SUCCESS / FAILED), attempts, next_attempt_at, last_error, agent_id |
| Tally | tally_agent, tally_mapping | agent: branch_id, api_key_hash, last_seen_at, last_alter_id, tally_version · mapping: erp_entity, erp_id, tally_guid, tally_name |
| System | audit_log, number_series, setting, attachment, notification | number_series: branch_id, doc_type, fy, prefix, next_no |
