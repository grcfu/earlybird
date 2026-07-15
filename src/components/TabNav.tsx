"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level switch between the two feeds. Rendered on both the internships
// (/) and hackathons (/hackathons) screens; highlights the active one.
const TABS = [
  { href: "/", label: "Internships", icon: "🎯" },
  { href: "/hackathons", label: "Hackathons", icon: "⚡" },
];

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex rounded-xl border border-line bg-mist p-1 shadow-pop-sm">
      {TABS.map((t) => {
        const active =
          t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`pop rounded-lg px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              active
                ? "bg-accent text-canvas shadow-pop-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <span aria-hidden className="mr-1.5">
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
