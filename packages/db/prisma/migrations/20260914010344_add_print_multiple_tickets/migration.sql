-- Toggle: when on, the warehouse picking slip prints as one ticket per
-- line item instead of one combined ticket. The customer's delivery note
-- (bill) is never affected.
ALTER TABLE "Warehouse" ADD COLUMN "printMultipleTickets" BOOLEAN NOT NULL DEFAULT false;
