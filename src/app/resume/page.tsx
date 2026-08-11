import Link from "next/link";
import { TabNav } from "@/components/TabNav";
import { AuthButton } from "@/components/AuthButton";
import { ResumeTailorView } from "@/components/ResumeTailorView";
import { safeAuth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const session = await safeAuth();
  const signedIn = !!session?.user;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <div className="relative z-10 mb-6 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <TabNav />
        <div className="flex flex-wrap items-center justify-end gap-2">
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
            <span className="animate-bob">📄</span>
          </span>
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-ink sm:text-5xl">
            Early<span className="text-accent">Bird</span>
            <span className="ml-2 align-middle font-mono text-base font-medium uppercase tracking-widest text-ink-faint">
              resume
            </span>
          </h1>
        </div>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
          Upload your resume once, then tailor it to any job description —
          approve each edit, and download a copy in your own formatting.
        </p>
      </header>

      <main>
        {signedIn ? (
          <ResumeTailorView />
        ) : (
          // Unlike the rest of the app, this tab has no signed-out mode: it
          // stores a name, phone number and the resume file itself, so it is
          // tied to an account rather than a browser-local key.
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-pop">
            <div className="mb-3 text-3xl" aria-hidden>
              🔒
            </div>
            <h2 className="font-display text-xl font-bold text-ink">
              Sign in to use Resume Tailor
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
              Your resume holds your name, contact details and the original
              file, so it lives with your account instead of in this browser.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
