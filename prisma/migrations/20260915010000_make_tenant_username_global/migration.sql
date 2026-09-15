-- Tenant login no longer asks for an apartment code, so usernames must identify
-- exactly one tenant. Existing duplicates are renamed deterministically before
-- the global unique index is created.
WITH duplicate_usernames AS (
  SELECT "username"
  FROM "User_Tenant"
  GROUP BY "username"
  HAVING COUNT(*) > 1
)
UPDATE "User_Tenant" AS tenant
SET "username" = LEFT(tenant."username", 63) || '-' || tenant."id"::text
FROM duplicate_usernames
WHERE tenant."username" = duplicate_usernames."username";

DROP INDEX "User_Tenant_apartmentId_username_key";
DROP INDEX "User_Tenant_username_idx";
CREATE UNIQUE INDEX "User_Tenant_username_key" ON "User_Tenant"("username");
