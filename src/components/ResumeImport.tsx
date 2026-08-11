"use client";

import { useCallback, useRef, useState } from "react";
import type { ResumeData } from "@/lib/resume/schema";
import { allBulletIds } from "@/lib/resume/schema";
import {
  Panel,
  Button,
  Working,
  SkeletonBlock,
  ErrorNote,
  WarningNote,
} from "@/components/ResumeUi";
import { ResumeReviewTable } from "@/components/ResumeReviewTable";
import type { StoredResume } from "@/components/ResumeTailorView";

// Import screen: drop a .docx, watch it get read, review the result, save.
//
// The File object is deliberately kept in component state after parsing. Saving
// sends the bytes a second time rather than having the server stash them,
// because "Save" is what commits — a parse the user abandons must leave nothing
// behind. It costs one re-upload of a file measured in tens of KB.

function Dropzone({
  onFile,
  busy,
}: {
  onFile: (f: File) => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) take(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
        dragging
          ? "border-accent bg-accent-soft"
          : "border-line-strong bg-mist hover:border-accent-bright"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="mb-2 text-3xl" aria-hidden>
        {dragging ? "📂" : "📄"}
      </div>
      <p className="font-display text-base font-bold text-ink">
        {dragging ? "Drop it here" : "Drag your resume in"}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-faint">
        A .docx file. Your exact formatting is preserved — every tailored copy is
        generated from this same file.
      </p>
      <div className="mt-4">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose a file
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = "";
        }}
      />
    </div>
  );
}

// What the parse produced, before it is committed.
export interface Draft {
  file: File;
  data: ResumeData;
  warnings: string[];
}

export function ResumeImport({
  resume,
  draft,
  setDraft,
  onSaved,
}: {
  resume: StoredResume | null;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  onSaved: (r: StoredResume) => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");

  const parse = useCallback(
    async (file: File) => {
      setError("");
      setParsing(true);
      setDraft(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/resume/parse", {
          method: "POST",
          body: form,
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          setError(body.error ?? "Couldn't read that resume.");
          return;
        }
        setDraft({
          file,
          data: body.data as ResumeData,
          warnings: (body.warnings ?? []) as string[],
        });
      } catch {
        setError("Couldn't reach the server.");
      } finally {
        setParsing(false);
      }
    },
    [setDraft],
  );

  return (
    <div className="space-y-4">
      {resume && !draft && !parsing && (
        <p className="text-xs leading-relaxed text-ink-faint">
          Importing again replaces the stored resume and every bullet id with
          it. Tailoring in progress will need re-running.
        </p>
      )}

      <Dropzone onFile={parse} busy={parsing} />

      {error && <ErrorNote>{error}</ErrorNote>}

      {parsing && (
        <Panel className="space-y-4">
          <Working
            label="Reading your resume"
            hint="Extracting the text, then having Gemini structure it. This usually takes 10–20 seconds."
          />
          <SkeletonBlock lines={5} />
        </Panel>
      )}

      {draft && (
        <>
          {draft.warnings.map((w, i) => (
            <WarningNote key={i}>{w}</WarningNote>
          ))}
          <ParsedReview
            draft={draft}
            setDraft={setDraft}
            onSaved={onSaved}
            setError={setError}
            onDiscard={() => setDraft(null)}
          />
        </>
      )}
    </div>
  );
}

// The review pass and the commit point. Nothing is stored until Save, so
// abandoning here leaves no record.
function ParsedReview({
  draft,
  setDraft,
  onSaved,
  setError,
  onDiscard,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSaved: (r: StoredResume) => void;
  setError: (s: string) => void;
  onDiscard: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const bullets = allBulletIds(draft.data).length;

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", draft.file);
      form.append("data", JSON.stringify(draft.data));
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      onSaved(body.resume as StoredResume);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, setError]);

  return (
    <Panel>
      <ResumeReviewTable
        data={draft.data}
        onChange={(data) => setDraft({ ...draft, data })}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save resume"}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onDiscard}>
          Discard
        </Button>
        <span className="ml-auto font-mono text-[10px] text-ink-faint">
          {draft.file.name} · {draft.data.experience.length} roles ·{" "}
          {draft.data.projects.length} projects · {bullets} bullets
        </span>
      </div>
    </Panel>
  );
}
