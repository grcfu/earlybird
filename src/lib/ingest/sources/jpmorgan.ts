import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "jpmorgan";

// JPMorgan runs Oracle Recruiting Cloud, which exposes a public JSON API. Its
// keyword search is fuzzy, so we page newest-first and let the internship title
// filter (incl. "summer analyst") do the selecting.
const HOST = "jpmc.fa.oraclecloud.com";
const SITE = "CX_1";

interface OrcReq {
  Id?: unknown;
  Title?: unknown;
  PrimaryLocation?: unknown;
  PostedDate?: unknown; // "YYYY-MM-DD"
}

const PAGE = 50;
const MAX_PAGES = 6; // newest ~300 reqs; intern postings are recent in-season

async function fetchCompany(_c: AtsCompany): Promise<AtsJob[]> {
  const out: AtsJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://${HOST}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList` +
      `&finder=findReqs;siteNumber=${SITE},limit=${PAGE},offset=${page * PAGE},sortBy=POSTING_DATES_DESC`;
    const raw = (await fetchJson(url)) as {
      items?: Array<{ requisitionList?: OrcReq[] }>;
    };
    const reqs = raw?.items?.[0]?.requisitionList ?? [];
    for (const r of reqs) {
      const id = r.Id != null ? String(r.Id) : "";
      out.push({
        title: typeof r.Title === "string" ? r.Title.trim() : "",
        locations:
          typeof r.PrimaryLocation === "string" ? [r.PrimaryLocation.trim()] : [],
        url: id
          ? `https://${HOST}/hcmUI/CandidateExperience/en/sites/${SITE}/job/${id}`
          : "",
        datePosted:
          typeof r.PostedDate === "string" && !Number.isNaN(Date.parse(r.PostedDate))
            ? new Date(r.PostedDate)
            : null,
      });
    }
    if (reqs.length < PAGE) break;
  }
  return out;
}

export const jpmorganSource: Source = {
  name: SOURCE_NAME,
  load: () =>
    loadAts({
      sourceName: SOURCE_NAME,
      companies: [{ company: "JPMorgan Chase", token: "jpmorgan" }],
      fetchCompany,
      concurrency: 1,
    }),
};
