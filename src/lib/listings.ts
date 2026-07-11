import { prisma } from "@/lib/prisma";
import { Category } from "@/generated/prisma/client";
import {
  DEFAULT_WINDOW,
  isRecencyWindow,
  windowCutoff,
  type RecencyWindow,
} from "@/lib/recency";
import { eligibleSummerYears } from "@/lib/eligibility";
import { TIER1_PATTERN, TIER2_PATTERN } from "@/lib/prestige";

export type SponsorshipFilter = "any" | "sponsors" | "no";
export type SortMode = "recent" | "top"; // recent = newest first; top = prestige then newest

export interface ListingFilters {
  window: RecencyWindow;
  categories: Category[]; // empty = all categories
  search: string | null; // substring match across company + title
  location: string | null; // substring match across locations[]
  sponsorship: SponsorshipFilter;
  activeOnly: boolean;
}

export interface ListingQuery extends ListingFilters {
  cursor: string | null;
  limit: number;
  sort: SortMode;
}

// Serializable row shape sent to the client (dates as ISO strings).
export interface ListingRow {
  id: string;
  source: string;
  company: string;
  title: string;
  category: Category;
  locations: string[];
  applyUrl: string;
  sponsorship: string | null;
  season: string | null;
  datePosted: string | null;
  firstSeenAt: string;
  effectiveAt: string;
  active: boolean;
}

export interface ListingPage {
  listings: ListingRow[];
  nextCursor: string | null;
  count: number; // total matching the filters+window (ignoring pagination)
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// US-only: a role is dropped when every one of its listed locations is
// recognizably non-US. We match on countries / regions / unambiguous foreign
// cities (avoiding names that collide with US places, e.g. no "Ontario" since
// Ontario, CA exists). Roles with no location, or any US/remote/ambiguous
// location, are kept.
const NON_US_NAMES = [
  // countries & nations
  "canada", "mexico", "united kingdom", "england", "scotland", "wales",
  "ireland", "germany", "france", "spain", "portugal", "italy", "netherlands",
  "belgium", "luxembourg", "switzerland", "austria", "sweden", "norway",
  "denmark", "finland", "iceland", "poland", "czech", "slovakia", "hungary",
  "romania", "bulgaria", "greece", "turkey", "russia", "ukraine", "serbia",
  "croatia", "estonia", "latvia", "lithuania", "india", "china", "japan",
  "south korea", "korea", "singapore", "hong kong", "taiwan", "thailand",
  "vietnam", "philippines", "malaysia", "indonesia", "cambodia", "australia",
  "new zealand", "brazil", "argentina", "chile", "colombia", "peru", "israel",
  "united arab emirates", "saudi arabia", "qatar", "egypt", "morocco",
  "south africa", "nigeria", "kenya", "pakistan", "bangladesh", "sri lanka",
  // Canadian places (Canada often omitted from the string)
  "toronto", "montreal", "ottawa", "calgary", "edmonton", "winnipeg",
  // unambiguous foreign cities (no major US namesake)
  "bengaluru", "bangalore", "hyderabad", "gurgaon", "gurugram", "noida",
  "chennai", "mumbai", "new delhi", "pune", "kolkata", "beijing", "shanghai",
  "shenzhen", "guangzhou", "hangzhou", "tokyo", "osaka", "seoul", "taipei",
  "tel aviv", "dubai", "abu dhabi", "sao paulo", "são paulo", "warsaw",
  "krakow", "bucharest", "lisbon", "dublin", "amsterdam", "munich", "berlin",
  "frankfurt", "zurich", "stockholm", "copenhagen", "helsinki", "barcelona",
  "madrid", "ho chi minh", "hanoi", "manila", "jakarta", "kuala lumpur",
  "bangkok", "auckland", "wellington", "christchurch", "edinburgh", "glasgow",
  "cork", "galway", "gothenburg", "rotterdam", "hamburg", "cologne", "prague",
  "budapest", "oslo", "brisbane", "adelaide",
];

// Country/region codes with NO US state-or-DC collision, matched as whole words
// (so "Auckland, NZ" or "Sydney, AUS" is caught, but "Austin, TX" isn't).
// Deliberately excludes ambiguous 2-letter codes like CA/DE/IN/IL/OR/PA/LA/GA…
const NON_US_CODES = [
  "nz", "uk", "au", "aus", "ie", "jp", "jpn", "sg", "sgp", "hk", "hkg",
  "kr", "kor", "cn", "chn", "br", "bra", "mx", "mex", "es", "esp", "it",
  "ita", "nl", "nld", "se", "swe", "ch", "che", "pl", "be", "at", "dk",
  "fi", "pt", "gr", "cz", "ro", "ua", "tr", "eg", "ng", "ke", "pk", "bd",
  "lk", "my", "th", "sa", "ae", "uae", "ph", "phl", "vn", "vnm", "tw",
  "twn", "za", "zaf", "gbr", "deu", "fra",
];

const NON_US_PATTERN =
  NON_US_NAMES.join("|") + "|\\m(" + NON_US_CODES.join("|") + ")\\M";

// Keyset cursor = the ordering key parts joined, so pagination is stable under
// inserts. Recent sort uses [effectiveAt, id]; top sort uses [tier, effectiveAt, id].
function encodeCursor(...parts: string[]): string {
  return Buffer.from(parts.join("|"), "utf8").toString("base64url");
}
function decodeCursor(cursor: string): string[] | null {
  try {
    const parts = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    return parts.length ? parts : null;
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = new Set(Object.values(Category));

// Parse untrusted query params (from URL or API) into a validated ListingQuery.
export function parseListingQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ListingQuery {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const windowRaw = get("window");
  const window: RecencyWindow = isRecencyWindow(windowRaw)
    ? windowRaw
    : DEFAULT_WINDOW;

  const categories = (get("categories") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c): c is Category => VALID_CATEGORIES.has(c as Category));

  const sponsorshipRaw = get("sponsorship");
  const sponsorship: SponsorshipFilter =
    sponsorshipRaw === "sponsors" || sponsorshipRaw === "no"
      ? sponsorshipRaw
      : "any";

  const search = (get("q") ?? "").trim() || null;
  const location = (get("location") ?? "").trim() || null;
  const activeOnly = get("activeOnly") !== "false"; // default true
  const sort: SortMode = get("sort") === "top" ? "top" : "recent";

  const limitRaw = Number(get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    window,
    categories,
    search,
    location,
    sponsorship,
    activeOnly,
    cursor: get("cursor") ?? null,
    limit,
    sort,
  };
}

// Build the shared WHERE clause (filters only, no cursor) + its bind params.
function buildWhere(q: ListingFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const cutoff = windowCutoff(q.window);
  if (cutoff) {
    params.push(cutoff);
    conditions.push(`"effectiveAt" >= $${params.length}`);
  }

  if (q.categories.length > 0) {
    params.push(q.categories);
    conditions.push(`category = ANY($${params.length}::"Category"[])`);
  }

  if (q.activeOnly) {
    conditions.push(`active = true`);
  }

  if (q.search) {
    params.push(`%${q.search}%`);
    // Substring match against company OR title.
    conditions.push(`(company ILIKE $${params.length} OR title ILIKE $${params.length})`);
  }

  if (q.location) {
    params.push(`%${q.location}%`);
    // Substring match against any element of the locations array.
    conditions.push(
      `EXISTS (SELECT 1 FROM unnest(locations) loc WHERE loc ILIKE $${params.length})`,
    );
  }

  if (q.sponsorship === "no") {
    conditions.push(`sponsorship ILIKE '%does not offer%'`);
  } else if (q.sponsorship === "sponsors") {
    conditions.push(
      `sponsorship ILIKE '%offers%' AND sponsorship NOT ILIKE '%does not%'`,
    );
  }

  // US-only (always on): keep roles with no location or at least one
  // non-foreign location; drop roles whose every location is recognizably
  // outside the US.
  params.push(NON_US_PATTERN);
  conditions.push(
    `(cardinality(locations) = 0 OR EXISTS (` +
      `SELECT 1 FROM unnest(locations) loc WHERE loc !~* $${params.length}))`,
  );

  // Internships only (always on): drop new-grad / entry-level / MBA / full-time
  // / PhD roles that slip past the per-source internship filter.
  conditions.push(
    `title !~* 'new\\s*grad|new graduate|university graduate|entry[ -]level|\\mmba\\M|full[ -]?time|\\mph\\.?d\\M'`,
  );

  // Grad-cycle eligibility (always on): keep a role if neither its title nor its
  // season names a year (cycle unknown → keep), OR the named year is one of the
  // summers you're eligible for. Drops only roles positively tagged a wrong
  // cycle (stale past years, or summers after you've graduated). Auto-adjusts
  // because the eligible years are computed from today + your grad date.
  const eligYears = eligibleSummerYears(new Date());
  params.push(eligYears);
  const yp = params.length;
  conditions.push(
    `((substring(title from '20[0-9]{2}') IS NULL ` +
      `AND substring(coalesce(season, '') from '20[0-9]{2}') IS NULL) ` +
      `OR substring(title from '20[0-9]{2}')::int = ANY($${yp}::int[]) ` +
      `OR substring(coalesce(season, '') from '20[0-9]{2}')::int = ANY($${yp}::int[]))`,
  );

  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

// Query a page of listings with a total count. Sort modes:
//   recent → newest first (effectiveAt desc)
//   top    → prestige tier asc, then newest first within a tier
export async function queryListings(q: ListingQuery): Promise<ListingPage> {
  const { clause, params } = buildWhere(q);
  const pageParams = [...params];

  // Prestige tier expression for "top" sort (1 = highest). Pushed here so the
  // SELECT, ORDER BY and cursor comparison all reference the same binds.
  let tierExpr = "";
  if (q.sort === "top") {
    pageParams.push(TIER1_PATTERN);
    const t1 = pageParams.length;
    pageParams.push(TIER2_PATTERN);
    const t2 = pageParams.length;
    tierExpr = `(CASE WHEN company ~* $${t1} THEN 1 WHEN company ~* $${t2} THEN 2 ELSE 3 END)`;
  }

  // Keyset cursor shaped to the active ordering.
  let cursorClause = "";
  const decoded = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.sort === "top" && decoded && decoded.length === 3) {
    const [tier, effectiveAt, id] = decoded;
    pageParams.push(tier);
    const pt = pageParams.length;
    pageParams.push(effectiveAt);
    const pe = pageParams.length;
    pageParams.push(id);
    const pi = pageParams.length;
    cursorClause =
      `${clause ? "AND" : "WHERE"} (${tierExpr} > $${pt}::int OR (${tierExpr} = $${pt}::int ` +
      `AND ("effectiveAt" < $${pe}::timestamptz OR ("effectiveAt" = $${pe}::timestamptz AND id < $${pi}))))`;
  } else if (q.sort !== "top" && decoded && decoded.length >= 2) {
    const [effectiveAt, id] = decoded;
    pageParams.push(effectiveAt);
    const a = pageParams.length;
    pageParams.push(id);
    const b = pageParams.length;
    cursorClause = `${clause ? "AND" : "WHERE"} ("effectiveAt" < $${a}::timestamptz OR ("effectiveAt" = $${a}::timestamptz AND id < $${b}))`;
  }

  pageParams.push(q.limit + 1); // fetch one extra to detect a next page
  const limitIdx = pageParams.length;

  const orderBy =
    q.sort === "top"
      ? `ORDER BY ${tierExpr} ASC, "effectiveAt" DESC, id DESC`
      : `ORDER BY "effectiveAt" DESC, id DESC`;
  const tierSelect = q.sort === "top" ? `, ${tierExpr} AS tier` : "";

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      source: string;
      company: string;
      title: string;
      category: Category;
      locations: string[];
      applyUrl: string;
      sponsorship: string | null;
      season: string | null;
      datePosted: Date | null;
      firstSeenAt: Date;
      effectiveAt: Date;
      active: boolean;
      tier?: number;
    }>
  >(
    `SELECT id, source, company, title, category, locations, "applyUrl", sponsorship,
            season, "datePosted", "firstSeenAt", "effectiveAt", active${tierSelect}
     FROM "Listing"
     ${clause} ${cursorClause}
     ${orderBy}
     LIMIT $${limitIdx}`,
    ...pageParams,
  );

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  const listings: ListingRow[] = page.map((r) => ({
    id: r.id,
    source: r.source,
    company: r.company,
    title: r.title,
    category: r.category,
    locations: r.locations,
    applyUrl: r.applyUrl,
    sponsorship: r.sponsorship,
    season: r.season,
    datePosted: r.datePosted ? r.datePosted.toISOString() : null,
    firstSeenAt: r.firstSeenAt.toISOString(),
    effectiveAt: r.effectiveAt.toISOString(),
    active: r.active,
  }));

  const last = page[page.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      q.sort === "top"
        ? encodeCursor(String(last.tier ?? 3), last.effectiveAt.toISOString(), last.id)
        : encodeCursor(last.effectiveAt.toISOString(), last.id);
  }

  // Total count for the current filters+window (drives the "X new roles" line).
  const countRows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "Listing" ${clause}`,
    ...params,
  );
  const count = Number(countRows[0]?.n ?? 0);

  return { listings, nextCursor, count };
}
