"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

const FORMATS = [
  { key: "all", label: "All" },
  { key: "online", label: "🌐 Online" },
  { key: "inperson", label: "📍 In-person" },
];
const WHENS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "3mo", label: "3 months" },
];
const SORTS = [
  { key: "soon", label: "Soonest" },
  { key: "new", label: "Newest" },
  { key: "prize", label: "Biggest" },
];

export function HackathonFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const format = searchParams.get("format") ?? "all";
  const when = searchParams.get("when") ?? "all";
  const sort = searchParams.get("sort") ?? "soon";

  // Commit a partial change to the URL (server re-renders the first page).
  const commit = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("cursor"); // any filter change resets pagination
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  // Debounced company/name search (local state -> ?q= after a pause).
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Press "/" anywhere (outside a field) to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);
  const onSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      commit((p) => (value.trim() ? p.set("q", value.trim()) : p.delete("q")));
    }, 300);
  };

  // Debounced location input.
  const [loc, setLoc] = useState(searchParams.get("location") ?? "");
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoc(searchParams.get("location") ?? "");
  }, [searchParams]);
  const onLoc = (value: string) => {
    setLoc(value);
    if (locTimer.current) clearTimeout(locTimer.current);
    locTimer.current = setTimeout(() => {
      commit((p) => (value ? p.set("location", value) : p.delete("location")));
    }, 350);
  };

  return (
    <div
      className={`relative z-10 rounded-xl border border-line bg-surface p-3 shadow-pop transition-opacity sm:p-4 ${
        isPending ? "opacity-70" : "opacity-100"
      }`}
    >
      {/* Name search */}
      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
          🔍
        </span>
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search hackathons…    ( / )"
          aria-label="Search hackathons"
          className="w-full rounded-lg border border-line bg-canvas py-2 pl-9 pr-9 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            aria-label="Clear search"
            title="Clear search"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:bg-mist hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Format toggle — the headline control */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-mist p-1">
          {FORMATS.map((f) => {
            const active = format === f.key;
            return (
              <button
                key={f.key}
                onClick={() =>
                  commit((p) =>
                    f.key === "all" ? p.delete("format") : p.set("format", f.key),
                  )
                }
                className={`rounded-md px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                  active
                    ? "bg-accent text-canvas shadow-pop-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Sort */}
          <div className="inline-flex rounded-lg border border-line bg-mist p-1">
            {SORTS.map((s) => {
              const active = sort === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() =>
                    commit((p) =>
                      s.key === "soon" ? p.delete("sort") : p.set("sort", s.key),
                    )
                  }
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    active
                      ? "bg-accent text-canvas shadow-pop-sm"
                      : "text-ink-soft hover:text-ink"
                  }`}
                  title={
                    s.key === "soon"
                      ? "Soonest start first"
                      : s.key === "new"
                        ? "Recently added first"
                        : "Biggest / most-joined first"
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Location */}
          <input
            value={loc}
            onChange={(e) => onLoc(e.target.value)}
            placeholder="location…"
            className="w-32 rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft sm:w-40"
          />
        </div>
      </div>

      {/* When horizon */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {WHENS.map((w) => {
          const active = when === w.key;
          return (
            <button
              key={w.key}
              onClick={() =>
                commit((p) =>
                  w.key === "all" ? p.delete("when") : p.set("when", w.key),
                )
              }
              className={`rounded-md border px-3 py-1 font-mono text-[11px] tracking-wide transition-all ${
                active
                  ? "border-accent-bright bg-accent-soft text-accent-deep"
                  : "border-line bg-canvas text-ink-faint hover:text-ink"
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
