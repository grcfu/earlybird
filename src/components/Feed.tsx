"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListingPage, ListingRow } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";

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
      <div className="border-2 border-dashed border-ink bg-card/70 px-6 py-20 text-center">
        <p className="text-4xl" aria-hidden>
          🌱
        </p>
        <p className="mt-3 font-display text-2xl text-ink">
          No roles in this window.
        </p>
        <p className="mt-2 font-mono text-xs text-ink-soft">
          Try widening the recency window or clearing filters.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        {listings.map((l, i) => (
          <ListingCard key={l.id} listing={l} now={now} index={i} />
        ))}
      </div>

      {/* Sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="py-8 text-center font-mono text-xs font-bold text-ink-soft">
        {loading && "loading more… 🐛"}
        {!loading && error && (
          <button onClick={loadMore} className="text-berry hover:text-pink-pop">
            failed — retry ↻
          </button>
        )}
        {!loading && !error && !cursor && "— end of feed 🌷 —"}
      </div>
    </div>
  );
}
