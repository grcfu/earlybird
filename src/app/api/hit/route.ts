import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rotating daily salt input — set STATS_SALT to a random string in prod so the
// visitor hash can't be reverse-engineered. Falls back to a dev default.
const SALT = process.env.STATS_SALT ?? "earlybird-dev-salt";

// Skip obvious non-human traffic so counts reflect real visitors.
const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|preview|monitor|curl|wget|python-requests|axios|headless|lighthouse/i;

const noContent = () => new NextResponse(null, { status: 204 });

// POST /api/hit — fired by the client beacon on each page view. Records a
// privacy-hashed row (no IP or UA stored) for the private /stats page.
export async function POST(req: NextRequest) {
  let path = "/";
  try {
    const body = await req.json();
    if (typeof body?.path === "string") path = body.path.slice(0, 200);
  } catch {
    /* empty/invalid body — default path */
  }
  // Don't count API calls or the stats page itself.
  if (path.startsWith("/api") || path.startsWith("/stats")) return noContent();

  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return noContent();

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";
  const day = new Date().toISOString().slice(0, 10);
  const visitorDay = createHash("sha256")
    .update(`${SALT}|${ip}|${ua}|${day}`)
    .digest("hex")
    .slice(0, 32);

  try {
    await prisma.pageView.create({ data: { path, day, visitorDay } });
  } catch {
    /* never let logging break a page load */
  }
  return noContent();
}
