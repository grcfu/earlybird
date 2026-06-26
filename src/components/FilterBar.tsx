"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CATEGORY_ORDER, CATEGORY_META } from "@/lib/categories";

const WINDOWS: { key: string; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "2d", label: "2 days" },
  { key: "7d", label: "7 days" },
  { key: "all", label: "All" },
];

const SPONSORSHIP: { key: string; label: string }[] = [
  { key: "any", label: "Any" },
  { key: "sponsors", label: "Sponsors" },
  { key: "no", label: "No sponsor" },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const window = searchParams.get("window") ?? "2d";
  const sponsorship = searchParams.get("sponsorship") ?? "any";
  const activeOnly = searchParams.get("activeOnly") !== "false";
  const selectedCats = new Set(
    (searchParams.get("categories") ?? "").split(",").filter(Boolean),
  );

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

  // Debounced location input (local state -> URL after a pause).
  const [loc, setLoc] = useState(searchParams.get("location") ?? "");
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setLoc(searchParams.get("location") ?? "");
  }, [searchParams]);
  const onLoc = (value: string) => {
    setLoc(value);
    if (locTimer.current) clearTimeout(locTimer.current);
    locTimer.current = setTimeout(() => {
      commit((p) => (value ? p.set("location", value) : p.delete("location")));
    }, 350);
  };

  const toggleCat = (key: string) => {
    const next = new Set(selectedCats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commit((p) =>
      next.size ? p.set("categories", [...next].join(",")) : p.delete("categories"),
    );
  };

  return (
    <div
      className={`relative z-10 border-2 border-ink bg-card p-3 shadow-pop transition-opacity sm:p-4 ${
        isPending ? "opacity-70" : "opacity-100"
      }`}
    >
      {/* Recency toggle — the headline control */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex border-2 border-ink bg-paper p-1">
          {WINDOWS.map((w) => {
            const active = window === w.key;
            return (
              <button
                key={w.key}
                onClick={() => commit((p) => p.set("window", w.key))}
                className={`px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                  active
                    ? "bg-pesto text-white"
                    : "text-ink-soft hover:bg-pesto-soft hover:text-ink"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Location search */}
          <div className="relative">
            <input
              value={loc}
              onChange={(e) => onLoc(e.target.value)}
              placeholder="location…"
              className="w-36 border-2 border-ink bg-paper px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:bg-blush-soft focus:outline-none sm:w-44"
            />
          </div>

          {/* Sponsorship */}
          <div className="hidden border-2 border-ink bg-paper p-1 sm:inline-flex">
            {SPONSORSHIP.map((s) => (
              <button
                key={s.key}
                onClick={() => commit((p) => p.set("sponsorship", s.key))}
                className={`px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${
                  sponsorship === s.key
                    ? "bg-blush text-ink"
                    : "text-ink-faint hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Active only */}
          <button
            onClick={() =>
              commit((p) =>
                activeOnly ? p.set("activeOnly", "false") : p.delete("activeOnly"),
              )
            }
            className={`inline-flex items-center gap-1.5 border-2 border-ink px-3 py-1.5 font-mono text-[11px] font-bold transition-all ${
              activeOnly
                ? "bg-pesto-soft text-ink"
                : "bg-paper text-ink-faint hover:text-ink"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeOnly ? "bg-pesto" : "bg-ink-faint"
              }`}
            />
            active only
          </button>
        </div>
      </div>

      {/* Category chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const active = selectedCats.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleCat(key)}
              className="border-2 border-ink px-3 py-1 font-mono text-[11px] font-bold tracking-wide transition-all"
              style={{
                color: "var(--color-ink)",
                background: active
                  ? meta.color
                  : "color-mix(in oklab, " + meta.color + " 16%, white)",
              }}
            >
              {meta.label}
            </button>
          );
        })}
        {selectedCats.size > 0 && (
          <button
            onClick={() => commit((p) => p.delete("categories"))}
            className="px-2.5 py-1 font-mono text-[11px] font-bold text-ink-faint hover:text-berry"
          >
            clear ✕
          </button>
        )}
      </div>
    </div>
  );
}
