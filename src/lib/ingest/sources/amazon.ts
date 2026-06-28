import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "amazon";

// Amazon publishes a public JSON search endpoint with a real posted_date. We
// page through intern results; this is a single-company "provider" so we lean on
// loadAts for the internship filter + normalization.
interface AmazonJob {
  title?: unknown;
  job_path?: unknown;
  posted_date?: unknown; // e.g. "June 26, 2026"
  normalized_location?: unknown;
}

const PAGE = 100;
const MAX_PAGES = 5; // up to ~500 intern rows

function parsePostedDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchCompany(_c: AtsCompany): Promise<AtsJob[]> {
  const out: AtsJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://www.amazon.jobs/en/search.json?base_query=intern&sort=recent` +
      `&result_limit=${PAGE}&offset=${page * PAGE}`;
    const raw = (await fetchJson(url)) as { jobs?: AmazonJob[] };
    const jobs = raw?.jobs ?? [];
    for (const j of jobs) {
      const path = typeof j.job_path === "string" ? j.job_path : "";
      out.push({
        title: typeof j.title === "string" ? j.title.trim() : "",
        locations:
          typeof j.normalized_location === "string" ? [j.normalized_location.trim()] : [],
        url: path ? `https://www.amazon.jobs${path}` : "",
        datePosted: parsePostedDate(j.posted_date),
      });
    }
    if (jobs.length < PAGE) break;
  }
  return out;
}

export const amazonSource: Source = {
  name: SOURCE_NAME,
  load: () =>
    loadAts({
      sourceName: SOURCE_NAME,
      companies: [{ company: "Amazon", token: "amazon" }],
      fetchCompany,
      concurrency: 1,
    }),
};
