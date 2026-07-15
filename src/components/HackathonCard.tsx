import type { HackathonRow } from "@/lib/hackathons";
import {
  HACK_STATUS_LABEL,
  HACK_STATUS_CLASS,
  HACK_TRACK_STATUSES,
  isRegistered,
  type HackTrackStatus,
} from "@/lib/hackathon-track";

// Format → pill styling + label.
const FORMAT_META: Record<
  HackathonRow["format"],
  { label: string; cls: string }
> = {
  ONLINE: { label: "🌐 Online", cls: "bg-leaf-soft text-leaf" },
  IN_PERSON: { label: "📍 In-person", cls: "bg-accent-soft text-accent-ink" },
  HYBRID: { label: "🔀 Hybrid", cls: "bg-mist text-ink-soft" },
};

const DAY = 86_400_000;

// "starts today" / "in 3 days" / "in 2 weeks" / "started" — a friendly countdown.
function countdown(startsAtIso: string | null, now: number): string | null {
  if (!startsAtIso) return null;
  const diff = new Date(startsAtIso).getTime() - now;
  if (diff < -DAY) return "happening now";
  const days = Math.round(diff / DAY);
  if (days <= 0) return "starts today";
  if (days === 1) return "starts tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

export function HackathonCard({
  hackathon,
  now,
  index,
  status,
  onSetStatus,
  note,
  onSetNote,
  unseen = false,
}: {
  hackathon: HackathonRow;
  now: number;
  index: number;
  status?: HackTrackStatus;
  onSetStatus?: (s: HackTrackStatus | "") => void;
  note?: string;
  onSetNote?: (t: string) => void;
  unseen?: boolean;
}) {
  const fmt = FORMAT_META[hackathon.format];
  const soon = countdown(hackathon.startsAt, now);
  const fresh = now - new Date(hackathon.firstSeenAt).getTime() < DAY;
  const registered = isRegistered(status);
  const themes = hackathon.themes.slice(0, 2);

  return (
    <article
      data-status={status ?? "none"}
      className={`group animate-rise pop relative flex items-center gap-3 overflow-hidden rounded-xl border border-line border-l-4 bg-surface px-3.5 py-2.5 shadow-pop transition-all ${
        status === "not_interested" ? "opacity-50 saturate-[0.4]" : ""
      } ${unseen && !registered ? "ring-1 ring-accent/50" : ""}`}
      style={{
        borderLeftColor:
          hackathon.format === "ONLINE"
            ? "var(--color-leaf)"
            : "var(--color-accent)",
        animationDelay: `${Math.min(index, 12) * 35}ms`,
      }}
    >
      {hackathon.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hackathon.imageUrl}
          alt=""
          className="hidden h-12 w-12 shrink-0 rounded-lg object-cover sm:block"
          loading="lazy"
        />
      )}

      <div className="min-w-0 flex-1">
        {/* Top line: badges */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={`rounded-md px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider ${fmt.cls}`}
          >
            {fmt.label}
          </span>
          {themes.map((t) => (
            <span
              key={t}
              className="rounded-md border border-line px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider text-ink-soft"
            >
              {t}
            </span>
          ))}
          {status && (
            <span
              className={`rounded-md px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider ${HACK_STATUS_CLASS[status]}`}
            >
              {HACK_STATUS_LABEL[status]}
            </span>
          )}
          {unseen && !registered && (
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

        {/* Name */}
        <h3 className="mt-1 truncate font-display text-base font-bold leading-snug text-ink">
          {hackathon.name}
        </h3>

        {/* Meta line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-soft">
          <span className="truncate">
            {hackathon.dateLabel ?? "date TBA"}
          </span>
          <span className="truncate">
            {hackathon.locationLabel || "Location TBA"}
          </span>
          {hackathon.prize && (
            <span className="text-leaf">🏆 {hackathon.prize}</span>
          )}
          {typeof hackathon.participants === "number" &&
            hackathon.participants > 0 && (
              <span className="text-ink-faint">
                {hackathon.participants.toLocaleString()} joined
              </span>
            )}
          <span className="text-ink-faint">via {hackathon.source}</span>
        </div>

        {/* Notes — shown once you're tracking it */}
        {status && (
          <input
            value={note ?? ""}
            onChange={(e) => onSetNote?.(e.target.value)}
            placeholder="Add a note…"
            className="mt-2 w-full max-w-sm rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        )}
      </div>

      {/* Right: countdown · tracker · dismiss · register */}
      <div className="flex shrink-0 items-center gap-2">
        {soon && (
          <span className="hidden font-mono text-[11px] tabular-nums text-accent-ink sm:inline">
            {soon}
          </span>
        )}
        {onSetStatus && (
          <select
            value={status ?? ""}
            onChange={(e) =>
              onSetStatus(e.target.value as HackTrackStatus | "")
            }
            title="Track this hackathon"
            className="rounded-md border border-line bg-canvas px-1.5 py-1 font-mono text-[11px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">＋ track</option>
            {HACK_TRACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {HACK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        {onSetStatus && (
          <button
            type="button"
            onClick={() =>
              onSetStatus(status === "not_interested" ? "" : "not_interested")
            }
            title={
              status === "not_interested"
                ? "Undo — restore this hackathon"
                : "Not interested — dismiss"
            }
            aria-label={
              status === "not_interested" ? "Restore" : "Dismiss"
            }
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger ${
              status === "not_interested"
                ? "border-ink-faint bg-mist text-ink-soft"
                : "border-line bg-canvas text-ink-faint hover:border-danger hover:text-danger"
            }`}
          >
            {status === "not_interested" ? "↩" : "✕"}
          </button>
        )}
        <a
          href={hackathon.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pop rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Register ↗
        </a>
      </div>
    </article>
  );
}
