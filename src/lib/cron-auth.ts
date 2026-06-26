import type { NextRequest } from "next/server";

// Shared secret guard for cron-triggered routes (/api/ingest, /api/notify).
//
// Accepts the secret three ways so both Vercel Cron and manual triggering work:
//   1. `Authorization: Bearer <CRON_SECRET>` — sent automatically by Vercel Cron
//      whenever CRON_SECRET is set in the project's environment variables.
//   2. `x-cron-secret: <CRON_SECRET>`         — convenient for curl / scripts.
//   3. `?secret=<CRON_SECRET>`                — convenient for a browser hit.
//
// When CRON_SECRET is unset (i.e. local dev), the guard falls open so the routes
// stay easy to trigger by hand. In production, set CRON_SECRET and it's enforced.
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → dev convenience

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;

  return false;
}
