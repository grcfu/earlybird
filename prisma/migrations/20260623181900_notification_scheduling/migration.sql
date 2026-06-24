-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastDigestAt" TIMESTAMP(3);
