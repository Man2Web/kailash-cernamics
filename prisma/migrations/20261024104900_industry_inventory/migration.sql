-- CreateEnum
CREATE TYPE "TransitState" AS ENUM ('IN_TRANSIT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('DRAFT', 'COUNTING', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SETTLED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockType" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "StockType" ADD VALUE 'SAMPLE';

-- AlterTable
ALTER TABLE "batch" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "brand" ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "breakage_entry" ADD COLUMN     "claimId" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "applications" TEXT[],
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "safetyStockDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "stock_transfer" ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "toBranchId" TEXT,
ADD COLUMN     "transitState" "TransitState",
ADD COLUMN     "vehicleNo" TEXT;

-- AlterTable
ALTER TABLE "stock_transfer_line" ADD COLUMN     "damagedPcs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "receivedPcs" INTEGER;

-- CreateTable
CREATE TABLE "stock_count" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "godownId" TEXT NOT NULL,
    "rackId" TEXT,
    "brandId" TEXT,
    "categoryId" TEXT,
    "status" "CountStatus" NOT NULL DEFAULT 'DRAFT',
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "approvalId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rackId" TEXT,
    "stockType" "StockType" NOT NULL DEFAULT 'SALEABLE',
    "systemPcs" INTEGER NOT NULL,
    "countedPcs" INTEGER,
    "variancePcs" INTEGER NOT NULL DEFAULT 0,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_issue" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "godownId" TEXT NOT NULL,
    "partyId" TEXT,
    "influencerId" TEXT,
    "leadId" TEXT,
    "issuedToName" TEXT NOT NULL,
    "phone" TEXT,
    "expectedReturnDate" TIMESTAMP(3),
    "status" "SampleStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sample_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_issue_line" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qtyPcs" INTEGER NOT NULL,
    "returnedPcs" INTEGER NOT NULL DEFAULT 0,
    "closedPcs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sample_issue_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_board" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "godownId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "display_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_board_item" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qtyPcs" INTEGER NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "display_board_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breakage_claim" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "brandId" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "claimedPaise" BIGINT NOT NULL DEFAULT 0,
    "settledPaise" BIGINT NOT NULL DEFAULT 0,
    "settlementType" TEXT,
    "settlementRef" TEXT,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "breakage_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "display_board_branchId_code_key" ON "display_board"("branchId", "code");

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_entry" ADD CONSTRAINT "breakage_entry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "breakage_claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_countId_fkey" FOREIGN KEY ("countId") REFERENCES "stock_count"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue" ADD CONSTRAINT "sample_issue_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue" ADD CONSTRAINT "sample_issue_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue" ADD CONSTRAINT "sample_issue_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue_line" ADD CONSTRAINT "sample_issue_line_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "sample_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue_line" ADD CONSTRAINT "sample_issue_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_issue_line" ADD CONSTRAINT "sample_issue_line_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_board" ADD CONSTRAINT "display_board_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_board_item" ADD CONSTRAINT "display_board_item_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "display_board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_board_item" ADD CONSTRAINT "display_board_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_board_item" ADD CONSTRAINT "display_board_item_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_claim" ADD CONSTRAINT "breakage_claim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
