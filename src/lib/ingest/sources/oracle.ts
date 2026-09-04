import { fetchJson } from "@/lib/ingest/http";
import { loadAts, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "oracle";

// Companies on Oracle Recruiting Cloud. Its public JSON API is the same shape
// per company — only the host + site number differ. Keyword search is fuzzy, so
// we page newest-first and let the internship title filter do the selecting.
interface OracleCompany extends AtsCompany {
  host: string;
  site: string;
}

const BOARDS: OracleCompany[] = [
  {
    company: "JPMorgan Chase",
    token: "jpmc",
    host: "jpmc.fa.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "American Express",
    token: "amex",
    host: "egug.fa.us2.oraclecloud.com",
    site: "CX_1",
  },
  // Mined 2026-09-04 from the aggregator feeds' apply-URLs (they embed the
  // tenant host + site id verbatim), then each board probed against the live
  // API and kept only on a 200 with at least one open internship posting.
  {
    company: "American Tower",
    token: "americantower",
    host: "hdsn.fa.us6.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Arconic",
    token: "arconic",
    host: "hdnn.fa.us6.oraclecloud.com",
    site: "CX",
  },
  {
    company: "Chubb",
    token: "chubb",
    host: "fa-ewgu-saasfaprod1.fa.ocs.oraclecloud.com",
    site: "CX_2001",
  },
  {
    company: "CSX",
    token: "csx",
    host: "fa-eowa-saasfaprod1.fa.ocs.oraclecloud.com",
    site: "CSXCareers",
  },
  {
    company: "Cummins",
    token: "cummins",
    host: "fa-espx-saasfaprod1.fa.ocs.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "DTCC",
    token: "dtcc",
    host: "ebxr.fa.us2.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Emerson Electric",
    token: "emersonelectric",
    host: "hdjq.fa.us2.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Nokia",
    token: "nokia",
    host: "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Stantec",
    token: "stantec",
    host: "hdhl.fa.us6.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Texas Instruments",
    token: "texasinstruments",
    host: "edbz.fa.us2.oraclecloud.com",
    site: "CX",
  },
  {
    company: "Verisk",
    token: "verisk",
    host: "fa-ewmy-saasfaprod1.fa.ocs.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "Vertiv",
    token: "vertiv",
    host: "egup.fa.us2.oraclecloud.com",
    site: "CX",
  },
  {
    company: "Williams-Sonoma",
    token: "williamssonoma",
    host: "ehac.fa.us6.oraclecloud.com",
    site: "CX_1",
  },
  {
    company: "WTW",
    token: "wtw",
    host: "eedu.fa.em3.oraclecloud.com",
    site: "CX_1003",
  },
];

interface OrcReq {
  Id?: unknown;
  Title?: unknown;
  PrimaryLocation?: unknown;
  PostedDate?: unknown; // "YYYY-MM-DD"
}

const PAGE = 50;
const MAX_PAGES = 6; // newest ~300 reqs; intern postings are recent in-season

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const oc = c as OracleCompany;
  const out: AtsJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://${oc.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList` +
      `&finder=findReqs;siteNumber=${oc.site},limit=${PAGE},offset=${page * PAGE},sortBy=POSTING_DATES_DESC`;
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
          ? `https://${oc.host}/hcmUI/CandidateExperience/en/sites/${oc.site}/job/${id}`
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

export const oracleSource: Source = {
  name: SOURCE_NAME,
  load: () =>
    loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany, concurrency: 2 }),
};
