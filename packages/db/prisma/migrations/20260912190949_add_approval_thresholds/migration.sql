-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN "wastageApprovalThreshold" DECIMAL(14,2) NOT NULL DEFAULT 2000;
ALTER TABLE "Warehouse" ADD COLUMN "countVarianceApprovalThreshold" DECIMAL(14,2) NOT NULL DEFAULT 5000;
