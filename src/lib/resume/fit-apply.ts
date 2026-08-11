import { bodyHalfPoints } from "@/lib/resume/fit";

// The levers that claw back vertical space, applied to the EXPORTED copy only.
//
// Ordered here the way they are offered: least visible first. Spacing is nearly
// invisible; font size is the one a reader notices. Dropping a bullet is not
// here at all — that is a content decision, so it happens upstream as an
// ordinary bullet edit the user approves, not as a formatting transform.
//
// Everything is conservative by construction. Each lever refuses when it has
// nothing safe to do, and says so, rather than half-applying something.

export interface LeverResult {
  xml: string;
  applied: boolean;
  // Human-readable description of what changed, for the export report.
  note: string;
}

/**
 * Scale paragraph spacing (w:before / w:after) toward zero.
 *
 * Leaves w:line alone: line spacing interacts with lineRule and with the
 * paragraph's own font size in ways that are easy to get subtly wrong, and
 * before/after is where the recoverable space usually is anyway.
 */
export function tightenSpacing(xml: string, factor: number): LeverResult {
  const f = Math.min(1, Math.max(0, factor));
  let changed = 0;
  let savedTwips = 0;

  const out = xml.replace(/<w:spacing\b[^>]*\/?>/g, (tag) => {
    let next = tag;
    for (const attr of ["before", "after"] as const) {
      const m = next.match(new RegExp(`w:${attr}="(\\d+)"`));
      if (!m) continue;
      const was = Number(m[1]);
      if (was === 0) continue;
      const now = Math.round(was * f);
      if (now === was) continue;
      savedTwips += was - now;
      changed++;
      next = next.replace(m[0], `w:${attr}="${now}"`);
    }
    return next;
  });

  if (changed === 0) {
    return {
      xml,
      applied: false,
      note: "paragraph spacing was already as tight as it goes",
    };
  }
  // 1440 twips to the inch.
  const inches = (savedTwips / 1440).toFixed(2);
  return {
    xml: out,
    applied: true,
    note: `tightened paragraph spacing on ${changed} paragraph(s), about ${inches}" recovered`,
  };
}

/**
 * Step the body font down, leaving headings and spacers alone.
 *
 * Only runs set at exactly the body size are touched. Headings are larger and
 * keep their size, so the hierarchy survives; 3pt spacers are smaller and keep
 * theirs, so the layout trick they exist for is not undone.
 *
 * `floorHalfPoints` is a hard stop — below about 10pt a resume stops being
 * comfortable to read, and the point of fitting one page is being read.
 */
export function shrinkBodyFont(
  xml: string,
  stepHalfPoints: number,
  floorHalfPoints: number,
): LeverResult {
  const body = bodyHalfPoints(xml);
  const target = body - stepHalfPoints;

  if (body <= floorHalfPoints) {
    return {
      xml,
      applied: false,
      note: `body text is already ${body / 2}pt, at or below the ${floorHalfPoints / 2}pt floor`,
    };
  }
  if (target < floorHalfPoints) {
    return {
      xml,
      applied: false,
      note: `shrinking would take body text below the ${floorHalfPoints / 2}pt floor`,
    };
  }

  // Only exact matches on the body size. A regex on the value keeps headings
  // (larger) and spacers (smaller) untouched.
  let changed = 0;
  const out = xml.replace(
    new RegExp(`<w:(sz|szCs)\\s+w:val="${body}"\\s*/>`, "g"),
    (_m, tag: string) => {
      changed++;
      return `<w:${tag} w:val="${target}"/>`;
    },
  );

  if (changed === 0) {
    // The document leans on styles.xml for its default size rather than
    // declaring it per run. Rewriting the style default would change more than
    // the body, so this refuses instead of guessing.
    return {
      xml,
      applied: false,
      note: "this resume sets its font in its Word style rather than per paragraph, so the size can't be stepped down safely",
    };
  }

  return {
    xml: out,
    applied: true,
    note: `body text ${body / 2}pt → ${target / 2}pt (headings unchanged)`,
  };
}
