-- Soft delete on TrackedApplication
ALTER TABLE "TrackedApplication" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Per-application email history
CREATE TABLE "ApplicationEmail" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromAddr" TEXT,
    "stage" "AppStage" NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "msgHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationEmail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApplicationEmail_applicationId_idx" ON "ApplicationEmail"("applicationId");
CREATE INDEX "ApplicationEmail_ownerKey_msgHash_idx" ON "ApplicationEmail"("ownerKey", "msgHash");
ALTER TABLE "ApplicationEmail" ADD CONSTRAINT "ApplicationEmail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TrackedApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
