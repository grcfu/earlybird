import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "uber";

// Uber runs its own careers backend (not a standard ATS), but its site calls a
// public JSON endpoint we can page through. creationDate gives a true posted date.
interface UberLoc {
  country?: unknown; // 3-letter, e.g. "USA"
  region?: unknown;
  city?: unknown;
  countryName?: unknown;
}
interface UberJob {
  id?: unknown;
  title?: unknown;
  location?: UberLoc;
  allLocations?: UberLoc[];
  creationDate?: unknown;
}

// Format one Uber location; append the country for non-US so the US-only feed
// filter can recognize and drop foreign-only roles.
function fmtLoc(l: UberLoc): string | null {
  const city = typeof l.city === "string" ? l.city : "";
  const region = typeof l.region === "string" ? l.region : "";
  const base = [city, region].filter(Boolean).join(", ");
  if (!base) return null;
  const isUS = l.country === "USA" || l.country === "US";
  return isUS || typeof l.countryName !== "string"
    ? base
    : `${base}, ${l.countryName}`;
}

const PAGE = 100;
const MAX_PAGES = 6;

async function fetchCompany(_c: AtsCompany): Promise<AtsJob[]> {
  const out: AtsJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const raw = (await fetchJson("https://www.uber.com/api/loadSearchJobsResults?localeCode=en", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
      body: JSON.stringify({ params: {}, limit: PAGE, page }),
    })) as { data?: { results?: UberJob[] } };
    const results = raw?.data?.results ?? [];
    for (const j of results) {
      const id = typeof j.id === "number" || typeof j.id === "string" ? String(j.id) : "";
      const locs = (Array.isArray(j.allLocations) && j.allLocations.length
        ? j.allLocations
        : j.location
          ? [j.location]
          : []
      )
        .map(fmtLoc)
        .filter((x): x is string => !!x);
      out.push({
        title: typeof j.title === "string" ? j.title.trim() : "",
        locations: locs,
        url: id ? `https://www.uber.com/careers/list/${id}/` : "",
        datePosted:
          typeof j.creationDate === "string" && !Number.isNaN(Date.parse(j.creationDate))
            ? new Date(j.creationDate)
            : null,
      });
    }
    if (results.length < PAGE) break;
  }
  return out;
}

export const uberSource: Source = {
  name: SOURCE_NAME,
  load: () =>
    loadAts({
      sourceName: SOURCE_NAME,
      companies: [{ company: "Uber", token: "uber" }],
      fetchCompany,
      concurrency: 1,
    }),
};
