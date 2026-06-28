import type { ListingRow } from "@/lib/listings";
import { categoryMeta } from "@/lib/categories";
import { relativeTime, isFresh24h } from "@/lib/time";

export function ListingCard({
  listing,
  now,
  index,
  applied = false,
  onToggleApplied,
}: {
  listing: ListingRow;
  now: number;
  index: number;
  applied?: boolean;
  onToggleApplied?: () => void;
}) {
  const cat = categoryMeta(listing.category);
  const fresh = isFresh24h(listing.effectiveAt, now);
  const locations = listing.locations.length
    ? listing.locations.slice(0, 3).join("  ·  ") +
      (listing.locations.length > 3 ? `  +${listing.locations.length - 3}` : "")
    : "Location N/A";

  return (
    <article
      data-applied={applied}
      className={`group animate-rise pop relative flex items-stretch gap-4 overflow-hidden rounded-xl border border-line border-l-4 bg-surface py-4 pl-4 pr-4 shadow-pop transition-all sm:gap-5 ${
        applied ? "opacity-55 saturate-[0.5]" : ""
      }`}
      style={{ borderLeftColor: fresh ? "var(--color-accent-bright)" : cat.color }}
    >
      <div className="min-w-0 flex-1 py-0.5">
        {/* Top line: company · category · fresh flag */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="truncate text-[15px] font-bold text-ink">
            {listing.company}
          </span>
          <span
            className="rounded-md border border-line px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider"
            style={{
              color: cat.color,
              background:
                "color-mix(in oklab, " + cat.color + " 18%, var(--color-surface))",
            }}
          >
            {cat.label}
          </span>
          {fresh && (
            <span className="rounded-md bg-accent-soft px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-accent-ink">
              new
            </span>
          )}
          {applied && (
            <span className="rounded-md bg-leaf-soft px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-leaf">
              ✓ applied
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-1.5 truncate font-display text-lg font-bold leading-snug text-ink">
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

      {/* Right: applied checkbox · time · apply */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <time
            className="font-mono text-[11px] tabular-nums text-ink-soft"
            dateTime={listing.effectiveAt}
            title={new Date(listing.effectiveAt).toLocaleString()}
          >
            {relativeTime(listing.effectiveAt, now)}
          </time>
          <button
            type="button"
            onClick={onToggleApplied}
            aria-pressed={applied}
            title={applied ? "Mark as not applied" : "Mark as applied"}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm font-bold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${
              applied
                ? "border-leaf bg-leaf text-canvas"
                : "border-line bg-canvas text-transparent hover:border-leaf hover:bg-leaf-soft"
            }`}
          >
            ✓
          </button>
        </div>
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pop rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Apply ↗
        </a>
      </div>
    </article>
  );
}
