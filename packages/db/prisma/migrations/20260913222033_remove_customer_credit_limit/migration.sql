-- Removes the credit-limit cap on customers. It was blocking deliveries
-- once a restaurant's balance passed a configured ceiling (with a manager
-- override), and was shown across the counter, customer records, delivery
-- notes, and several reports. Removed entirely per request -- no cap, no
-- warning, no blocking.
ALTER TABLE "Customer" DROP COLUMN "creditLimit";
