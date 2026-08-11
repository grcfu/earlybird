// A daily ceiling on Gemini calls, per account.
//
// The key is the app owner's. Every parse, analyze and fit bills to one Google
// account and shares one rate limit, so without a ceiling a single user working
// through twenty postings can spend the owner's quota and 429 everyone else.
//
// Deliberately generous: this is a backstop against runaway use, not a paywall.
// A real tailoring session is an import plus a handful of analyses.

export const DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 40);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Count one call against the user's day, and say whether it may proceed.
 *
 * Reserves BEFORE the call rather than recording after it. A failed Gemini
 * request still costs latency and can still be retried in a loop, so counting
 * attempts is what actually bounds the damage. The alternative — charging only
 * for successes — leaves a failing loop uncapped, which is the exact scenario
 * worth protecting against.
 */
export async function reserveGeminiCall(userId: string): Promise<QuotaCheck> {
  const day = today();
  try {
    // Imported lazily so the pure exports above (the limit, the message) can be
    // unit-tested without dragging in the DB client and its DATABASE_URL check.
    // Module resolution is cached, so this costs nothing after the first call.
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.aiUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return {
      allowed: row.count <= DAILY_LIMIT,
      used: row.count,
      limit: DAILY_LIMIT,
    };
  } catch (err) {
    // FAIL OPEN, deliberately.
    //
    // This is a backstop against runaway use, not an entitlement check — there
    // is nothing to protect by denying a legitimate request. Failing closed
    // would also create a nasty deployment coupling: this code shipping before
    // its migration runs would turn a missing table into a 500 on every parse,
    // analyze and fit, taking down the whole feature to enforce a limit nobody
    // was hitting. Better to let the call through and leave a trace.
    console.error("[resume] quota check failed, allowing the call:", err);
    return { allowed: true, used: 0, limit: DAILY_LIMIT };
  }
}

export function quotaMessage(check: QuotaCheck): string {
  return `Daily limit reached (${check.limit} AI requests). This resets at midnight UTC. The limit exists because EarlyBird pays for these calls out of one shared API key.`;
}
