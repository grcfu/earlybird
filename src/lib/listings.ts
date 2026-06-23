import { prisma } from "@/lib/prisma";
import { Category } from "@/generated/prisma/client";
import {
  DEFAULT_WINDOW,
  isRecencyWindow,
  windowCutoff,
  type RecencyWindow,
} from "@/lib/recency";

export type SponsorshipFilter = "any" | "sponsors" | "no";

export interface ListingFilters {
  window: RecencyWindow;
  categories: Category[]; // empty = all categories
  location: string | null; // substring match across locations[]
  sponsorship: SponsorshipFilter;
  activeOnly: boolean;
}

export interface ListingQuery extends ListingFilters {
  cursor: string | null;
  limit: number;
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

// Keyset cursor = effectiveAt + id, so pagination is stable under inserts.
function encodeCursor(effectiveAt: string, id: string): string {
  return Buffer.from(`${effectiveAt}|${id}`, "utf8").toString("base64url");
}
function decodeCursor(cursor: string): { effectiveAt: string; id: string } | null {
  try {
    const [effectiveAt, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("|");
    if (!effectiveAt || !id) return null;
    return { effectiveAt, id };
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

  const location = (get("location") ?? "").trim() || null;
  const activeOnly = get("activeOnly") !== "false"; // default true

  const limitRaw = Number(get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    window,
    categories,
    location,
    sponsorship,
    activeOnly,
    cursor: get("cursor") ?? null,
    limit,
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

  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

// Query a page of listings, newest-first by effectiveAt, with a total count.
export async function queryListings(q: ListingQuery): Promise<ListingPage> {
  const { clause, params } = buildWhere(q);

  // Page query: layer the keyset cursor on top of the shared filters.
  const pageParams = [...params];
  let cursorClause = "";
  const decoded = q.cursor ? decodeCursor(q.cursor) : null;
  if (decoded) {
    pageParams.push(decoded.effectiveAt, decoded.id);
    const a = pageParams.length - 1;
    const b = pageParams.length;
    cursorClause = `${clause ? "AND" : "WHERE"} ("effectiveAt" < $${a}::timestamptz OR ("effectiveAt" = $${a}::timestamptz AND id < $${b}))`;
  }
  pageParams.push(q.limit + 1); // fetch one extra to detect a next page

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
    }>
  >(
    `SELECT id, source, company, title, category, locations, "applyUrl", sponsorship,
            season, "datePosted", "firstSeenAt", "effectiveAt", active
     FROM "Listing"
     ${clause} ${cursorClause}
     ORDER BY "effectiveAt" DESC, id DESC
     LIMIT $${pageParams.length}`,
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
  const nextCursor =
    hasMore && last ? encodeCursor(last.effectiveAt.toISOString(), last.id) : null;

  // Total count for the current filters+window (drives the "X new roles" line).
  const countRows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "Listing" ${clause}`,
    ...params,
  );
  const count = Number(countRows[0]?.n ?? 0);

  return { listings, nextCursor, count };
}
