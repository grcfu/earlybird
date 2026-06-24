import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Category, Channel, Frequency } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set<string>(Object.values(Category));
const VALID_CHANNELS = new Set<string>(Object.values(Channel));
const VALID_FREQUENCIES = new Set<string>(Object.values(Frequency));

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

// GET /api/preferences?email=... → that user's alert rules (newest first).
export async function GET(req: NextRequest) {
  const email = normalizeEmail(req.nextUrl.searchParams.get("email"));
  if (!email) return NextResponse.json({ preferences: [] });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { preferences: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json({ preferences: user?.preferences ?? [] });
}

// POST /api/preferences → create or update a single alert rule.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const channel = String(body.channel ?? "");
  if (!VALID_CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const frequency = String(body.frequency ?? "INSTANT");
  if (!VALID_FREQUENCIES.has(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  // For EMAIL, default the target to the account email when left blank.
  let channelTarget = typeof body.channelTarget === "string" ? body.channelTarget.trim() : "";
  if (channel === "EMAIL" && !channelTarget) channelTarget = email;
  if (!channelTarget) {
    return NextResponse.json(
      { error: "A channel target (webhook URL / chat id) is required" },
      { status: 400 },
    );
  }

  const categories = asStringArray(body.categories).filter((c) =>
    VALID_CATEGORIES.has(c),
  );
  const keywords = asStringArray(body.keywords);
  const locationsFilter = asStringArray(body.locationsFilter);
  const activeOnly = body.activeOnly !== false;
  const enabled = body.enabled !== false;

  const recencyWindowHours = clampInt(body.recencyWindowHours, 1, 720, 48);
  const digestHour = clampInt(body.digestHour, 0, 23, 8);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email },
    update: {},
  });

  const data = {
    categories,
    keywords,
    locationsFilter,
    activeOnly,
    enabled,
    channel: channel as Channel,
    channelTarget,
    frequency: frequency as Frequency,
    recencyWindowHours,
    digestHour,
  };

  // Update only if the rule exists AND belongs to this user; else create.
  const id = typeof body.id === "string" ? body.id : null;
  let preference;
  if (id) {
    const existing = await prisma.notificationPreference.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }
    preference = await prisma.notificationPreference.update({ where: { id }, data });
  } else {
    preference = await prisma.notificationPreference.create({
      data: { ...data, userId: user.id },
    });
  }

  return NextResponse.json({ ok: true, preference });
}

// DELETE /api/preferences?id=...&email=... → remove a rule (must own it).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const email = normalizeEmail(req.nextUrl.searchParams.get("email"));
  if (!id || !email) {
    return NextResponse.json({ error: "id and email are required" }, { status: 400 });
  }
  const existing = await prisma.notificationPreference.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing || existing.user.email !== email) {
    return NextResponse.json({ error: "Preference not found" }, { status: 404 });
  }
  await prisma.notificationPreference.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
