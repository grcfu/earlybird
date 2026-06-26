import type { ListingRow } from "@/lib/listings";
import { categoryMeta } from "@/lib/categories";
import { relativeTime, isFresh24h } from "@/lib/time";

export function ListingCard({
  listing,
  now,
  index,
}: {
  listing: ListingRow;
  now: number;
  index: number;
}) {
  const cat = categoryMeta(listing.category);
  const fresh = isFresh24h(listing.effectiveAt, now);
  const locations = listing.locations.length
    ? listing.locations.slice(0, 3).join("  ·  ") +
      (listing.locations.length > 3 ? `  +${listing.locations.length - 3}` : "")
    : "Location N/A";

  return (
    <article
      className="group animate-rise pop relative flex items-stretch gap-4 border-2 border-ink bg-card py-4 pl-0 pr-4 shadow-pop sm:gap-5"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      {/* Freshness rail — pink when <24h, otherwise the category hue. */}
      <div
        className="w-2 shrink-0 self-stretch border-r-2 border-ink"
        style={{ background: fresh ? "var(--color-pink-pop)" : cat.color }}
        aria-hidden
      />

      <div className="min-w-0 flex-1 py-0.5">
        {/* Top line: company · category · fresh flag */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="truncate text-[15px] font-bold text-ink">
            {listing.company}
          </span>
          <span
            className="border border-ink px-2 py-[1px] font-mono text-[10px] font-bold uppercase tracking-wider text-ink"
            style={{
              background: "color-mix(in oklab, " + cat.color + " 38%, white)",
            }}
          >
            {cat.label}
          </span>
          {fresh && (
            <span className="border border-ink bg-blush px-2 py-[1px] font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
              🌸 new
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-1.5 truncate font-display text-xl leading-snug text-ink">
          {listing.title}
        </h3>

        {/* Meta line */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-soft">
          <span className="truncate">{locations}</span>
          {listing.sponsorship && (
            <span className="text-ink-faint" title="Sponsorship">
              {listing.sponsorship}
            </span>
          )}
          <span className="text-ink-faint">via {listing.source}</span>
        </div>
      </div>

      {/* Right: time + apply */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <time
          className="font-mono text-[11px] font-bold tabular-nums text-pesto-deep"
          dateTime={listing.effectiveAt}
          title={new Date(listing.effectiveAt).toLocaleString()}
        >
          {relativeTime(listing.effectiveAt, now)}
        </time>
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pop border-2 border-ink bg-pesto px-4 py-1.5 text-sm font-bold text-white shadow-pop-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-pop"
        >
          Apply ↗
        </a>
      </div>
    </article>
  );
}
