-- Walk-in and phone-call enquiries (Leads & Enquiries module).
-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "lead_no" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "enquiry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternate_phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "address" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirement" TEXT,
    "area_sqft" DECIMAL(12,2),
    "budget" DECIMAL(12,2),
    "project_type" TEXT,
    "timeline" TEXT,
    "heard_from" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "next_follow_up_date" DATE,
    "notes" TEXT,
    "assigned_to_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_no_key" ON "leads"("lead_no");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_next_follow_up_date_idx" ON "leads"("next_follow_up_date");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

