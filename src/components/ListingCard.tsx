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
      className="group animate-rise relative flex items-stretch gap-4 overflow-hidden rounded-xl border border-line bg-surface/70 pl-0 pr-4 py-4 backdrop-blur-sm transition-all duration-200 hover:border-amber/40 hover:bg-surface-2/80 sm:gap-5"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      {/* Freshness rail — coral when <24h, otherwise a dim category tint. */}
      <div
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{
          background: fresh ? "var(--color-coral)" : cat.color,
          opacity: fresh ? 1 : 0.45,
          boxShadow: fresh
            ? "0 0 12px color-mix(in oklab, var(--color-coral) 60%, transparent)"
            : "none",
        }}
        aria-hidden
      />

      <div className="min-w-0 flex-1 py-0.5">
        {/* Top line: company · category · fresh flag */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="truncate font-medium text-cream">
            {listing.company}
          </span>
          <span
            className="rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-wider"
            style={{
              color: cat.color,
              background: "color-mix(in oklab, currentColor 14%, transparent)",
            }}
          >
            {cat.label}
          </span>
          {fresh && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-coral">
              🔥 new
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-1 truncate text-[17px] leading-snug text-cream/95">
          {listing.title}
        </h3>

        {/* Meta line */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fog">
          <span className="truncate">{locations}</span>
          {listing.sponsorship && (
            <span className="text-faint" title="Sponsorship">
              {listing.sponsorship}
            </span>
          )}
          <span className="text-faint">via {listing.source}</span>
        </div>
      </div>

      {/* Right: time + apply */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <time
          className="font-mono text-[11px] tabular-nums text-fog"
          dateTime={listing.effectiveAt}
          title={new Date(listing.effectiveAt).toLocaleString()}
        >
          {relativeTime(listing.effectiveAt, now)}
        </time>
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-amber px-4 py-1.5 text-sm font-semibold text-ink transition-all duration-150 hover:bg-amber-2 hover:shadow-[0_0_20px_color-mix(in_oklab,var(--color-amber)_40%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
        >
          Apply ↗
        </a>
      </div>
    </article>
  );
}
