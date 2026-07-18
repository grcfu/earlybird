import { prisma } from "@/lib/prisma";

// UTC day string "YYYY-MM-DD", `offset` days before today (0 = today).
function dayString(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export interface DailyStat {
  day: string;
  views: number;
  visitors: number;
}

export interface StatsData {
  viewsToday: number;
  views7d: number;
  views30d: number;
  visitorsToday: number;
  visitors7d: number; // note: daily-unique visitors summed over the window
  visitors30d: number;
  daily: DailyStat[]; // last 14 days, newest first
  topPages: { path: string; views: number }[]; // last 7 days
}

export async function getStats(): Promise<StatsData> {
  const today = dayString(0);
  const d7 = dayString(6);
  const d14 = dayString(13);
  const d30 = dayString(29);

  const [totals] = await prisma.$queryRawUnsafe<
    Array<{
      views_today: bigint;
      views_7d: bigint;
      views_30d: bigint;
      uniq_today: bigint;
      uniq_7d: bigint;
      uniq_30d: bigint;
    }>
  >(
    `SELECT
       count(*) FILTER (WHERE day = $1) AS views_today,
       count(*) FILTER (WHERE day >= $2) AS views_7d,
       count(*) FILTER (WHERE day >= $3) AS views_30d,
       count(DISTINCT "visitorDay") FILTER (WHERE day = $1) AS uniq_today,
       count(DISTINCT "visitorDay") FILTER (WHERE day >= $2) AS uniq_7d,
       count(DISTINCT "visitorDay") FILTER (WHERE day >= $3) AS uniq_30d
     FROM "PageView"`,
    today,
    d7,
    d30,
  );

  const daily = await prisma.$queryRawUnsafe<
    Array<{ day: string; views: bigint; visitors: bigint }>
  >(
    `SELECT day, count(*) AS views, count(DISTINCT "visitorDay") AS visitors
     FROM "PageView" WHERE day >= $1 GROUP BY day ORDER BY day DESC`,
    d14,
  );

  const topPages = await prisma.$queryRawUnsafe<
    Array<{ path: string; views: bigint }>
  >(
    `SELECT path, count(*) AS views FROM "PageView"
     WHERE day >= $1 GROUP BY path ORDER BY views DESC LIMIT 10`,
    d7,
  );

  const n = (v: bigint | undefined) => Number(v ?? 0);
  return {
    viewsToday: n(totals?.views_today),
    views7d: n(totals?.views_7d),
    views30d: n(totals?.views_30d),
    visitorsToday: n(totals?.uniq_today),
    visitors7d: n(totals?.uniq_7d),
    visitors30d: n(totals?.uniq_30d),
    daily: daily.map((r) => ({
      day: r.day,
      views: Number(r.views),
      visitors: Number(r.visitors),
    })),
    topPages: topPages.map((r) => ({ path: r.path, views: Number(r.views) })),
  };
}
