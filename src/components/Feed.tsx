"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListingPage, ListingRow } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";

// Where we remember which roles you've applied to. Anonymous feed → per-browser
// localStorage rather than a server record.
const APPLIED_KEY = "earlybird:applied";

export function Feed({
  initial,
  query,
  serverNow,
}: {
  initial: ListingPage;
  query: string;
  serverNow: number;
}) {
  const [listings, setListings] = useState<ListingRow[]>(initial.listings);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Single time reference shared by all rows; refreshed each minute on the client.
  const [now, setNow] = useState(serverNow);

  // Applied roles, kept in localStorage. Starts empty so server + first client
  // render match; the real set is hydrated in the effect below.
  const [applied, setApplied] = useState<Set<string>>(new Set());
  // Client-side view filter over the loaded roles (applied state isn't known to
  // the server, so this can't live in the URL like the other filters).
  const [appliedFilter, setAppliedFilter] = useState<
    "all" | "unapplied" | "applied"
  >("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APPLIED_KEY);
      if (raw) setApplied(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const toggleApplied = useCallback((id: string) => {
    setApplied((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(APPLIED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/listings?${query}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: ListingPage = await res.json();
      setListings((prev) => [...prev, ...page.listings]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor, query]);

  // Infinite scroll: observe a sentinel near the bottom of the feed.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  if (listings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-20 text-center">
        <p className="font-display text-2xl font-bold text-ink">
          No roles in this window.
        </p>
        <p className="mt-2 font-mono text-xs text-ink-soft">
          Try widening the recency window or clearing filters.
        </p>
      </div>
    );
  }

  const appliedCount = listings.reduce(
    (n, l) => (applied.has(l.id) ? n + 1 : n),
    0,
  );
  const FILTERS: { key: typeof appliedFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: listings.length },
    { key: "unapplied", label: "Unapplied", count: listings.length - appliedCount },
    { key: "applied", label: "Applied", count: appliedCount },
  ];

  const visible =
    appliedFilter === "all"
      ? listings
      : listings.filter((l) =>
          appliedFilter === "applied"
            ? applied.has(l.id)
            : !applied.has(l.id),
        );

  return (
    <div>
      {/* Applied view filter */}
      <div className="mb-3 inline-flex rounded-lg border border-line bg-mist p-1">
        {FILTERS.map((f) => {
          const active = appliedFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setAppliedFilter(f.key)}
              className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                active
                  ? "bg-blue text-white shadow-pop-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {f.label}
              <span className={active ? "text-white/75" : "text-ink-faint"}>
                {" "}
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-ink">
            {appliedFilter === "applied"
              ? "Nothing checked off yet."
              : "You've applied to everything here!"}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {appliedFilter === "applied"
              ? "Tick the ✓ on a role to track it here."
              : "Switch to All or load more roles."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((l, i) => (
            <ListingCard
              key={l.id}
              listing={l}
              now={now}
              index={i}
              applied={applied.has(l.id)}
              onToggleApplied={() => toggleApplied(l.id)}
            />
          ))}
        </div>
      )}

      {/* Sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="py-8 text-center font-mono text-xs text-ink-soft">
        {loading && "loading more…"}
        {!loading && error && (
          <button onClick={loadMore} className="text-danger hover:text-blue">
            failed — retry ↻
          </button>
        )}
        {!loading && !error && !cursor && "— end of feed —"}
      </div>
    </div>
  );
}
