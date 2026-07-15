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
  // Verified additions:
  {
    company: "Adobe",
    token: "adobe",
    host: "adobe.wd5.myworkdayjobs.com",
    site: "external_experienced",
  },
  {
    company: "Mastercard",
    token: "mastercard",
    host: "mastercard.wd1.myworkdayjobs.com",
    site: "CorporateCareers",
  },
  {
    company: "Comcast",
    token: "comcast",
    host: "comcast.wd5.myworkdayjobs.com",
    site: "Comcast_Careers",
  },
  {
    company: "PayPal",
    token: "paypal",
    host: "paypal.wd1.myworkdayjobs.com",
    site: "jobs",
  },
  {
    company: "Citi",
    token: "citi",
    host: "citi.wd5.myworkdayjobs.com",
    site: "2",
  },
  {
    company: "Target",
    token: "target",
    host: "target.wd5.myworkdayjobs.com",
    site: "targetcareers",
  },
  {
    company: "Morgan Stanley",
    token: "ms",
    host: "ms.wd5.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "eBay",
    token: "ebay",
    host: "ebay.wd5.myworkdayjobs.com",
    site: "apply",
  },
  {
    company: "HP",
    token: "hp",
    host: "hp.wd5.myworkdayjobs.com",
    site: "ExternalCareerSite",
  },
  {
    company: "HPE",
    token: "hpe",
    host: "hpe.wd5.myworkdayjobs.com",
    site: "Jobsathpe",
  },
  {
    company: "Autodesk",
    token: "autodesk",
    host: "autodesk.wd1.myworkdayjobs.com",
    site: "Ext",
  },
  {
    company: "Disney",
    token: "disney",
    host: "disney.wd5.myworkdayjobs.com",
    site: "disneycareer",
  },
  {
    company: "Dell",
    token: "dell",
    host: "dell.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "CrowdStrike",
    token: "crowdstrike",
    host: "crowdstrike.wd5.myworkdayjobs.com",
    site: "crowdstrikecareers",
  },
  {
    company: "Micron",
    token: "micron",
    host: "micron.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Applied Materials",
    token: "amat",
    host: "amat.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Analog Devices",
    token: "analogdevices",
    host: "analogdevices.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "KLA",
    token: "kla",
    host: "kla.wd1.myworkdayjobs.com",
    site: "Search",
  },
  {
    company: "GlobalFoundries",
    token: "globalfoundries",
    host: "globalfoundries.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Broadcom",
    token: "broadcom",
    host: "broadcom.wd1.myworkdayjobs.com",
    site: "External_Career",
  },
  {
    company: "Marvell",
    token: "marvell",
    host: "marvell.wd1.myworkdayjobs.com",
    site: "MarvellCareers2",
  },
  {
    company: "BlackRock",
    token: "blackrock",
    host: "blackrock.wd1.myworkdayjobs.com",
    site: "BlackRock_Professional",
  },
  {
    company: "Fidelity",
    token: "fmr",
    host: "wd1.myworkdaysite.com",
    site: "FidelityCareers",
  },
  {
    company: "Cadence",
    token: "cadence",
    host: "cadence.wd1.myworkdayjobs.com",
    site: "External_Careers",
  },
  {
    company: "Capital One",
    token: "capitalone",
    host: "capitalone.wd12.myworkdayjobs.com",
    site: "Capital_One",
  },
  {
    company: "Bank of America",
    token: "ghr",
    host: "ghr.wd1.myworkdayjobs.com",
    site: "lateral-us",
  },
  {
    company: "Amgen",
    token: "amgen",
    host: "amgen.wd1.myworkdayjobs.com",
    site: "Careers",
  },
  {
    company: "Booz Allen",
    token: "bah",
    host: "bah.wd1.myworkdayjobs.com",
    site: "BAH_Jobs",
  },
  {
    company: "Gilead",
    token: "gilead",
    host: "gilead.wd1.myworkdayjobs.com",
    site: "gileadcareers",
  },
  {
    company: "Leidos",
    token: "leidos",
    host: "leidos.wd5.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "MITRE",
    token: "mitre",
    host: "mitre.wd5.myworkdayjobs.com",
    site: "MITRE",
  },
  // From speedyapply/2027-SWE-College-Jobs (CXS probed live 2026-07-11):
  {
    company: "AeroVironment",
    token: "avav",
    host: "avav.wd1.myworkdayjobs.com",
    site: "avav",
  },
  {
    company: "Altasciences",
    token: "altasciences",
    host: "altasciences.wd1.myworkdayjobs.com",
    site: "careers",
  },
  {
    company: "Blue Origin",
    token: "blueorigin",
    host: "blueorigin.wd5.myworkdayjobs.com",
    site: "blueorigin",
  },
  {
    company: "BorgWarner",
    token: "borgwarner",
    host: "borgwarner.wd5.myworkdayjobs.com",
    site: "borgwarner_careers",
  },
  {
    company: "Brunswick",
    token: "brunswick",
    host: "brunswick.wd1.myworkdayjobs.com",
    site: "search",
  },
  {
    company: "Copart",
    token: "copart",
    host: "copart.wd12.myworkdayjobs.com",
    site: "copart",
  },
  {
    company: "DMA",
    token: "dmainc",
    host: "dmainc.wd5.myworkdayjobs.com",
    site: "dma",
  },
  {
    company: "GE Vernova",
    token: "gevernova",
    host: "gevernova.wd5.myworkdayjobs.com",
    site: "only_confidential_executive_recruiting",
  },
  {
    company: "Generac",
    token: "generac",
    host: "generac.wd5.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Insuresoft",
    token: "brilliancanada",
    host: "brilliancanada.wd3.myworkdayjobs.com",
    site: "insuresoft",
  },
  {
    company: "Motorola Solutions",
    token: "motorolasolutions",
    host: "motorolasolutions.wd5.myworkdayjobs.com",
    site: "careers",
  },
  {
    company: "Nidec",
    token: "nidec",
    host: "nidec.wd1.myworkdayjobs.com",
    site: "nidec",
  },
  {
    company: "Nightwing",
    token: "nwis",
    host: "nwis.wd12.myworkdayjobs.com",
    site: "nw",
  },
  {
    company: "SEL",
    token: "selinc",
    host: "selinc.wd1.myworkdayjobs.com",
    site: "sel",
  },
  {
    company: "Sony",
    token: "sonyglobal",
    host: "sonyglobal.wd1.myworkdayjobs.com",
    site: "sonyglobalcareers",
  },
  {
    company: "Synchrony Bank",
    token: "synchronyfinancial",
    host: "synchronyfinancial.wd5.myworkdayjobs.com",
    site: "university",
  },
  {
    company: "Tencent",
    token: "tencent",
    host: "tencent.wd1.myworkdayjobs.com",
    site: "tencent_careers",
  },
  {
    company: "Washington University in St. Louis",
    token: "wustl",
    host: "wustl.wd1.myworkdayjobs.com",
    site: "external",
  },
  // Big-name boards: tenant grepped from careers HTML + CXS-confirmed 2026-07-14.
  {
    company: "Johnson & Johnson",
    token: "jj",
    host: "jj.wd5.myworkdayjobs.com",
    site: "JJ",
  },
  {
    company: "T-Mobile",
    token: "tmobile",
    host: "tmobile.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "CVS Health",
    token: "cvshealth",
    host: "cvshealth.wd1.myworkdayjobs.com",
    site: "CVS_Health_Careers",
  },
  {
    company: "3M",
    token: "3m",
    host: "3m.wd1.myworkdayjobs.com",
    site: "Search",
  },
  {
    company: "Nike",
    token: "nike",
    host: "nike.wd1.myworkdayjobs.com",
    site: "nke",
  },
  {
    company: "Merck",
    token: "msd",
    host: "msd.wd5.myworkdayjobs.com",
    site: "SearchJobs",
  },
  {
    company: "Boeing",
    token: "boeing",
    host: "boeing.wd1.myworkdayjobs.com",
    site: "EXTERNAL_CAREERS",
  },
  {
    company: "Chevron",
    token: "chevron",
    host: "chevron.wd5.myworkdayjobs.com",
    site: "jobs",
  },
  {
    company: "Pfizer",
    token: "pfizer",
    host: "pfizer.wd1.myworkdayjobs.com",
    site: "PfizerCareers",
  },
  // More big-name boards: tenant grepped from careers HTML + CXS-confirmed 2026-07-14.
  {
    company: "Eli Lilly",
    token: "lilly",
    host: "lilly.wd115.myworkdayjobs.com",
    site: "LLY",
  },
  {
    company: "Abbott",
    token: "abbott",
    host: "abbott.wd5.myworkdayjobs.com",
    site: "abbottcareers",
  },
  {
    company: "Stryker",
    token: "stryker",
    host: "stryker.wd1.myworkdayjobs.com",
    site: "StrykerCareers",
  },
  {
    company: "Becton Dickinson",
    token: "bdx",
    host: "bdx.wd1.myworkdayjobs.com",
    site: "EXTERNAL_CAREER_SITE_USA",
  },
  {
    company: "Thermo Fisher Scientific",
    token: "thermofisher",
    host: "thermofisher.wd5.myworkdayjobs.com",
    site: "ThermoFisherCareers",
  },
  {
    company: "Danaher",
    token: "danaher",
    host: "danaher.wd1.myworkdayjobs.com",
    site: "DanaherJobs",
  },
  {
    company: "Cigna",
    token: "cigna",
    host: "cigna.wd5.myworkdayjobs.com",
    site: "cignacareers",
  },
  {
    company: "Elevance Health",
    token: "elevancehealth",
    host: "elevancehealth.wd1.myworkdayjobs.com",
    site: "ANT",
  },
  {
    company: "US Bank",
    token: "usbank",
    host: "usbank.wd1.myworkdayjobs.com",
    site: "US_Bank_Careers",
  },
  {
    company: "KeyBank",
    token: "keybank",
    host: "keybank.wd5.myworkdayjobs.com",
    site: "External_Career_Site",
  },
  {
    company: "State Street",
    token: "statestreet",
    host: "statestreet.wd1.myworkdayjobs.com",
    site: "Global",
  },
  {
    company: "Northern Trust",
    token: "ntrs",
    host: "ntrs.wd1.myworkdayjobs.com",
    site: "northerntrust",
  },
  {
    company: "Northrop Grumman",
    token: "ngc",
    host: "ngc.wd1.myworkdayjobs.com",
    site: "Northrop_Grumman_External_Site",
  },
  {
    company: "Johnson Controls",
    token: "jci",
    host: "jci.wd5.myworkdayjobs.com",
    site: "JCI",
  },
  {
    company: "ConocoPhillips",
    token: "conocophillips",
    host: "conocophillips.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Duke Energy",
    token: "dukeenergy",
    host: "dukeenergy.wd1.myworkdayjobs.com",
    site: "search",
  },
  {
    company: "Otis",
    token: "otis",
    host: "otis.wd5.myworkdayjobs.com",
    site: "REC_Ext_Gateway",
  },
  {
    company: "Tapestry",
    token: "tapestry",
    host: "tapestry.wd108.myworkdayjobs.com",
    site: "Tapestry_Careers",
  },
  {
    company: "Nordstrom",
    token: "nordstrom",
    host: "nordstrom.wd501.myworkdayjobs.com",
    site: "nordstrom_careers",
  },
  {
    company: "Worldpay",
    token: "worldpay",
    host: "worldpay.wd5.myworkdayjobs.com",
    site: "Worldpay_External_Careers_Site",
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
