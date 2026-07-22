import { fetchJson } from "@/lib/ingest/http";
import { loadAts, parseIsoDate, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "smartrecruiters";

// Display name -> SmartRecruiters company identifier.
const BOARDS: AtsCompany[] = [
  { company: "Visa", token: "Visa" },
  { company: "Bosch", token: "BoschGroup" },
  { company: "Western Digital", token: "WesternDigital" },
  { company: "Continental", token: "Continental" },
  { company: "Experian", token: "Experian" },
  { company: "Public Storage", token: "PublicStorage" },
  { company: "CACI", token: "CACI" },
  // Probed live 2026-07-14:
  { company: "NielsenIQ", token: "NielsenIQ" },
  // aggregator-mined direct boards (2026-07-22)
  { company: "3S Business Corporation", token: "3sbusinesscorporationinc1" },
  { company: "AbbVie", token: "abbvie" },
  { company: "Accel Learning", token: "accellearning" },
  { company: "Accor", token: "accorcorpo" },
  { company: "AECOM", token: "aecom2" },
  { company: "AG Technologies", token: "agtechnologies1" },
  { company: "Allegis Global Solutions", token: "allegisglobalsolutions" },
  { company: "Analysys Mason", token: "analysysmason1" },
  { company: "Apex Clean Energy", token: "apexcleanenergy" },
  { company: "Arista Networks", token: "aristanetworks" },
  { company: "Ask IT Consulting", token: "askitconsulting" },
  { company: "Assent", token: "assent" },
  { company: "Atria Group", token: "atriagroupllc" },
  { company: "Avery Dennison", token: "averydennison" },
  { company: "Barkback", token: "barkbackllc" },
  { company: "BCforward", token: "bcforward3" },
  { company: "BlinqLABS", token: "blinqlabs" },
  { company: "California ISO", token: "californiaiso" },
  { company: "City of Philadelphia", token: "cityofphiladelphia" },
  { company: "Codeage", token: "codeage" },
  { company: "Collabera", token: "collabera2" },
  { company: "Huxley", token: "computerfutures3" },
  { company: "Comtech", token: "comtechllc2" },
  { company: "Cornerstone Building Brands", token: "cornerstonebuildingbrandscareers" },
  { company: "Crown Innovations", token: "crowninnovationsinc" },
  { company: "Deegit", token: "deegitinc3" },
  { company: "Dexterra Group", token: "dexterra" },
  { company: "Eataly", token: "eataly" },
  { company: "Egis Group", token: "egisgroup" },
  { company: "Eurofins", token: "eurofins" },
  { company: "EVERSANA", token: "eversana1" },
  { company: "Expeditors", token: "expeditors" },
  { company: "Flywire", token: "flywire1" },
  { company: "Freshworks", token: "freshworks" },
  { company: "General Dynamics UK", token: "gdmsi" },
  { company: "Global Channel Management", token: "globalchannelmanagementinc" },
  { company: "Harvard University", token: "harvarduniversity" },
  { company: "HireVue", token: "hirevue" },
  { company: "Horizon Technologies", token: "horizontechnologiesinc" },
  { company: "IFS", token: "ifs1" },
  { company: "InfiniteQuant", token: "infinitequant" },
  { company: "Infojini", token: "infojiniinc1" },
  { company: "Integrated Resources", token: "integratedresourcesinc" },
  { company: "Intelerad", token: "intelerad" },
  { company: "Intuitive Surgical", token: "intuitive" },
  { company: "MAXISIQ", token: "iomaxisllc" },
  { company: "Jobs for Humanity", token: "jobsforhumanity" },
  { company: "Kanshe Infotech", token: "kansheinfotech" },
  { company: "Kioxia", token: "kioxia" },
  { company: "LAXIR", token: "laxir1" },
  { company: "Kanshe Infotech", token: "learnkwikcom" },
  { company: "Legal & General", token: "legalandgeneral" },
  { company: "LinkedIn", token: "linkedin3" },
  { company: "Lawrence Livermore National Laboratory (LLNL)", token: "llnl" },
  { company: "Louis Dreyfus Company", token: "louisdreyfuscompany" },
  { company: "MAT Holdings", token: "matholdings" },
  { company: "Mattel", token: "mattelinc" },
  { company: "MSX International", token: "msxinternational" },
  { company: "NBCUniversal", token: "nbcuniversal3" },
  { company: "NEC Software Solutions", token: "necsws" },
  { company: "Nexthink", token: "nexthink" },
  { company: "Northwestern Mutual", token: "northwesternmutual" },
  { company: "Oxfam International", token: "oxfamamerica2" },
  { company: "PA Consulting", token: "paconsulting" },
  { company: "Proximate Technologies", token: "proximatetechnologiesinc1" },
  { company: "Radius Limited", token: "radiuslimited" },
  { company: "Ramboll", token: "ramboll3" },
  { company: "Red Bull", token: "redbull" },
  { company: "RESPEC", token: "respecinc" },
  { company: "RR Donnelley", token: "rrdonnelley" },
  { company: "Sajix", token: "sajixsoftwaresolutionprivatelimited" },
  { company: "Sandisk", token: "sandisk" },
  { company: "SA Technologies", token: "satechnologiesinc4" },
  { company: "ServiceNow", token: "servicenow" },
  { company: "Soci\u00e9t\u00e9 G\u00e9n\u00e9rale de Surveillance (SGS)", token: "sgs" },
  { company: "Sika", token: "sikaag" },
  { company: "Skyward", token: "skyward1" },
  { company: "Smiths Detection Group", token: "smithsgroup2" },
  { company: "Solidigm", token: "solidigm" },
  { company: "SOMFY Group", token: "somfygroup" },
  { company: "Spring Venture Group", token: "springventuregroup1" },
  { company: "STCU", token: "stcu1" },
  { company: "STEM Expert", token: "stemxpert1" },
  { company: "System Canada Technologies", token: "systemcanadatechnologies" },
  { company: "Nielsen", token: "thenielsencompany" },
  { company: "The Wonderful Company", token: "thewonderfulcompany" },
  { company: "Treehouse Strategy and Communications", token: "treehousestrategyandcommunicatio" },
  { company: "University Health Network", token: "universityhealthnetwork" },
  { company: "USM Business Systems", token: "usm2" },
  { company: "Veolia", token: "veoliaenvironnementsa" },
  { company: "Wabtec", token: "wabtec" },
  { company: "Wellmark", token: "wellmarkinc" },
  { company: "Westgate Resorts", token: "westgateresorts" },
];

interface SrPosting {
  id?: unknown;
  name?: unknown;
  releasedDate?: unknown;
  location?: {
    city?: unknown;
    region?: unknown;
    fullLocation?: unknown;
    remote?: unknown;
  };
}

const PAGE = 100;
const MAX_PAGES = 3;

function srLocation(loc: SrPosting["location"]): string[] {
  if (!loc) return [];
  if (typeof loc.fullLocation === "string" && loc.fullLocation.trim()) {
    return [loc.fullLocation.trim()];
  }
  const parts = [loc.city, loc.region].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (parts.length) return [parts.join(", ")];
  return loc.remote ? ["Remote"] : [];
}

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const out: AtsJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    // q=intern narrows big boards (Bosch has 4000+ roles) to relevant results.
    const raw = (await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${c.token}/postings` +
        `?q=intern&limit=${PAGE}&offset=${page * PAGE}`,
    )) as { content?: SrPosting[] };
    const items = raw?.content ?? [];
    for (const p of items) {
      const id = typeof p.id === "string" ? p.id : p.id != null ? String(p.id) : "";
      out.push({
        title: typeof p.name === "string" ? p.name.trim() : "",
        locations: srLocation(p.location),
        url: id ? `https://jobs.smartrecruiters.com/${c.token}/${id}` : "",
        datePosted: parseIsoDate(p.releasedDate),
      });
    }
    if (items.length < PAGE) break;
  }
  return out;
}

export const smartRecruitersSource: Source = {
  name: SOURCE_NAME,
  load: () =>
    loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany, concurrency: 4 }),
};
