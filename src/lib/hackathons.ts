import { prisma } from "@/lib/prisma";
import { HackathonFormat } from "@/generated/prisma/client";
import { NON_US_PATTERN } from "@/lib/listings";

// Which format bucket the UI is filtering to. "online" includes hybrids (you can
// attend remotely); "inperson" includes hybrids too (you can attend on-site).
export type FormatFilter = "all" | "online" | "inperson";
// Upcoming horizon by start date.
export type WhenFilter = "all" | "week" | "month" | "3mo";
// soon = soonest start; new = recently added; prize = biggest crowd/prize first.
export type HackathonSort = "soon" | "new" | "prize";

export interface HackathonFilters {
  format: FormatFilter;
  when: WhenFilter;
  search: string | null;
  location: string | null;
  activeOnly: boolean;
}

export interface HackathonQuery extends HackathonFilters {
  cursor: string | null;
  limit: number;
  sort: HackathonSort;
}

// Serializable row shape sent to the client (dates as ISO strings).
export interface HackathonRow {
  id: string;
  source: string;
  name: string;
  url: string;
  format: HackathonFormat;
  locationLabel: string;
  country: string | null;
  startsAt: string | null;
  endsAt: string | null;
  dateLabel: string | null;
  prize: string | null;
  themes: string[];
  participants: number | null;
  imageUrl: string | null;
  firstSeenAt: string;
  active: boolean;
}

export interface HackathonPage {
  hackathons: HackathonRow[];
  nextCursor: string | null;
  count: number;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
// Ordering sentinel for events with an unknown start date — sorts them last
// under the soonest-first ordering rather than dropping them.
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

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

const WHEN_DAYS: Record<Exclude<WhenFilter, "all">, number> = {
  week: 7,
  month: 30,
  "3mo": 90,
};

export function parseHackathonQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): HackathonQuery {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const formatRaw = get("format");
  const format: FormatFilter =
    formatRaw === "online" || formatRaw === "inperson" ? formatRaw : "all";

  const whenRaw = get("when");
  const when: WhenFilter =
    whenRaw === "week" || whenRaw === "month" || whenRaw === "3mo"
      ? whenRaw
      : "all";

  const sortRaw = get("sort");
  const sort: HackathonSort =
    sortRaw === "new" || sortRaw === "prize" ? sortRaw : "soon";

  const search = (get("q") ?? "").trim() || null;
  const location = (get("location") ?? "").trim() || null;
  const activeOnly = get("activeOnly") !== "false";

  const limitRaw = Number(get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    format,
    when,
    search,
    location,
    activeOnly,
    cursor: get("cursor") ?? null,
    limit,
    sort,
  };
}

// Build the shared WHERE clause (filters only, no cursor) + its bind params.
function buildWhere(q: HackathonFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const now = new Date();

  if (q.activeOnly) conditions.push(`active = true`);

  // Not-yet-started only (always on): you're here to apply, so hide events
  // that are already underway (or over). Keep events whose start is in the
  // future; for events with an unknown start date, keep them only while they
  // haven't already ended. now is bound once and reused by both checks.
  params.push(now);
  const nowIdx = params.length;
  conditions.push(
    `(("startsAt" IS NULL OR "startsAt" >= $${nowIdx}) ` +
      `AND ("endsAt" IS NULL OR "endsAt" >= $${nowIdx}))`,
  );

  // Format bucket. Hybrids satisfy both online and in-person.
  if (q.format === "online") {
    conditions.push(`format = ANY(ARRAY['ONLINE','HYBRID']::"HackathonFormat"[])`);
  } else if (q.format === "inperson") {
    conditions.push(`format = ANY(ARRAY['IN_PERSON','HYBRID']::"HackathonFormat"[])`);
  }

  // "When" horizon by start date. Events with no start date are kept (unknown
  // timing shouldn't hide an otherwise-eligible event).
  if (q.when !== "all") {
    const cutoff = new Date(now.getTime() + WHEN_DAYS[q.when] * 86_400_000);
    params.push(cutoff);
    conditions.push(`("startsAt" IS NULL OR "startsAt" <= $${params.length})`);
  }

  if (q.search) {
    params.push(`%${q.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  if (q.location) {
    params.push(`%${q.location}%`);
    conditions.push(`"locationLabel" ILIKE $${params.length}`);
  }

  // US-only (always on): online/hybrid events are location-free, so always kept.
  // In-person events are kept only when their location label doesn't look
  // recognizably non-US (same rule as the internships feed).
  params.push(NON_US_PATTERN);
  conditions.push(
    `(format = 'ONLINE' OR format = 'HYBRID' OR "locationLabel" = '' ` +
      `OR "locationLabel" !~* $${params.length})`,
  );

  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

// The ORDER BY + the SQL key expression each sort paginates on.
function ordering(sort: HackathonSort): { orderBy: string; keyExpr: string } {
  switch (sort) {
    case "new":
      return {
        orderBy: `ORDER BY "firstSeenAt" DESC, id DESC`,
        keyExpr: `"firstSeenAt"`,
      };
    case "prize":
      return {
        orderBy: `ORDER BY COALESCE(participants, 0) DESC, id DESC`,
        keyExpr: `COALESCE(participants, 0)`,
      };
    case "soon":
    default:
      return {
        orderBy: `ORDER BY COALESCE("startsAt", $FAR) ASC, id DESC`,
        keyExpr: `COALESCE("startsAt", $FAR)`,
      };
  }
}

export async function queryHackathons(q: HackathonQuery): Promise<HackathonPage> {
  const { clause, params } = buildWhere(q);
  const pageParams = [...params];

  // The soonest-first sort needs the far-future sentinel bound; wire it in and
  // substitute the $FAR placeholder with its positional index.
  let { orderBy, keyExpr } = ordering(q.sort);
  if (q.sort === "soon") {
    pageParams.push(FAR_FUTURE);
    const farIdx = `$${pageParams.length}`;
    orderBy = orderBy.replace("$FAR", `${farIdx}::timestamptz`);
    keyExpr = keyExpr.replace("$FAR", `${farIdx}::timestamptz`);
  }

  // Keyset cursor shaped to the active ordering. soon ascends; new/prize descend.
  let cursorClause = "";
  const decoded = q.cursor ? decodeCursor(q.cursor) : null;
  if (decoded && decoded.length >= 2) {
    const [key, id] = decoded;
    if (q.sort === "soon") {
      pageParams.push(key);
      const k = pageParams.length;
      pageParams.push(id);
      const i = pageParams.length;
      cursorClause =
        `${clause ? "AND" : "WHERE"} (${keyExpr} > $${k}::timestamptz ` +
        `OR (${keyExpr} = $${k}::timestamptz AND id < $${i}))`;
    } else if (q.sort === "prize") {
      pageParams.push(key);
      const k = pageParams.length;
      pageParams.push(id);
      const i = pageParams.length;
      cursorClause =
        `${clause ? "AND" : "WHERE"} (${keyExpr} < $${k}::int ` +
        `OR (${keyExpr} = $${k}::int AND id < $${i}))`;
    } else {
      pageParams.push(key);
      const k = pageParams.length;
      pageParams.push(id);
      const i = pageParams.length;
      cursorClause =
        `${clause ? "AND" : "WHERE"} (${keyExpr} < $${k}::timestamptz ` +
        `OR (${keyExpr} = $${k}::timestamptz AND id < $${i}))`;
    }
  }

  pageParams.push(q.limit + 1);
  const limitIdx = pageParams.length;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      source: string;
      name: string;
      url: string;
      format: HackathonFormat;
      locationLabel: string;
      country: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      dateLabel: string | null;
      prize: string | null;
      themes: string[];
      participants: number | null;
      imageUrl: string | null;
      firstSeenAt: Date;
      active: boolean;
    }>
  >(
    `SELECT id, source, name, url, format, "locationLabel", country, "startsAt",
            "endsAt", "dateLabel", prize, themes, participants, "imageUrl",
            "firstSeenAt", active
     FROM "Hackathon"
     ${clause} ${cursorClause}
     ${orderBy}
     LIMIT $${limitIdx}`,
    ...pageParams,
  );

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  const hackathons: HackathonRow[] = page.map((r) => ({
    id: r.id,
    source: r.source,
    name: r.name,
    url: r.url,
    format: r.format,
    locationLabel: r.locationLabel,
    country: r.country,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    dateLabel: r.dateLabel,
    prize: r.prize,
    themes: r.themes,
    participants: r.participants,
    imageUrl: r.imageUrl,
    firstSeenAt: r.firstSeenAt.toISOString(),
    active: r.active,
  }));

  const last = page[page.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    if (q.sort === "new") {
      nextCursor = encodeCursor(last.firstSeenAt.toISOString(), last.id);
    } else if (q.sort === "prize") {
      nextCursor = encodeCursor(String(last.participants ?? 0), last.id);
    } else {
      nextCursor = encodeCursor(
        (last.startsAt ?? new Date(FAR_FUTURE)).toISOString(),
        last.id,
      );
    }
  }

  const countRows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "Hackathon" ${clause}`,
    ...params,
  );
  const count = Number(countRows[0]?.n ?? 0);

  return { hackathons, nextCursor, count };
}
