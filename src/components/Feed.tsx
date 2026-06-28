"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListingPage, ListingRow } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";
import { isApplied, STATUS_LABEL, type TrackStatus } from "@/lib/track";

// Per-browser application tracking (anonymous feed → localStorage, not the DB).
const STATUS_KEY = "earlybird:status"; // { [listingId]: TrackStatus }
const NOTES_KEY = "earlybird:notes"; // { [listingId]: string }
const APPLIED_KEY = "earlybird:applied"; // legacy Set<id>, migrated to STATUS_KEY
// Timestamp (ms) of the previous visit, so we can flag roles first seen since.
const LASTVISIT_KEY = "earlybird:lastVisit";

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

  // Application status per role, kept in localStorage. Starts empty so server +
  // first client render match; hydrated in the effect below.
  const [statuses, setStatuses] = useState<Record<string, TrackStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Client-side view filter over the loaded roles (status isn't known to the
  // server, so this can't live in the URL like the other filters).
  const [appliedFilter, setAppliedFilter] = useState<
    "all" | "unapplied" | "applied"
  >("all");

  // Previous-visit timestamp: read the stored value (for "new since last visit"
  // highlighting), then stamp now() so the next visit compares against this one.
  const [lastVisit, setLastVisit] = useState<number | null>(null);

  useEffect(() => {
    try {
      const rawStatus = localStorage.getItem(STATUS_KEY);
      if (rawStatus) {
        setStatuses(JSON.parse(rawStatus) as Record<string, TrackStatus>);
      } else {
        // One-time migration: legacy applied Set -> {id: "applied"}.
        const legacy = localStorage.getItem(APPLIED_KEY);
        if (legacy) {
          const map: Record<string, TrackStatus> = {};
          for (const id of JSON.parse(legacy) as string[]) map[id] = "applied";
          setStatuses(map);
          localStorage.setItem(STATUS_KEY, JSON.stringify(map));
        }
      }
      const rawNotes = localStorage.getItem(NOTES_KEY);
      if (rawNotes) setNotes(JSON.parse(rawNotes) as Record<string, string>);
      const lv = localStorage.getItem(LASTVISIT_KEY);
      setLastVisit(lv ? Number(lv) : null);
      localStorage.setItem(LASTVISIT_KEY, String(Date.now()));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // A role is "unseen" if it was first seen after your previous visit.
  const isUnseen = useCallback(
    (l: ListingRow) =>
      lastVisit != null && new Date(l.firstSeenAt).getTime() > lastVisit,
    [lastVisit],
  );

  const setStatus = useCallback((id: string, status: TrackStatus | "") => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (status) next[id] = status;
      else delete next[id];
      try {
        localStorage.setItem(STATUS_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, []);

  const setNote = useCallback((id: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[id] = text;
      else delete next[id];
      try {
        localStorage.setItem(NOTES_KEY, JSON.stringify(next));
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

  // Live refresh: poll the first page for this query and buffer roles we don't
  // already have, so a constant-checker sees brand-new postings without reloading.
  const [incoming, setIncoming] = useState<ListingRow[]>([]);
  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    idsRef.current = new Set([
      ...listings.map((l) => l.id),
      ...incoming.map((l) => l.id),
    ]);
  }, [listings, incoming]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/listings?${query}`);
        if (!res.ok) return;
        const page: ListingPage = await res.json();
        const fresh = page.listings.filter((l) => !idsRef.current.has(l.id));
        if (fresh.length) setIncoming((prev) => [...fresh, ...prev]);
      } catch {
        /* transient network error — try again next tick */
      }
    };
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [query]);

  // Reflect the pending count in the tab title so it's visible from another tab.
  useEffect(() => {
    document.title =
      incoming.length > 0
        ? `(${incoming.length}) new roles — EarlyBird`
        : "EarlyBird — fresh internships, first light";
  }, [incoming.length]);

  const showIncoming = useCallback(() => {
    setListings((prev) => [...incoming, ...prev]);
    setIncoming([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [incoming]);

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
    (n, l) => (isApplied(statuses[l.id]) ? n + 1 : n),
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
            ? isApplied(statuses[l.id])
            : !isApplied(statuses[l.id]),
        );

  const unseenCount = listings.reduce((n, l) => (isUnseen(l) ? n + 1 : n), 0);

  // Tracked roles currently loaded in the feed, exportable as CSV.
  const trackedRows = listings.filter((l) => statuses[l.id]);
  const exportCsv = () => {
    const header = [
      "company",
      "title",
      "status",
      "note",
      "locations",
      "applyUrl",
      "datePosted",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    for (const l of trackedRows) {
      lines.push(
        [
          l.company,
          l.title,
          STATUS_LABEL[statuses[l.id]],
          notes[l.id] ?? "",
          l.locations.join(" | "),
          l.applyUrl,
          l.datePosted ?? "",
        ]
          .map((v) => esc(String(v)))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "earlybird-applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Live: roles that appeared since you opened the page */}
      {incoming.length > 0 && (
        <div className="sticky top-3 z-30 mb-3 flex justify-center">
          <button
            onClick={showIncoming}
            className="pop rounded-full border border-accent bg-accent px-5 py-2 text-sm font-bold text-canvas shadow-pop-lg"
          >
            ↑ {incoming.length} new role{incoming.length === 1 ? "" : "s"} — show
          </button>
        </div>
      )}

      {/* New-since-last-visit banner */}
      {unseenCount > 0 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="pop mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          ✦ {unseenCount} new since your last visit
        </button>
      )}

      {/* Applied view filter + CSV export */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-mist p-1">
        {FILTERS.map((f) => {
          const active = appliedFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setAppliedFilter(f.key)}
              className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                active
                  ? "bg-accent text-canvas shadow-pop-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {f.label}
              <span className={active ? "text-canvas/75" : "text-ink-faint"}>
                {" "}
                {f.count}
              </span>
            </button>
          );
        })}
        </div>
        {trackedRows.length > 0 && (
          <button
            onClick={exportCsv}
            className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
          >
            ⬇ Export {trackedRows.length} tracked
          </button>
        )}
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
              ? "Set a role's status to Applied to track it here."
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
              status={statuses[l.id]}
              onSetStatus={(s) => setStatus(l.id, s)}
              note={notes[l.id]}
              onSetNote={(t) => setNote(l.id, t)}
              unseen={isUnseen(l)}
            />
          ))}
        </div>
      )}

      {/* Sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="py-8 text-center font-mono text-xs text-ink-soft">
        {loading && "loading more…"}
        {!loading && error && (
          <button onClick={loadMore} className="text-danger hover:text-accent">
            failed — retry ↻
          </button>
        )}
        {!loading && !error && !cursor && "— end of feed —"}
      </div>
    </div>
  );
}
