import { HackathonFormat } from "@/generated/prisma/client";

// Map a source's format vocabulary onto our enum. Handles both MLH
// ("digital" / "physical" / "hybrid_physical") and Devpost ("online" /
// "in-person" / "hybrid"). Unknown → IN_PERSON (the safe default; the US filter
// then applies against the location label).
export function parseFormat(raw: string | null | undefined): HackathonFormat {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("hybrid")) return HackathonFormat.HYBRID;
  if (s.includes("digital") || s.includes("online") || s.includes("virtual")) {
    return HackathonFormat.ONLINE;
  }
  return HackathonFormat.IN_PERSON;
}

// Strip HTML/entities out of Devpost's prize markup, e.g.
// "$<span data-currency-value>2,000,000</span>" -> "$2,000,000". Returns null
// for empty / "$0" values so the card can omit the prize line.
export function cleanPrize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /^\$?0$/.test(text)) return null;
  return text;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// A UTC date at midnight — hackathon timing is day-granular, so we avoid any
// timezone drift by pinning to 00:00:00Z.
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// Parse Devpost's human date range into start/end Dates. Handles:
//   "May 19 - Aug 17, 2026"        (cross-month, one year)
//   "Jul 10 - 16, 2026"            (same month)
//   "Dec 1, 2025 - Feb 28, 2026"   (cross-year, year on each side)
//   "Jan 5, 2026"                  (single day / no range)
// The trailing year applies to both sides unless a side names its own year.
// Returns nulls on anything unparseable (the raw string is still kept as label).
export function parseDevpostDates(
  raw: string | null | undefined,
): { startsAt: Date | null; endsAt: Date | null } {
  if (!raw) return { startsAt: null, endsAt: null };
  const parts = raw.split(/\s*[-–]\s*/);
  const left = parts[0]?.trim();
  const right = (parts[1] ?? parts[0])?.trim();
  if (!left || !right) return { startsAt: null, endsAt: null };

  const endYear = right.match(/\b(\d{4})\b/);
  const year = endYear ? Number(endYear[1]) : null;
  if (!year) return { startsAt: null, endsAt: null };

  // Extract (month, day) from a token; month is optional (falls back to `carry`).
  const pick = (
    token: string,
    carryMonth: number | null,
  ): { month: number | null; day: number | null } => {
    const mm = token.match(/([A-Za-z]{3,})/);
    const dd = token.match(/\b(\d{1,2})\b/);
    const month = mm ? (MONTHS[mm[1].slice(0, 3).toLowerCase()] ?? null) : carryMonth;
    return { month, day: dd ? Number(dd[1]) : null };
  };

  const startYear = left.match(/\b(\d{4})\b/);
  const l = pick(left, null);
  const r = pick(right, l.month);
  if (l.month == null || l.day == null || r.day == null) {
    return { startsAt: null, endsAt: null };
  }
  const rMonth = r.month ?? l.month;
  const startsAt = utcDate(startYear ? Number(startYear[1]) : year, l.month, l.day);
  const endsAt = utcDate(year, rMonth, r.day);
  return { startsAt, endsAt };
}

// Best-effort country label for an in-person venue. MLH gives an ISO-ish code
// (e.g. "US", "IN"); Devpost gives a free-form "City, ST" / "City, Country"
// string. We keep it mostly for display/debugging — the query-time US filter
// runs against locationLabel (like the listings filter), so this need not be
// exhaustive. Returns null when nothing usable is present.
export function normalizeCountry(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2,3}$/.test(s)) return s.toUpperCase();
  return s;
}
