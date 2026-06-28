import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "workday";

// Workday boards vary per company by host + tenant + site path. We still model
// each as an AtsCompany (token = tenant) but carry the extra routing fields.
interface WorkdayCompany extends AtsCompany {
  host: string; // e.g. nvidia.wd5.myworkdayjobs.com
  site: string; // e.g. NVIDIAExternalCareerSite
}

const BOARDS: WorkdayCompany[] = [
  {
    company: "NVIDIA",
    token: "nvidia",
    host: "nvidia.wd5.myworkdayjobs.com",
    site: "NVIDIAExternalCareerSite",
  },
  {
    company: "Salesforce",
    token: "salesforce",
    host: "salesforce.wd12.myworkdayjobs.com",
    site: "External_Career_Site",
  },
  {
    company: "Workday",
    token: "workday",
    host: "workday.wd5.myworkdayjobs.com",
    site: "Workday",
  },
];

interface WdPosting {
  title?: unknown;
  externalPath?: unknown;
  locationsText?: unknown;
  postedOn?: unknown;
}

// Workday only exposes a relative "Posted N Days Ago" string. Convert to an
// approximate Date so recency still works (good enough for freshness).
function relativeToDate(postedOn: unknown, now: number): Date | null {
  if (typeof postedOn !== "string") return null;
  const s = postedOn.toLowerCase();
  if (s.includes("today")) return new Date(now);
  if (s.includes("yesterday")) return new Date(now - 86_400_000);
  const m = s.match(/(\d+)\+?\s*day/);
  if (m) return new Date(now - Number(m[1]) * 86_400_000);
  const mo = s.match(/(\d+)\+?\s*month/);
  if (mo) return new Date(now - Number(mo[1]) * 30 * 86_400_000);
  return null;
}

const PAGE = 20; // Workday hard-caps limit at 20
const MAX_PAGES = 5; // up to 100 intern-matching rows per company

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const wc = c as WorkdayCompany;
  const now = Date.now();
  const endpoint = `https://${wc.host}/wday/cxs/${wc.token}/${wc.site}/jobs`;
  const out: AtsJob[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const raw = (await fetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appliedFacets: {},
        limit: PAGE,
        offset: page * PAGE,
        searchText: "intern",
      }),
    })) as { jobPostings?: WdPosting[]; total?: number };

    const postings = raw?.jobPostings ?? [];
    for (const p of postings) {
      const path = typeof p.externalPath === "string" ? p.externalPath : "";
      out.push({
        title: typeof p.title === "string" ? p.title.trim() : "",
        locations: typeof p.locationsText === "string" ? [p.locationsText.trim()] : [],
        url: path ? `https://${wc.host}/en-US/${wc.site}${path}` : "",
        datePosted: relativeToDate(p.postedOn, now),
      });
    }
    if (postings.length < PAGE) break; // last page
  }
  return out;
}

export const workdaySource: Source = {
  name: SOURCE_NAME,
  load: () => loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany, concurrency: 4 }),
};
