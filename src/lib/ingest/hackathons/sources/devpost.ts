import { fetchJson } from "@/lib/ingest/http";
import { hackathonId } from "@/lib/ingest/hackathons/hash";
import {
  cleanPrize,
  parseDevpostDates,
  parseFormat,
} from "@/lib/ingest/hackathons/parse";
import type {
  HackathonSource,
  NormalizedHackathon,
} from "@/lib/ingest/hackathons/types";

const SOURCE_NAME = "devpost";

// Devpost's public hackathons API. challenge_type + status are repeatable query
// params; the response is { hackathons: [...], meta: { total_count } }, 9/page.
const BASE = "https://devpost.com/api/hackathons";
const PER_PAGE = 9; // Devpost's fixed page size
const MAX_PAGES = 8; // cap ~72 events per (type) — plenty of upcoming ones
// A browser-ish UA; the earlybird-ingest default occasionally trips Devpost's
// bot filter, so override it here.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

interface DevpostHackathon {
  title?: unknown;
  url?: unknown;
  displayed_location?: { icon?: unknown; location?: unknown };
  open_state?: unknown;
  prize_amount?: unknown;
  submission_period_dates?: unknown;
  themes?: unknown;
  registrations_count?: unknown;
  thumbnail_url?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// "//d112...cloudfront.net/x.png" -> "https://d112...cloudfront.net/x.png".
function normalizeImage(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

function adaptOne(raw: DevpostHackathon, challengeType: string): NormalizedHackathon | null {
  const name = asString(raw.title);
  const url = asString(raw.url);
  if (!name || !url) return null;

  const loc = asString(raw.displayed_location?.location) ?? "";
  const isOnline =
    raw.displayed_location?.icon === "globe" || /online/i.test(loc);
  // challengeType is what we queried by; the globe icon confirms online.
  const format = parseFormat(isOnline ? "online" : challengeType);

  const dateLabel = asString(raw.submission_period_dates);
  const { startsAt, endsAt } = parseDevpostDates(dateLabel);

  const themes = Array.isArray(raw.themes)
    ? raw.themes
        .map((t) => asString((t as { name?: unknown })?.name))
        .filter((t): t is string => !!t)
    : [];

  const participants =
    typeof raw.registrations_count === "number"
      ? raw.registrations_count
      : null;

  return {
    id: hackathonId({ name, url }),
    source: SOURCE_NAME,
    name,
    url,
    format,
    locationLabel: isOnline ? "Online" : loc,
    // Devpost's location is free-form ("City, ST" / "City, Country"); the
    // query-time US filter runs against locationLabel, so country stays null.
    country: null,
    startsAt,
    endsAt,
    dateLabel,
    prize: cleanPrize(asString(raw.prize_amount)),
    themes,
    participants,
    imageUrl: normalizeImage(raw.thumbnail_url),
    active: asString(raw.open_state) !== "ended",
  };
}

async function fetchType(challengeType: string): Promise<NormalizedHackathon[]> {
  const out: NormalizedHackathon[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs =
      `?challenge_type[]=${encodeURIComponent(challengeType)}` +
      `&status[]=open&status[]=upcoming&page=${page}`;
    const raw = (await fetchJson(BASE + qs, {
      headers: { "User-Agent": UA },
    })) as { hackathons?: DevpostHackathon[] };
    const items = raw?.hackathons ?? [];
    for (const it of items) {
      const h = adaptOne(it, challengeType);
      if (h) out.push(h);
    }
    if (items.length < PER_PAGE) break; // last page
  }
  return out;
}

export const devpostSource: HackathonSource = {
  name: SOURCE_NAME,
  load: async () => {
    // Online + in-person are separate queries; hybrids surface under both and
    // collapse in dedup by id.
    const [online, inPerson] = await Promise.all([
      fetchType("online"),
      fetchType("in-person"),
    ]);
    const hackathons = [...online, ...inPerson];
    return { hackathons, fetched: hackathons.length };
  },
};
