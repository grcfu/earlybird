-- CreateEnum
CREATE TYPE "AppStage" AS ENUM ('APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'REJECTED');

-- CreateTable
CREATE TABLE "TrackedApplication" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "stage" "AppStage" NOT NULL DEFAULT 'APPLIED',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'email',
    "lastSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrackedApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedApplication_ownerKey_company_role_key" ON "TrackedApplication"("ownerKey", "company", "role");
CREATE INDEX "TrackedApplication_ownerKey_idx" ON "TrackedApplication"("ownerKey");
