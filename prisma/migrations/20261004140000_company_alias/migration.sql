-- Remembered company-name fixes. When the user renames an application away from
-- a misread name (often a recruiter's name taken for the employer), future
-- emails read as that name are filed under the corrected company.
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyAlias_ownerKey_alias_key" ON "CompanyAlias"("ownerKey", "alias");
