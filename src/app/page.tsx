import { parseListingQuery, queryListings } from "@/lib/listings";
import { Header } from "@/components/Header";
import { FilterBar } from "@/components/FilterBar";
import { Feed } from "@/components/Feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_LABEL: Record<string, string> = {
  "24h": "in the last 24 hours",
  "2d": "in the last 2 days",
  "7d": "in the last 7 days",
  all: "all time",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseListingQuery(params);
  const page = await queryListings(q);
  const serverNow = Date.now();

  // Canonical query string for the Feed's "load more" calls + remount key.
  const qs = new URLSearchParams();
  qs.set("window", q.window);
  if (q.categories.length) qs.set("categories", q.categories.join(","));
  if (q.location) qs.set("location", q.location);
  if (q.sponsorship !== "any") qs.set("sponsorship", q.sponsorship);
  if (!q.activeOnly) qs.set("activeOnly", "false");
  const queryString = qs.toString();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <Header
        count={page.count}
        windowLabel={WINDOW_LABEL[q.window]}
        fresh={q.window !== "all"}
      />

      <div className="sticky top-3 z-20 mt-8">
        <FilterBar />
      </div>

      <main className="mt-5">
        <Feed
          key={queryString}
          initial={page}
          query={queryString}
          serverNow={serverNow}
        />
      </main>

      <footer className="mt-16 border-t border-line pt-6 font-mono text-[11px] text-faint">
        EarlyBird aggregates community-maintained internship lists · data via
        vanshb03 + SimplifyJobs · newest first by posting time
      </footer>
    </div>
  );
}
