// Sticky masthead: the EarlyBird wordmark + a live, filter-aware role count.

export function Header({
  count,
  windowLabel,
  fresh,
}: {
  count: number;
  windowLabel: string;
  fresh: boolean; // true for time-bounded windows ("new roles"), false for "all"
}) {
  return (
    <header className="relative z-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden>
              🐦
            </span>
            <h1 className="font-display text-4xl leading-none tracking-tight text-cream sm:text-5xl">
              Early<span className="italic text-amber">Bird</span>
            </h1>
          </div>
          <p className="mt-2 max-w-md font-mono text-[11px] leading-relaxed text-fog">
            Fresh SWE · ML · data · quant · hardware internships, surfaced at first
            light.
          </p>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="h-2 w-2 animate-livepulse rounded-full bg-coral" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-fog">
            live feed
          </span>
        </div>
      </div>

      {/* Big filter-aware count */}
      <div className="mt-6 flex items-baseline gap-3">
        <span className="font-display text-6xl tabular-nums text-amber sm:text-7xl">
          {count.toLocaleString()}
        </span>
        <span className="font-display text-2xl italic text-fog sm:text-3xl">
          {fresh ? "new " : ""}
          {count === 1 ? "role" : "roles"}
          <span className="text-faint"> {windowLabel}</span>
        </span>
      </div>
    </header>
  );
}
