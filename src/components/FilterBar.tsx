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
      className={`relative z-10 rounded-xl border border-line bg-surface p-3 shadow-pop transition-opacity sm:p-4 ${
        isPending ? "opacity-70" : "opacity-100"
      }`}
    >
      {/* Recency toggle — the headline control */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-mist p-1">
          {WINDOWS.map((w) => {
            const active = window === w.key;
            return (
              <button
                key={w.key}
                onClick={() => commit((p) => p.set("window", w.key))}
                className={`rounded-md px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                  active
                    ? "bg-accent text-canvas shadow-pop-sm"
                    : "text-ink-soft hover:text-ink"
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
              className="w-36 rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft sm:w-44"
            />
          </div>

          {/* Sponsorship */}
          <div className="hidden rounded-lg border border-line bg-mist p-1 sm:inline-flex">
            {SPONSORSHIP.map((s) => (
              <button
                key={s.key}
                onClick={() => commit((p) => p.set("sponsorship", s.key))}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-all ${
                  sponsorship === s.key
                    ? "bg-accent text-canvas shadow-pop-sm"
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
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] transition-all ${
              activeOnly
                ? "border-accent-bright bg-accent-soft text-accent-deep"
                : "border-line bg-canvas text-ink-faint hover:text-ink"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeOnly ? "bg-accent" : "bg-ink-faint"
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
              className="rounded-md border px-3 py-1 font-mono text-[11px] tracking-wide transition-all"
              style={{
                color: active ? "var(--color-canvas)" : meta.color,
                background: active
                  ? meta.color
                  : "color-mix(in oklab, " + meta.color + " 16%, var(--color-surface))",
                borderColor: active
                  ? meta.color
                  : "color-mix(in oklab, " + meta.color + " 38%, var(--color-surface))",
              }}
            >
              {meta.label}
            </button>
          );
        })}
        {selectedCats.size > 0 && (
          <button
            onClick={() => commit((p) => p.delete("categories"))}
            className="rounded-md px-2.5 py-1 font-mono text-[11px] text-ink-faint hover:text-danger"
          >
            clear ✕
          </button>
        )}
      </div>
    </div>
  );
}
