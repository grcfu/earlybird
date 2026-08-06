-- Where a listing actually is, as an ISO-3166 alpha-2 code.
--
-- The feed has always been US-only, but the rule ran at query time by regex-ing
-- the location strings against a hand-kept list of foreign place names. That can
-- only recognize spellings someone thought to add: it knew "Munich" but not
-- "München", "Amsterdam" but not "Eindhoven", "China" but not "PRC". Resolving a
-- country once at ingest — from the ATS's own country field where there is one —
-- replaces the guessing with a lookup.
--
-- Nullable on purpose: plenty of boards say only "5 Locations", and "unknown" is
-- a different thing from "not in the US". Existing rows are backfilled by
-- scripts/backfill-country.ts.
ALTER TABLE "Listing" ADD COLUMN "country" TEXT;

CREATE INDEX "Listing_country_idx" ON "Listing"("country");
