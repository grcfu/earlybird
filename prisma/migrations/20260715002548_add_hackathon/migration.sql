-- CreateEnum
CREATE TYPE "HackathonFormat" AS ENUM ('ONLINE', 'IN_PERSON', 'HYBRID');

-- CreateTable
CREATE TABLE "Hackathon" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "format" "HackathonFormat" NOT NULL DEFAULT 'IN_PERSON',
    "locationLabel" TEXT NOT NULL DEFAULT '',
    "country" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dateLabel" TEXT,
    "prize" TEXT,
    "themes" TEXT[],
    "participants" INTEGER,
    "imageUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Hackathon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hackathon_startsAt_idx" ON "Hackathon"("startsAt");
CREATE INDEX "Hackathon_firstSeenAt_idx" ON "Hackathon"("firstSeenAt");
CREATE INDEX "Hackathon_active_idx" ON "Hackathon"("active");
CREATE INDEX "Hackathon_format_idx" ON "Hackathon"("format");
