import { hackathonId } from "@/lib/ingest/hackathons/hash";
import { normalizeCountry, parseFormat } from "@/lib/ingest/hackathons/parse";
import type {
  HackathonSource,
  NormalizedHackathon,
} from "@/lib/ingest/hackathons/types";

const SOURCE_NAME = "mlh";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// MLH's season page is a JS app that embeds all events as an Inertia data island
// in a single <script type="application/json"> tag: { props: { upcomingEvents,
// pastEvents } }. We parse that rather than the (client-rendered) DOM.
const JSON_ISLAND = /<script[^>]*application\/json[^>]*>([\s\S]*?)<\/script>/;

interface MlhEvent {
  name?: unknown;
  dateRange?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  formatType?: unknown;
  location?: unknown;
  url?: unknown;
  websiteUrl?: unknown;
  logoUrl?: unknown;
  backgroundUrl?: unknown;
  venueAddress?: { country?: unknown } | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function parseDate(v: unknown): Date | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchSeason(year: number): Promise<MlhEvent[]> {
  const res = await fetch(`https://mlh.io/seasons/${year}/events`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();
  const m = html.match(JSON_ISLAND);
  if (!m) throw new Error("no JSON island found on MLH season page");
  const props = (JSON.parse(m[1].trim()) as { props?: { upcomingEvents?: MlhEvent[] } })
    ?.props;
  return props?.upcomingEvents ?? [];
}

function adaptOne(raw: MlhEvent): NormalizedHackathon | null {
  const name = asString(raw.name);
  // Prefer the event's own site; fall back to its MLH page.
  const website = asString(raw.websiteUrl);
  const mlhPath = asString(raw.url);
  const url = website ?? (mlhPath ? `https://mlh.io${mlhPath}` : null);
  if (!name || !url) return null;

  return {
    id: hackathonId({ name, url }),
    source: SOURCE_NAME,
    name,
    url,
    format: parseFormat(asString(raw.formatType)),
    locationLabel: asString(raw.location) ?? "",
    country: normalizeCountry(asString(raw.venueAddress?.country)),
    startsAt: parseDate(raw.startsAt),
    endsAt: parseDate(raw.endsAt),
    dateLabel: asString(raw.dateRange),
    prize: null, // MLH doesn't expose prize pools
    themes: [],
    participants: null,
    imageUrl: asString(raw.logoUrl) ?? asString(raw.backgroundUrl),
    active: true, // upcomingEvents are, by definition, live
  };
}

export const mlhSource: HackathonSource = {
  name: SOURCE_NAME,
  load: async () => {
    // MLH names a season by its END year (the 2027 season runs ~Aug 2026–Jun
    // 2027). Fetch this year's and next year's seasons and take the upcoming
    // events from both, so the active season is always covered at any point in
    // the calendar. currentYear is passed in from the run (see index.ts).
    const now = new Date();
    const y = now.getUTCFullYear();
    const seasons = [y, y + 1];
    const all: MlhEvent[] = [];
    for (const s of seasons) {
      try {
        all.push(...(await fetchSeason(s)));
      } catch {
        /* a missing/failed season page shouldn't sink the other */
      }
    }
    const hackathons = all
      .map(adaptOne)
      .filter((h): h is NormalizedHackathon => h !== null);
    return { hackathons, fetched: all.length };
  },
};
