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
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 place-items-center border-2 border-ink bg-blush text-2xl shadow-pop-sm"
              aria-hidden
            >
              <span className="animate-bob">🐦</span>
            </span>
            <h1 className="font-display text-5xl font-semibold leading-none tracking-tight text-ink sm:text-6xl">
              Early<span className="italic text-pink-pop">Bird</span>
            </h1>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Fresh SWE · ML · data · quant · hardware internships, surfaced at
            first light. 🌸
          </p>
        </div>

        <div className="hidden items-center gap-2 border-2 border-ink bg-card px-3 py-1.5 shadow-pop-sm sm:flex">
          <span className="h-2 w-2 animate-livepulse rounded-full bg-pink-pop" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink">
            live feed
          </span>
        </div>
      </div>

      {/* Big filter-aware count */}
      <div className="mt-7 flex items-baseline gap-3">
        <span className="font-display text-7xl font-semibold tabular-nums text-pesto sm:text-8xl">
          {count.toLocaleString()}
        </span>
        <span className="font-display text-2xl italic text-ink sm:text-3xl">
          {fresh ? "new " : ""}
          {count === 1 ? "role" : "roles"}
          <span className="not-italic font-sans text-base text-ink-soft">
            {" "}
            {windowLabel}
          </span>
        </span>
      </div>
    </header>
  );
}
