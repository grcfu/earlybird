import Link from "next/link";
import { parseHackathonQuery, queryHackathons } from "@/lib/hackathons";
import { HackathonHeader } from "@/components/HackathonHeader";
import { HackathonCard } from "@/components/HackathonCard";
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
  // Server Component: a request-time clock is correct here (see page.tsx note).
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();

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
        {page.hackathons.map((h, i) => (
          <HackathonCard key={h.id} hackathon={h} now={serverNow} index={i} />
        ))}
      </main>
    </div>
  );
}
