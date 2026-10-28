-- Tally integration tables. These existed in Supabase (created by hand via tally_schema.sql) but were never in a Prisma migration.
-- DB-side defaults mirror tally_schema.sql so raw SQL inserts keep working.
-- CreateTable
CREATE TABLE "tally_connections" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default TallyPrime',
    "host" TEXT NOT NULL DEFAULT 'localhost',
    "port" INTEGER NOT NULL DEFAULT 9000,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "company_name" TEXT NOT NULL,
    "integration_mode" TEXT NOT NULL DEFAULT 'BRIDGE',
    "api_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_ping_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CONFIGURED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_sync_settings" (
    "id" UUID NOT NULL,
    "connection_id" UUID,
    "auto_sync" BOOLEAN NOT NULL DEFAULT true,
    "sync_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "retry_delay_seconds" INTEGER NOT NULL DEFAULT 120,
    "sync_customers" BOOLEAN NOT NULL DEFAULT true,
    "sync_vendors" BOOLEAN NOT NULL DEFAULT true,
    "sync_products" BOOLEAN NOT NULL DEFAULT true,
    "sync_sales_invoices" BOOLEAN NOT NULL DEFAULT true,
    "sync_purchase_bills" BOOLEAN NOT NULL DEFAULT true,
    "sync_payments" BOOLEAN NOT NULL DEFAULT true,
    "sync_receipts" BOOLEAN NOT NULL DEFAULT true,
    "sync_credit_notes" BOOLEAN NOT NULL DEFAULT true,
    "sync_debit_notes" BOOLEAN NOT NULL DEFAULT true,
    "sync_journals" BOOLEAN NOT NULL DEFAULT false,
    "default_debtor_group" TEXT NOT NULL DEFAULT 'Sundry Debtors',
    "default_creditor_group" TEXT NOT NULL DEFAULT 'Sundry Creditors',
    "default_sales_ledger" TEXT NOT NULL DEFAULT 'Sales Account',
    "default_purchase_ledger" TEXT NOT NULL DEFAULT 'Purchase Account',
    "default_cgst_ledger" TEXT NOT NULL DEFAULT 'CGST',
    "default_sgst_ledger" TEXT NOT NULL DEFAULT 'SGST',
    "default_igst_ledger" TEXT NOT NULL DEFAULT 'IGST',
    "default_roundoff_ledger" TEXT NOT NULL DEFAULT 'Round Off',
    "default_bank_ledger" TEXT NOT NULL DEFAULT 'Bank Account',
    "default_cash_ledger" TEXT NOT NULL DEFAULT 'Cash',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_sync_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_entity_mappings" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_code" TEXT,
    "entity_name" TEXT,
    "tally_guid" TEXT,
    "tally_name" TEXT,
    "tally_voucher_no" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'SYNCED',
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_sync_queue" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_code" TEXT,
    "entity_name" TEXT,
    "operation" TEXT NOT NULL DEFAULT 'CREATE',
    "direction" TEXT NOT NULL DEFAULT 'ERP_TO_TALLY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "xml_request" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "locked_until" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_sync_logs" (
    "id" UUID NOT NULL,
    "queue_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "entity_code" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request_xml" TEXT,
    "response_xml" TEXT,
    "response_json" JSONB,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_field_mappings" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "erp_field" TEXT NOT NULL,
    "tally_field" TEXT NOT NULL,
    "default_value" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tally_connections_api_key_key" ON "tally_connections"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "tally_entity_mappings_entity_type_entity_id_key" ON "tally_entity_mappings"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tally_field_mappings_entity_type_erp_field_key" ON "tally_field_mappings"("entity_type", "erp_field");

-- AddForeignKey
ALTER TABLE "tally_sync_settings" ADD CONSTRAINT "tally_sync_settings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tally_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_sync_logs" ADD CONSTRAINT "tally_sync_logs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "tally_sync_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DB-side defaults (match tally_schema.sql)
ALTER TABLE "tally_connections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_connections" ALTER COLUMN "api_key" SET DEFAULT (replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
ALTER TABLE "tally_sync_settings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_entity_mappings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_sync_queue" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_sync_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_field_mappings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tally_connections" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tally_sync_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tally_entity_mappings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tally_sync_queue" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tally_field_mappings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
