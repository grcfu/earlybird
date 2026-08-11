-- Per-user, per-day count of Gemini calls from the Resume Tailor.
--
-- The API key belongs to the app owner, not the user: every parse, analyze and
-- fit bills to one account and shares one rate limit. This is the ceiling that
-- keeps one enthusiastic user from spending that quota or 429-ing everyone.
--
-- A row per (user, day) rather than a rolling window: one indexed upsert per
-- call, and old rows prune by day.
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsage_userId_day_key" ON "AiUsage"("userId", "day");
CREATE INDEX "AiUsage_day_idx" ON "AiUsage"("day");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
