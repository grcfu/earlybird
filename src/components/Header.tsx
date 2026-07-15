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
              className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-accent-soft text-2xl shadow-pop-sm"
              aria-hidden
            >
              <span className="animate-bob">🐦</span>
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-ink sm:text-5xl">
              Early<span className="text-accent">Bird</span>
            </h1>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Fresh SWE · ML · data · PM internships, surfaced at first light.
          </p>
        </div>

        <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-pop-sm sm:flex">
          <span className="h-2 w-2 animate-livepulse rounded-full bg-leaf" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
            live feed
          </span>
        </div>
      </div>

      {/* Big filter-aware count */}
      <div className="mt-7 flex items-baseline gap-3">
        <span className="font-display text-6xl font-extrabold tabular-nums text-accent sm:text-7xl">
          {count.toLocaleString()}
        </span>
        <span className="text-2xl font-semibold text-ink sm:text-3xl">
          {fresh ? "new " : ""}
          {count === 1 ? "role" : "roles"}
          <span className="font-sans text-base font-normal text-ink-soft">
            {" "}
            {windowLabel}
          </span>
        </span>
      </div>
    </header>
  );
}
