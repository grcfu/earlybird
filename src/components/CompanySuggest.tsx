"use client";

import { useId, useState } from "react";
import { normalizeCompany, sameCompany } from "@/lib/apptracker/normalize";
import { STAGE_LABEL, type AppStageKey } from "@/lib/apptracker/stages";

export interface CompanyOption {
  id: string;
  company: string;
  stage: AppStageKey;
  appliedAt: string | null;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// A company text input that suggests the companies you already track, so a
// misread name ("Sarah Chen") can be pointed at the real one ("Rippling") without
// retyping it exactly. Typing a name that isn't in the list is just a new name.
export function CompanySuggest({
  value,
  onChange,
  options,
  autoFocus,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CompanyOption[];
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const listId = useId();

  const q = normalizeCompany(value);
  // One entry per employer, matching on the normalized name so "rip" finds
  // "Rippling" and "capital one" finds "Capitalone".
  const matches: CompanyOption[] = [];
  if (q) {
    for (const o of options) {
      const n = normalizeCompany(o.company);
      if (!(n.includes(q) || n.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || sameCompany(o.company, value))) continue;
      if (matches.some((m) => sameCompany(m.company, o.company))) continue;
      matches.push(o);
      if (matches.length === 6) break;
    }
  }
  // Nothing to suggest once the box already says exactly that company.
  const show =
    open && matches.length > 0 && !(matches.length === 1 && matches[0].company === value);

  const pick = (o: CompanyOption) => {
    onChange(o.company);
    setOpen(false);
    setHi(-1);
  };

  return (
    <div className="relative min-w-0">
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-label="Company"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, -1));
          } else if (e.key === "Enter" && hi >= 0) {
            // Choose the highlighted suggestion rather than submitting the form.
            e.preventDefault();
            pick(matches[hi]);
          } else if (e.key === "Escape") {
            // Close the list without also cancelling the surrounding edit.
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`w-full ${className ?? ""}`}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
        >
          <li className="px-2.5 pt-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            already tracked
          </li>
          {matches.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === hi}
              // mousedown, not click: click fires after the input's blur has
              // already closed the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHi(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-2.5 py-1.5 ${
                i === hi ? "bg-accent-soft" : ""
              }`}
            >
              <span className="truncate text-[13px] font-semibold text-ink">{o.company}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                {STAGE_LABEL[o.stage]}
                {o.appliedAt ? ` · applied ${fmtDate(o.appliedAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
