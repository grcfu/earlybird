import { notFound } from "next/navigation";
import { getStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-pop">
      <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-accent">
        {value.toLocaleString()}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-ink-soft">{sub}</div>}
    </div>
  );
}

// Private analytics dashboard. Gated by ?key=STATS_SECRET — 404s otherwise, so
// the route's existence isn't revealed.
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const keyRaw = params.key;
  const key = Array.isArray(keyRaw) ? keyRaw[0] : keyRaw;
  const secret = process.env.STATS_SECRET;
  if (!secret || key !== secret) notFound();

  const s = await getStats();
  const maxViews = Math.max(1, ...s.daily.map((d) => d.views));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          EarlyBird <span className="text-accent">stats</span>
        </h1>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">
          Private · page views logged with no IP or user-agent stored (salted
          daily hash only). Richer breakdowns live in the Vercel dashboard.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Views today" value={s.viewsToday} />
        <Tile label="Views · 7d" value={s.views7d} />
        <Tile label="Views · 30d" value={s.views30d} />
        <Tile label="Visitors today" value={s.visitorsToday} sub="unique" />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          Last 14 days
        </h2>
        {s.daily.length === 0 ? (
          <p className="font-mono text-xs text-ink-soft">
            No page views recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {s.daily.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <span className="w-20 shrink-0 font-mono text-[11px] text-ink-soft">
                  {d.day.slice(5)}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-mist">
                  <div
                    className="h-full rounded bg-accent"
                    style={{ width: `${Math.round((d.views / maxViews) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-soft">
                  {d.views} · {d.visitors}u
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 font-mono text-[10px] text-ink-faint">
          each row: views · unique visitors that day
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          Top pages · 7 days
        </h2>
        {s.topPages.length === 0 ? (
          <p className="font-mono text-xs text-ink-soft">No data yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {s.topPages.map((p) => (
              <div
                key={p.path}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-1.5"
              >
                <span className="truncate font-mono text-xs text-ink">{p.path}</span>
                <span className="font-mono text-xs tabular-nums text-ink-soft">
                  {p.views.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
