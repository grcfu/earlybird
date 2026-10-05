-- Hand corrections to tracked applications.
--
-- The classifier sometimes gets a company, role or stage wrong, or misses an
-- email entirely. The user can now fix a row by hand, and these columns pin the
-- fix so ingest (including backfill replays of old mail) doesn't undo it:
-- locked names are kept verbatim, and no email dated on or before stageSetAt
-- can move the stage. Missed stages are added as manual timeline entries.
ALTER TABLE "TrackedApplication" ADD COLUMN "companyLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackedApplication" ADD COLUMN "roleLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackedApplication" ADD COLUMN "stageSetAt" TIMESTAMP(3);

ALTER TABLE "ApplicationEmail" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ApplicationEmail" ADD COLUMN "note" TEXT;
