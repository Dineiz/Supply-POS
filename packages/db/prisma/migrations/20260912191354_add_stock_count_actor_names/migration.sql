-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN "performedByName" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "approvedByName" TEXT;

-- AlterTable
ALTER TABLE "StockCountSession" ADD COLUMN "startedByName" TEXT;
ALTER TABLE "StockCountSession" ADD COLUMN "completedByName" TEXT;
ALTER TABLE "StockCountSession" ADD COLUMN "approvedByName" TEXT;

-- AlterTable
ALTER TABLE "StockCountLine" ADD COLUMN "countedByName" TEXT;
