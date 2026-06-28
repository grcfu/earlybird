import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "lever";

// Display name -> Lever org slug (api.lever.co/v0/postings/{slug}).
const BOARDS: AtsCompany[] = [
  { company: "Palantir", token: "palantir" },
  { company: "Ro", token: "ro" },
  { company: "Veeva", token: "veeva" },
  { company: "GoPuff", token: "gopuff" },
];

interface LeverJob {
  text?: unknown;
  hostedUrl?: unknown;
  createdAt?: unknown;
  categories?: { location?: unknown; allLocations?: unknown; commitment?: unknown };
}

function locations(cats: LeverJob["categories"]): string[] {
  if (Array.isArray(cats?.allLocations)) {
    return cats!.allLocations.filter((x): x is string => typeof x === "string");
  }
  return typeof cats?.location === "string" ? [cats.location] : [];
}

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const raw = await fetchJson(`https://api.lever.co/v0/postings/${c.token}?mode=json`);
  if (!Array.isArray(raw)) return [];
  return (raw as LeverJob[]).map((j) => ({
    title: typeof j.text === "string" ? j.text.trim() : "",
    locations: locations(j.categories),
    url: typeof j.hostedUrl === "string" ? j.hostedUrl : "",
    // Lever gives a real creation timestamp (epoch ms).
    datePosted:
      typeof j.createdAt === "number" && j.createdAt > 0
        ? new Date(j.createdAt)
        : null,
  }));
}

export const leverSource: Source = {
  name: SOURCE_NAME,
  load: () => loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany }),
};
