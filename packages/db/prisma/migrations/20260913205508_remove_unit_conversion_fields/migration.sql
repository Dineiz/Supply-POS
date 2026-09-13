-- Units no longer record a conversion to another unit. That relationship
-- (e.g. "1 Bag (20kg) = 20 Kilogram") was never read by any query — the
-- actual, used conversion lives on Item.purchaseToSellFactor, entered once
-- when the item is set up. Keeping both was silent duplicate data entry.
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_baseUnitId_fkey";

ALTER TABLE "Unit" DROP COLUMN "baseUnitId";
ALTER TABLE "Unit" DROP COLUMN "factorToBase";
