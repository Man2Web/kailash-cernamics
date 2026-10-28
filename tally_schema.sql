-- ==========================================================
-- TallyPrime Integration PostgreSQL / Supabase Schema
-- ==========================================================

-- 1. TALLY CONNECTIONS
CREATE TABLE IF NOT EXISTS public.tally_connections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL DEFAULT 'Default TallyPrime',
    host text NOT NULL DEFAULT 'localhost',
    port integer NOT NULL DEFAULT 9000,
    protocol text NOT NULL DEFAULT 'http',
    company_name text NOT NULL,
    integration_mode text NOT NULL DEFAULT 'BRIDGE', -- 'BRIDGE' or 'DIRECT'
    api_key text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    is_active boolean NOT NULL DEFAULT true,
    last_ping_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    status text NOT NULL DEFAULT 'CONFIGURED', -- 'CONFIGURED', 'ONLINE', 'OFFLINE', 'ERROR'
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. TALLY SYNC SETTINGS
CREATE TABLE IF NOT EXISTS public.tally_sync_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id uuid REFERENCES public.tally_connections(id) ON DELETE CASCADE,
    auto_sync boolean NOT NULL DEFAULT true,
    sync_interval_seconds integer NOT NULL DEFAULT 60,
    max_retries integer NOT NULL DEFAULT 5,
    retry_delay_seconds integer NOT NULL DEFAULT 120,
    
    -- Entity sync toggles
    sync_customers boolean NOT NULL DEFAULT true,
    sync_vendors boolean NOT NULL DEFAULT true,
    sync_products boolean NOT NULL DEFAULT true,
    sync_sales_invoices boolean NOT NULL DEFAULT true,
    sync_purchase_bills boolean NOT NULL DEFAULT true,
    sync_payments boolean NOT NULL DEFAULT true,
    sync_receipts boolean NOT NULL DEFAULT true,
    sync_credit_notes boolean NOT NULL DEFAULT true,
    sync_debit_notes boolean NOT NULL DEFAULT true,
    sync_journals boolean NOT NULL DEFAULT false,
    
    -- Default Tally Ledgers
    default_debtor_group text NOT NULL DEFAULT 'Sundry Debtors',
    default_creditor_group text NOT NULL DEFAULT 'Sundry Creditors',
    default_sales_ledger text NOT NULL DEFAULT 'Sales Account',
    default_purchase_ledger text NOT NULL DEFAULT 'Purchase Account',
    default_cgst_ledger text NOT NULL DEFAULT 'CGST',
    default_sgst_ledger text NOT NULL DEFAULT 'SGST',
    default_igst_ledger text NOT NULL DEFAULT 'IGST',
    default_roundoff_ledger text NOT NULL DEFAULT 'Round Off',
    default_bank_ledger text NOT NULL DEFAULT 'Bank Account',
    default_cash_ledger text NOT NULL DEFAULT 'Cash',
    
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. TALLY ENTITY MAPPINGS
CREATE TABLE IF NOT EXISTS public.tally_entity_mappings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type text NOT NULL, -- 'CUSTOMER', 'VENDOR', 'PRODUCT', 'SALES_INVOICE', 'PURCHASE_BILL', 'PAYMENT', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'JOURNAL'
    entity_id uuid NOT NULL,
    entity_code text, -- e.g. INV-0001, CUST-001, SKU-123
    entity_name text, -- e.g. Customer Name, Product Name
    tally_guid text,
    tally_name text, -- Tally Ledger Name or Stock Item Name
    tally_voucher_no text, -- Tally Voucher Number if voucher
    sync_status text NOT NULL DEFAULT 'SYNCED', -- 'SYNCED', 'MANUALLY_LINKED', 'PENDING'
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT uq_tally_entity_type_id UNIQUE (entity_type, entity_id)
);

-- 4. TALLY SYNC QUEUE
CREATE TABLE IF NOT EXISTS public.tally_sync_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type text NOT NULL, -- 'CUSTOMER', 'VENDOR', 'PRODUCT', 'SALES_INVOICE', 'PURCHASE_BILL', 'PAYMENT', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'JOURNAL'
    entity_id uuid NOT NULL,
    entity_code text,
    entity_name text,
    operation text NOT NULL DEFAULT 'CREATE', -- 'CREATE', 'UPDATE', 'DELETE'
    direction text NOT NULL DEFAULT 'ERP_TO_TALLY', -- 'ERP_TO_TALLY', 'TALLY_TO_ERP'
    status text NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'SYNCED', 'FAILED', 'RETRYING', 'CANCELLED'
    payload jsonb NOT NULL,
    xml_request text,
    retry_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 5,
    locked_until timestamp with time zone,
    locked_by text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. TALLY SYNC LOGS
CREATE TABLE IF NOT EXISTS public.tally_sync_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    queue_id uuid REFERENCES public.tally_sync_queue(id) ON DELETE SET NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    entity_code text,
    operation text NOT NULL,
    status text NOT NULL, -- 'SUCCESS', 'FAILED', 'RETRY'
    request_xml text,
    response_xml text,
    response_json jsonb,
    error_message text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. TALLY FIELD MAPPINGS
CREATE TABLE IF NOT EXISTS public.tally_field_mappings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type text NOT NULL, -- 'CUSTOMER', 'VENDOR', 'PRODUCT', 'TAX', etc.
    erp_field text NOT NULL,
    tally_field text NOT NULL,
    default_value text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT uq_tally_field_mapping UNIQUE (entity_type, erp_field)
);

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_tally_queue_status ON public.tally_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_tally_queue_entity ON public.tally_sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tally_mappings_entity ON public.tally_entity_mappings(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tally_mappings_tally_guid ON public.tally_entity_mappings(tally_guid);
CREATE INDEX IF NOT EXISTS idx_tally_logs_queue_id ON public.tally_sync_logs(queue_id);
CREATE INDEX IF NOT EXISTS idx_tally_logs_created_at ON public.tally_sync_logs(created_at DESC);

-- 7. Seed Initial Tally Permissions
INSERT INTO public.permissions (id, code, name, module, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'tally:view', 'View Tally Integration', 'ADMINISTRATION', now(), now()),
  (gen_random_uuid(), 'tally:manage', 'Manage Tally Connection', 'ADMINISTRATION', now(), now()),
  (gen_random_uuid(), 'tally:sync', 'Trigger Tally Sync', 'ADMINISTRATION', now(), now()),
  (gen_random_uuid(), 'tally:retry', 'Retry Tally Sync Jobs', 'ADMINISTRATION', now(), now()),
  (gen_random_uuid(), 'tally:settings', 'Update Tally Settings', 'ADMINISTRATION', now(), now()),
  (gen_random_uuid(), 'tally:logs', 'View Tally Technical Logs', 'ADMINISTRATION', now(), now())
ON CONFLICT (code) DO NOTHING;

-- Grant permissions to Super Admin role if exists
DO $$
DECLARE
    super_admin_role_id uuid;
    perm RECORD;
BEGIN
    SELECT id INTO super_admin_role_id FROM public.roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
    IF super_admin_role_id IS NOT NULL THEN
        FOR perm IN SELECT id FROM public.permissions WHERE code LIKE 'tally:%' LOOP
            INSERT INTO public.role_permissions (id, role_id, permission_id)
            VALUES (gen_random_uuid(), super_admin_role_id, perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;
