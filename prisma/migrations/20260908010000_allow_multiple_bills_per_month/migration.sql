DROP INDEX IF EXISTS "Bill_tenantId_billingPeriod_key";
CREATE INDEX "Bill_tenantId_billingPeriod_idx" ON "Bill"("tenantId", "billingPeriod");
