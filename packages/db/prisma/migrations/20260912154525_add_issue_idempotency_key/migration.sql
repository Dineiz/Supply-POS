-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Issue_idempotencyKey_key" ON "Issue"("idempotencyKey");
