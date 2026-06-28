import { fetchJson } from "@/lib/ingest/http";
import { loadAts, parseIsoDate, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "ashby";

// Display name -> Ashby job-board org slug.
const BOARDS: AtsCompany[] = [
  { company: "OpenAI", token: "openai" },
  { company: "Notion", token: "notion" },
  { company: "Ramp", token: "ramp" },
  { company: "Linear", token: "linear" },
  { company: "Perplexity", token: "perplexity" },
  { company: "Replit", token: "replit" },
  { company: "Modal", token: "modal" },
];

interface AshbyJob {
  title?: unknown;
  jobUrl?: unknown;
  applyUrl?: unknown;
  publishedAt?: unknown;
  location?: unknown;
  isListed?: unknown;
}

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const raw = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${c.token}`,
  );
  const jobs = (raw as { jobs?: AshbyJob[] })?.jobs ?? [];
  return jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      title: typeof j.title === "string" ? j.title.trim() : "",
      locations: typeof j.location === "string" ? [j.location.trim()] : [],
      url:
        (typeof j.jobUrl === "string" && j.jobUrl) ||
        (typeof j.applyUrl === "string" && j.applyUrl) ||
        "",
      datePosted: parseIsoDate(j.publishedAt),
    }));
}

export const ashbySource: Source = {
  name: SOURCE_NAME,
  load: () => loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany }),
};
