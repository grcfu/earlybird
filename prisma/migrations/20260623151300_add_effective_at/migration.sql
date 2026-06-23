-- DropIndex
DROP INDEX "Listing_datePosted_idx";

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Listing_effectiveAt_idx" ON "Listing"("effectiveAt");

-- CreateIndex
CREATE INDEX "Listing_category_idx" ON "Listing"("category");
