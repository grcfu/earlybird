// Category presentation metadata. Kept free of any Prisma import so it can be
// used in client components without pulling the DB client into the browser.
// Keys mirror the Prisma Category enum values.

export const CATEGORY_ORDER = [
  "SWE",
  "ML_AI",
  "DATA",
  "QUANT",
  "HARDWARE",
  "PM",
  "OTHER",
] as const;

export type CategoryKey = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_META: Record<
  CategoryKey,
  { label: string; color: string }
> = {
  SWE: { label: "SWE", color: "var(--color-cat-swe)" },
  ML_AI: { label: "ML / AI", color: "var(--color-cat-ml)" },
  DATA: { label: "Data", color: "var(--color-cat-data)" },
  QUANT: { label: "Quant", color: "var(--color-cat-quant)" },
  HARDWARE: { label: "Hardware", color: "var(--color-cat-hardware)" },
  PM: { label: "PM", color: "var(--color-cat-pm)" },
  OTHER: { label: "Other", color: "var(--color-cat-other)" },
};

export function categoryMeta(key: string) {
  return CATEGORY_META[key as CategoryKey] ?? CATEGORY_META.OTHER;
}
