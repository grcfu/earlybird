import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/tracker-key { key }
// Sets (or claims) the signed-in user's tracker key. Used to generate a fresh
// key OR to attach an existing key (migrating data tracked before sign-in, e.g.
// after a browser wipe). Requires a session.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  }

  let key = "";
  try {
    const body = await req.json();
    key = (body?.key ?? "").trim();
  } catch {
    /* invalid body */
  }
  if (key.length < 16) {
    return NextResponse.json({ ok: false, error: "invalid key" }, { status: 400 });
  }

  // If another account already owns this key, refuse (don't hijack their data).
  const owner = await prisma.user.findUnique({ where: { trackerKey: key } });
  if (owner && owner.id !== session.user.id) {
    return NextResponse.json(
      { ok: false, error: "that key is already linked to another account" },
      { status: 409 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { trackerKey: key },
  });
  return NextResponse.json({ ok: true, key });
}
