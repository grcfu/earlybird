-- Whether this application came with a referral.
--
-- Nothing in an email reliably says it — a referral happens before you apply,
-- and the confirmation that follows reads the same either way — so this is the
-- one field on an application that only the user can set. Defaults to false
-- because most applications have none, and the export reads it as a marker:
-- "Yes" when set, blank when not.
ALTER TABLE "TrackedApplication" ADD COLUMN "referral" BOOLEAN NOT NULL DEFAULT false;
