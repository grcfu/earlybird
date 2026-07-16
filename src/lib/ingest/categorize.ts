import { Category } from "@/generated/prisma/client";

// Ordered keyword rules — first match wins, so put the more specific families
// (quant, ML, hardware) before the broad SWE catch-all. Phase 2 expands this and
// lets sources pass an explicit category hint; for now we infer purely from title.
const RULES: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: Category.QUANT,
    patterns: [/\bquant/i, /\btrading\b/i, /\btrader\b/i, /quantitative/i],
  },
  {
    category: Category.ML_AI,
    patterns: [
      /machine learning/i,
      /\bml\b/i,
      /\ba\.?i\.?\b/i,
      /deep learning/i,
      /\bnlp\b/i,
      /computer vision/i,
      /\bllm\b/i,
      /research scientist/i,
    ],
  },
  {
    category: Category.DATA,
    patterns: [
      /data scien/i,
      /data engineer/i,
      /data analy/i,
      /\banalytics\b/i,
      /\bbi\b/i,
    ],
  },
  {
    category: Category.HARDWARE,
    patterns: [
      /hardware/i,
      /\bfpga\b/i,
      /\basic\b/i,
      /embedded/i,
      /electrical/i,
      /\bvlsi\b/i,
      /firmware/i,
      /silicon/i,
    ],
  },
  // Explicit software signals — matched BEFORE the non-software-engineering rule
  // below, so a genuine software role at a manufacturing/hardware org (e.g.
  // "Manufacturing Test Software Intern") stays SWE instead of being excluded.
  {
    category: Category.SWE,
    patterns: [
      /software/i,
      /\bswe\b/i,
      /\bsde\b/i,
      /developer/i,
      /programming/i,
      /full[\s-]?stack/i,
      /front[\s-]?end/i,
      /back[\s-]?end/i,
      /\bweb\b/i,
      /\bios\b/i,
      /android/i,
    ],
  },
  // Non-software engineering disciplines. These carry "Engineer(ing)" but are NOT
  // software, so they must resolve here (→ OTHER, which the feed excludes) rather
  // than fall through to the broad SWE catch-all and pollute the SWE filter.
  {
    category: Category.OTHER,
    patterns: [
      /mechanical/i,
      /\bcivil\b/i,
      /chemical/i,
      /industrial engineer/i,
      /manufactur/i,
      /aerospace/i,
      /aeronautic/i,
      /astronautic/i,
      /biomedical/i,
      /environmental/i,
      /structural/i,
      /process engineer/i,
      /\bthermal\b/i,
      /packaging/i,
      /petroleum/i,
      /geotechn/i,
      /metallurg/i,
      /mechatronic/i,
      /materials (engineer|scien)/i,
      /field service/i,
      /sales engineer/i,
      /\bhvac\b/i,
      /combustion/i,
    ],
  },
  {
    category: Category.PM,
    patterns: [/product manager/i, /product management/i, /\bapm\b/i, /\bpm\b/i],
  },
  // Broad SWE catch-all: generic "Engineer" / systems / platform roles that
  // aren't a named non-software discipline land here.
  {
    category: Category.SWE,
    patterns: [/\bengineer/i, /developer/i, /\bsde\b/i],
  },
];

// Infer a Category from a job title. Falls back to OTHER when nothing matches.
export function categorize(title: string): Category {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(title))) {
      return rule.category;
    }
  }
  return Category.OTHER;
}

// Map a source-provided category label (e.g. SimplifyJobs' "AI/ML/Data") onto
// our enum. Returns null when the label is unrecognized so callers can fall back.
function fromSourceLabel(label: string): Category | null {
  const c = label.trim().toLowerCase();
  if (!c) return null;
  if (/quant/.test(c)) return Category.QUANT;
  if (/hardware/.test(c)) return Category.HARDWARE;
  if (/product/.test(c)) return Category.PM;
  if (/software|\bswe\b|\bsde\b/.test(c)) return Category.SWE;
  // Pure-data labels before the broad AI/ML check.
  if (/data scien|data engineer|data analy|^data\b/.test(c)) return Category.DATA;
  if (/\bai\b|\bml\b|machine learning|\bdata\b/.test(c)) return Category.ML_AI;
  return null;
}

// Resolve a Category using the source's explicit label first (when usable),
// otherwise inferring from the title. This is the entry point adapters call.
export function normalizeCategory(
  sourceLabel: string | null | undefined,
  title: string,
): Category {
  if (sourceLabel) {
    const mapped = fromSourceLabel(sourceLabel);
    if (mapped) return mapped;
  }
  return categorize(title);
}
