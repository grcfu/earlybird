-- Which recruiting cycle a tracked application belongs to (the summer year it
-- targets; 0 = undetermined). Defaults to 0 for existing rows, which are then
-- backfilled by scripts/backfill-cycle.ts so the rule lives in one place.
ALTER TABLE "TrackedApplication" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0;

-- Widen the uniqueness key to include the cycle, so re-applying to the same
-- company in a later season is a distinct application rather than a conflict.
-- Safe to swap in this order: every existing row keeps cycle = 0, so the old
-- (ownerKey, company, role) guarantee already implies the new one holds.
DROP INDEX "TrackedApplication_ownerKey_company_role_key";
CREATE UNIQUE INDEX "TrackedApplication_ownerKey_company_role_cycle_key"
  ON "TrackedApplication"("ownerKey", "company", "role", "cycle");
