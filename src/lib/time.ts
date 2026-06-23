// Client-safe time helpers for the feed's relative-time badges.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// "just now" / "12m ago" / "3h ago" / "2d ago" / "5w ago" / "4mo ago".
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Freshest tier — surfaced with the coral "🔥 new" treatment.
export function isFresh24h(iso: string, now: number = Date.now()): boolean {
  return now - new Date(iso).getTime() < DAY;
}
