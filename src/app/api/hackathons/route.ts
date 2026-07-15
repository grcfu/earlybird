import { NextRequest, NextResponse } from "next/server";
import { parseHackathonQuery, queryHackathons } from "@/lib/hackathons";

// pg driver adapter requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/hackathons?format=online&when=month&q=ai&location=NY&sort=soon&cursor=...
export async function GET(req: NextRequest) {
  const q = parseHackathonQuery(req.nextUrl.searchParams);
  const page = await queryHackathons(q);
  return NextResponse.json(page);
}
