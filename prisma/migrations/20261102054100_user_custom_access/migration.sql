-- AlterTable
ALTER TABLE "user" ADD COLUMN     "customPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "useCustomAccess" BOOLEAN NOT NULL DEFAULT false;
