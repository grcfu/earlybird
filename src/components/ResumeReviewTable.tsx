"use client";

import type {
  ResumeData,
  ResumeExperience,
  ResumeProject,
} from "@/lib/resume/schema";
import { SectionTitle } from "@/components/ResumeUi";

// The review pass between parsing and saving.
//
// What is editable here and what is not is deliberate. Every text field is
// editable, because Gemini reads this JSON when tailoring and a misparsed
// company name quietly degrades every later suggestion. Bullet IDS are not
// editable and are not shown as inputs: they are positions inside the stored
// .docx, and a hand-typed id would point at the wrong paragraph, or nothing.
//
// Editing bullet text here does NOT rewrite the .docx. The file only ever
// changes at export, and only for suggestions approved on the Tailor screen.
// The header says so, because the opposite assumption is an easy one to make.

const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink " +
  "placeholder:text-ink-faint/60 focus:border-accent-bright focus:outline-none";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

// Comma-separated editing for the string arrays. Splitting on save rather than
// on every keystroke means typing a comma doesn't yank the cursor around.
function ListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <input
        type="text"
        defaultValue={values.join(", ")}
        placeholder={placeholder}
        onBlur={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className={inputClass}
      />
    </label>
  );
}

function BulletRows({
  bullets,
  onChange,
}: {
  bullets: { id: string; text: string }[];
  onChange: (bullets: { id: string; text: string }[]) => void;
}) {
  if (bullets.length === 0) {
    return (
      <p className="mt-2 font-mono text-[10px] text-ink-faint">
        No bullets were recognized here.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {bullets.map((b, i) => (
        <li key={b.id} className="flex items-start gap-2">
          <span
            className="mt-1.5 shrink-0 rounded bg-mist px-1.5 py-0.5 font-mono text-[9px] text-ink-faint"
            title="Position in your .docx — fixed, so export knows which line to replace"
          >
            {b.id}
          </span>
          <textarea
            value={b.text}
            rows={2}
            onChange={(e) => {
              const next = bullets.slice();
              next[i] = { ...b, text: e.target.value };
              onChange(next);
            }}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </li>
      ))}
    </ul>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-mist p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-accent-ink">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ResumeReviewTable({
  data,
  onChange,
}: {
  data: ResumeData;
  onChange: (d: ResumeData) => void;
}) {
  const setBasics = (patch: Partial<ResumeData["basics"]>) =>
    onChange({ ...data, basics: { ...data.basics, ...patch } });

  const setExperience = (i: number, patch: Partial<ResumeExperience>) => {
    const experience = data.experience.slice();
    experience[i] = { ...experience[i], ...patch };
    onChange({ ...data, experience });
  };

  const setProject = (i: number, patch: Partial<ResumeProject>) => {
    const projects = data.projects.slice();
    projects[i] = { ...projects[i], ...patch };
    onChange({ ...data, projects });
  };

  return (
    <div className="space-y-4">
      <SectionTitle hint="Fix anything the parser got wrong — this is what Gemini reads when tailoring. Your .docx is never changed here; only approved edits on the Tailor screen reach the exported file.">
        Review
      </SectionTitle>

      <Group title="Basics">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field
            label="Name"
            value={data.basics.name}
            placeholder="Used for the export filename"
            onChange={(name) => setBasics({ name })}
          />
          <Field
            label="Email"
            value={data.basics.email}
            onChange={(email) => setBasics({ email })}
          />
          <Field
            label="Phone"
            value={data.basics.phone}
            onChange={(phone) => setBasics({ phone })}
          />
          <Field
            label="Location"
            value={data.basics.location}
            onChange={(location) => setBasics({ location })}
          />
        </div>
        <div className="mt-2.5">
          <ListField
            label="Links (comma separated)"
            values={data.basics.links}
            onChange={(links) => setBasics({ links })}
          />
        </div>
      </Group>

      {data.education.map((ed, i) => (
        <Group key={i} title={`Education ${i + 1}`}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field
              label="School"
              value={ed.school}
              onChange={(school) => {
                const education = data.education.slice();
                education[i] = { ...ed, school };
                onChange({ ...data, education });
              }}
            />
            <Field
              label="Degree"
              value={ed.degree}
              onChange={(degree) => {
                const education = data.education.slice();
                education[i] = { ...ed, degree };
                onChange({ ...data, education });
              }}
            />
            <Field
              label="Dates"
              value={ed.dates}
              onChange={(dates) => {
                const education = data.education.slice();
                education[i] = { ...ed, dates };
                onChange({ ...data, education });
              }}
            />
            <Field
              label="Location"
              value={ed.location}
              onChange={(location) => {
                const education = data.education.slice();
                education[i] = { ...ed, location };
                onChange({ ...data, education });
              }}
            />
          </div>
          <div className="mt-2.5">
            <Field
              label="Details"
              value={ed.details}
              onChange={(details) => {
                const education = data.education.slice();
                education[i] = { ...ed, details };
                onChange({ ...data, education });
              }}
            />
          </div>
        </Group>
      ))}

      {data.experience.map((ex, i) => (
        <Group key={i} title={`Experience ${i + 1}`}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field
              label="Company"
              value={ex.company}
              onChange={(company) => setExperience(i, { company })}
            />
            <Field
              label="Role"
              value={ex.role}
              onChange={(role) => setExperience(i, { role })}
            />
            <Field
              label="Dates"
              value={ex.dates}
              onChange={(dates) => setExperience(i, { dates })}
            />
            <Field
              label="Location"
              value={ex.location}
              onChange={(location) => setExperience(i, { location })}
            />
          </div>
          <BulletRows
            bullets={ex.bullets}
            onChange={(bullets) => setExperience(i, { bullets })}
          />
        </Group>
      ))}

      {data.projects.map((pr, i) => (
        <Group key={i} title={`Project ${i + 1}`}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field
              label="Name"
              value={pr.name}
              onChange={(name) => setProject(i, { name })}
            />
            <Field
              label="Stack"
              value={pr.stack}
              onChange={(stack) => setProject(i, { stack })}
            />
            <Field
              label="Dates"
              value={pr.dates}
              onChange={(dates) => setProject(i, { dates })}
            />
            <Field
              label="Link"
              value={pr.link}
              onChange={(link) => setProject(i, { link })}
            />
          </div>
          <BulletRows
            bullets={pr.bullets}
            onChange={(bullets) => setProject(i, { bullets })}
          />
        </Group>
      ))}

      <Group title="Skills">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ListField
            label="Languages"
            values={data.skills.languages}
            onChange={(languages) =>
              onChange({ ...data, skills: { ...data.skills, languages } })
            }
          />
          <ListField
            label="Frameworks"
            values={data.skills.frameworks}
            onChange={(frameworks) =>
              onChange({ ...data, skills: { ...data.skills, frameworks } })
            }
          />
          <ListField
            label="Tools"
            values={data.skills.tools}
            onChange={(tools) =>
              onChange({ ...data, skills: { ...data.skills, tools } })
            }
          />
          <ListField
            label="Concepts"
            values={data.skills.concepts}
            onChange={(concepts) =>
              onChange({ ...data, skills: { ...data.skills, concepts } })
            }
          />
        </div>
      </Group>
    </div>
  );
}
