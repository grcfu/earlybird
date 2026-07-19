import Link from "next/link";
import { TabNav } from "@/components/TabNav";
import { ApplicationsView } from "@/components/ApplicationsView";
import { AuthButton } from "@/components/AuthButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <div className="relative z-10 mb-6 flex items-center justify-between gap-2">
        <TabNav />
        <div className="flex items-center gap-2">
          <AuthButton />
          <Link
            href="/settings"
            className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-accent-deep shadow-pop-sm hover:border-accent-bright"
          >
            ⚙ manage alerts
          </Link>
        </div>
      </div>

      <header className="relative z-10 mb-8">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-accent-soft text-2xl shadow-pop-sm"
            aria-hidden
          >
            <span className="animate-bob">📮</span>
          </span>
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-ink sm:text-5xl">
            Early<span className="text-accent">Bird</span>
            <span className="ml-2 align-middle font-mono text-base font-medium uppercase tracking-widest text-ink-faint">
              applications
            </span>
          </h1>
        </div>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
          Your applications, tracked automatically from your email — applied,
          assessment, interview, offer, or rejected, with the date.
        </p>
      </header>

      <main>
        <ApplicationsView />
      </main>
    </div>
  );
}
