import { NextRequest, NextResponse } from "next/server";
import { parseListingQuery, queryListings } from "@/lib/listings";

// pg driver adapter requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/listings?window=2d&categories=SWE,ML_AI&location=NY&sponsorship=any&activeOnly=true&cursor=...
export async function GET(req: NextRequest) {
  const q = parseListingQuery(req.nextUrl.searchParams);
  const page = await queryListings(q);
  return NextResponse.json(page);
}
