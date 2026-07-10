import type { ListingRow } from "@/lib/listings";
import { categoryMeta } from "@/lib/categories";
import { relativeTime, isFresh24h } from "@/lib/time";
import { listingCycle } from "@/lib/eligibility";
import {
  STATUS_LABEL,
  STATUS_CLASS,
  TRACK_STATUSES,
  isApplied,
  type TrackStatus,
} from "@/lib/track";

// Sources pulled straight from a company's own ATS (vs. lagging aggregators).
// The merged source label can be e.g. "greenhouse+Simplify", so we substring-match.
const DIRECT_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "amazon",
  "uber",
  "jpmorgan",
];
function isDirect(source: string): boolean {
  const s = source.toLowerCase();
  return DIRECT_SOURCES.some((d) => s.includes(d));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Format a YYYY-MM-DD applied date as "Jul 1" (no timezone parsing surprises).
function fmtApplied(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return m && day ? `${MONTHS[m - 1]} ${day}` : d;
}

export function ListingCard({
  listing,
  now,
  index,
  status,
  onSetStatus,
  note,
  onSetNote,
  appliedAt,
  unseen = false,
}: {
  listing: ListingRow;
  now: number;
  index: number;
  status?: TrackStatus;
  onSetStatus?: (s: TrackStatus | "") => void;
  note?: string;
  onSetNote?: (t: string) => void;
  appliedAt?: string; // YYYY-MM-DD, day the role was first marked applied
  unseen?: boolean;
}) {
  const cat = categoryMeta(listing.category);
  const fresh = isFresh24h(listing.effectiveAt, now);
  const applied = isApplied(status);
  const cycle = listingCycle(listing.season, listing.title, listing.effectiveAt);
  const locations = listing.locations.length
    ? listing.locations.slice(0, 3).join("  ·  ") +
      (listing.locations.length > 3 ? `  +${listing.locations.length - 3}` : "")
    : "Location N/A";

  return (
    <article
      data-status={status ?? "none"}
      className={`group animate-rise pop relative flex items-center gap-3 overflow-hidden rounded-xl border border-line border-l-4 bg-surface px-3.5 py-2.5 shadow-pop transition-all ${
        status === "rejected" || status === "not_interested"
          ? "opacity-50 saturate-[0.4]"
          : ""
      } ${unseen && !applied ? "ring-1 ring-accent/50" : ""}`}
      style={{
        borderLeftColor: fresh ? "var(--color-accent-bright)" : cat.color,
        animationDelay: `${Math.min(index, 12) * 35}ms`,
      }}
    >
      <div className="min-w-0 flex-1">
        {/* Top line: company · badges */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="truncate text-[15px] font-bold text-ink">
            {listing.company}
          </span>
          {isDirect(listing.source) && (
            <span
              className="rounded-md bg-leaf-soft px-2 py-[1px] font-mono text-[10px] font-medium uppercase tracking-wider text-leaf"
              title="Pulled directly from the company's careers site — fresher than aggregators"
            >
              ⚡ direct
            </span>
          )}
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
          {cycle && (
            <span
              className="rounded-md border border-line px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-ink-soft"
              title={
                cycle.estimated
                  ? "Estimated from the posting date — title/season didn't state a year"
                  : "From the role's stated season/title"
              }
            >
              {cycle.estimated ? "~" : ""}Summer {cycle.year}
            </span>
          )}
          {status && (
            <span
              className={`rounded-md px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider ${STATUS_CLASS[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
          )}
          {appliedAt && isApplied(status) && (
            <span className="font-mono text-[10px] text-ink-faint">
              applied {fmtApplied(appliedAt)}
            </span>
          )}
          {unseen && !applied && (
            <span className="rounded-md bg-accent px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-canvas">
              ✦ unseen
            </span>
          )}
          {fresh && !unseen && (
            <span className="rounded-md bg-accent-soft px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-accent-ink">
              new
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-1 truncate font-display text-base font-bold leading-snug text-ink">
          {listing.title}
        </h3>

        {/* Meta line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-soft">
          <span className="truncate">{locations}</span>
          <span className="text-ink-faint">via {listing.source}</span>
        </div>

        {/* Notes — shown once you're tracking the role */}
        {status && (
          <input
            value={note ?? ""}
            onChange={(e) => onSetNote?.(e.target.value)}
            placeholder="Add a note…"
            className="mt-2 w-full max-w-sm rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        )}
      </div>

      {/* Right: time · tracker · dismiss · apply — single compact row */}
      <div className="flex shrink-0 items-center gap-2">
        <time
          className="hidden font-mono text-[11px] tabular-nums text-ink-soft sm:inline"
          dateTime={listing.effectiveAt}
          title={new Date(listing.effectiveAt).toLocaleString()}
        >
          {relativeTime(listing.effectiveAt, now)}
        </time>
        <select
          value={status ?? ""}
          onChange={(e) => onSetStatus?.(e.target.value as TrackStatus | "")}
          title="Track your application status"
          className="rounded-md border border-line bg-canvas px-1.5 py-1 font-mono text-[11px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">＋ track</option>
          {TRACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            onSetStatus?.(status === "not_interested" ? "" : "not_interested")
          }
          title={
            status === "not_interested"
              ? "Undo — restore this role"
              : "Not interested — dismiss"
          }
          aria-label={
            status === "not_interested" ? "Restore role" : "Dismiss role"
          }
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger ${
            status === "not_interested"
              ? "border-ink-faint bg-mist text-ink-soft"
              : "border-line bg-canvas text-ink-faint hover:border-danger hover:text-danger"
          }`}
        >
          {status === "not_interested" ? "↩" : "✕"}
        </button>
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pop rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Apply ↗
        </a>
      </div>
    </article>
  );
}
