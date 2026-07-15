import Link from "next/link";
import { parseHackathonQuery, queryHackathons } from "@/lib/hackathons";
import { HackathonHeader } from "@/components/HackathonHeader";
import { TabNav } from "@/components/TabNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHEN_LABEL: Record<string, string> = {
  all: "",
  week: "in the next week",
  month: "in the next month",
  "3mo": "in the next 3 months",
};

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseHackathonQuery(params);
  const page = await queryHackathons(q);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <div className="relative z-10 mb-6 flex items-center justify-between gap-2">
        <TabNav />
        <Link
          href="/settings"
          className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-accent-deep shadow-pop-sm hover:border-accent-bright"
        >
          ⚙ manage alerts
        </Link>
      </div>

      <HackathonHeader count={page.count} whenLabel={WHEN_LABEL[q.when]} />

      <main className="mt-8 flex flex-col gap-2">
        {page.hackathons.map((h) => (
          <a
            key={h.id}
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pop flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop"
          >
            <div className="min-w-0">
              <div className="truncate font-display text-base font-bold text-ink">
                {h.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-soft">
                {h.dateLabel ?? "date TBA"} · {h.locationLabel || "Location TBA"}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-accent-deep">
              details ↗
            </span>
          </a>
        ))}
      </main>
    </div>
  );
}
