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
  {
    category: Category.PM,
    patterns: [/product manager/i, /product management/i, /\bapm\b/i, /\bpm\b/i],
  },
  {
    category: Category.SWE,
    patterns: [
      /software/i,
      /\bswe\b/i,
      /developer/i,
      /\bengineer/i,
      /front[\s-]?end/i,
      /back[\s-]?end/i,
      /full[\s-]?stack/i,
      /\bweb\b/i,
      /\bios\b/i,
      /android/i,
      /\bsde\b/i,
    ],
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
