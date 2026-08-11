"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResumeData, TailorAnalysis } from "@/lib/resume/schema";
import { allBulletIds } from "@/lib/resume/schema";
import {
  Panel,
  SkeletonBlock,
  ErrorNote,
  SectionTitle,
} from "@/components/ResumeUi";
import { ResumeImport, type Draft } from "@/components/ResumeImport";
import { ResumeTailor } from "@/components/ResumeTailor";

// The Resume Tailor container: owns the stored resume and switches between the
// three screens. Import writes to the server; Tailor and Export only ever read,
// which is what keeps the stored base resume unmutated by tailoring.

export type Screen = "import" | "tailor" | "export";

export interface StoredResume {
  data: ResumeData;
  filename: string;
  updatedAt: string;
}

const SCREENS: { key: Screen; label: string; icon: string }[] = [
  { key: "import", label: "My Resume", icon: "📥" },
  { key: "tailor", label: "Tailor", icon: "🎯" },
  { key: "export", label: "Export", icon: "⬇" },
];

function ScreenNav({
  screen,
  setScreen,
  hasResume,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  hasResume: boolean;
}) {
  return (
    <nav className="mb-5 inline-flex rounded-xl border border-line bg-mist p-1 shadow-pop-sm">
      {SCREENS.map((s) => {
        // Tailoring and exporting are meaningless without a stored resume, so
        // they stay disabled rather than leading to an empty screen.
        const locked = s.key !== "import" && !hasResume;
        const active = screen === s.key;
        return (
          <button
            key={s.key}
            type="button"
            disabled={locked}
            aria-current={active ? "page" : undefined}
            title={locked ? "Import a resume first" : undefined}
            onClick={() => setScreen(s.key)}
            className={`pop rounded-lg px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              active
                ? "bg-accent text-canvas shadow-pop-sm"
                : locked
                  ? "cursor-not-allowed text-ink-faint/50"
                  : "text-ink-soft hover:text-ink"
            }`}
          >
            <span aria-hidden className="mr-1.5">
              {s.icon}
            </span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

// A short "here's what's stored" card, so the tab opens on something concrete.
export function StoredResumeCard({ resume }: { resume: StoredResume }) {
  const { data } = resume;
  const bullets = allBulletIds(data).length;
  const saved = new Date(resume.updatedAt);
  const skills =
    data.skills.languages.length +
    data.skills.frameworks.length +
    data.skills.tools.length +
    data.skills.concepts.length;

  return (
    <Panel>
      <SectionTitle hint={`Saved ${saved.toLocaleDateString()} · ${resume.filename}`}>
        Stored resume
      </SectionTitle>
      <p className="font-display text-lg font-bold text-ink">
        {data.basics.name}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">
        {[data.basics.email, data.basics.phone, data.basics.location]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Experience", data.experience.length],
          ["Projects", data.projects.length],
          ["Bullets", bullets],
          ["Skills", skills],
        ].map(([label, n]) => (
          <div
            key={label}
            className="rounded-xl border border-line bg-mist px-3 py-2"
          >
            <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {label}
            </dt>
            <dd className="font-display text-xl font-bold text-ink">{n}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function ResumeTailorView() {
  const [screen, setScreen] = useState<Screen>("import");
  const [resume, setResume] = useState<StoredResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // An uncommitted parse. Held here rather than inside the Import screen so
  // switching sub-tabs mid-review doesn't silently throw the work away.
  const [draft, setDraft] = useState<Draft | null>(null);

  // The tailoring session. This is the in-memory working copy the spec calls
  // for: it lives here, not in the database, so the stored base resume is
  // untouched by tailoring and Export can read the approvals without a
  // round trip. It is also why this state sits in the parent rather than in
  // the Tailor screen — switching to Export must not discard it.
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [analysis, setAnalysis] = useState<TailorAnalysis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/resume");
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Couldn't load your resume.");
        return;
      }
      setResume(body.resume as StoredResume | null);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate once after mount. Same shape as ApplicationsView: the fetch sets
    // state, which the rule flags, but there is no server-rendered copy of this
    // data to hydrate from — the tab is force-dynamic and per-account.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  if (loading) {
    return (
      <Panel>
        <SkeletonBlock lines={4} />
      </Panel>
    );
  }

  return (
    <div>
      <ScreenNav screen={screen} setScreen={setScreen} hasResume={!!resume} />
      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {screen === "import" && (
        <div className="space-y-4">
          {resume && !draft && <StoredResumeCard resume={resume} />}
          <ResumeImport
            resume={resume}
            draft={draft}
            setDraft={setDraft}
            onSaved={(r) => {
              setResume(r);
              setDraft(null);
            }}
          />
        </div>
      )}

      {screen === "tailor" && resume && (
        <ResumeTailor
          jd={jd}
          setJd={setJd}
          company={company}
          setCompany={setCompany}
          analysis={analysis}
          setAnalysis={setAnalysis}
        />
      )}

      {screen === "export" && resume && (
        <Panel>
          <SectionTitle hint="Download your resume with the approved edits applied.">
            Export
          </SectionTitle>
        </Panel>
      )}
    </div>
  );
}
