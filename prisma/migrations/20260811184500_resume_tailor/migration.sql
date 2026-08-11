-- The base resume behind the Resume Tailor tab.
--
-- Two representations of the same document, both needed. "data" is the
-- structured JSON Gemini extracted, which is what tailoring reasons over.
-- "docx" is the user's original upload kept byte-for-byte, because the export
-- edits THAT file rather than re-rendering the JSON — that is the only way the
-- exported copy keeps their exact fonts, margins and spacing.
--
-- One row per user: tailoring never writes here, it works on an in-memory copy,
-- so the only thing that changes this row is an explicit re-import.
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "docx" BYTEA NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- One base resume per account.
CREATE UNIQUE INDEX "Resume_userId_key" ON "Resume"("userId");

-- Deleting the account takes the stored resume and its binary with it.
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
