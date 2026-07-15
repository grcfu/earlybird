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
