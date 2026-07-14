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
  { company: "Spotify", token: "spotify" },
  { company: "Mistral AI", token: "mistral" },
  // From speedyapply/2027-SWE-College-Jobs (probed live 2026-07-11):
  { company: "Fluxergy", token: "fluxergy-2" },
  { company: "GenBio AI", token: "genbio" },
  { company: "Hermeus", token: "hermeus" },
  { company: "Plus", token: "plus-2" },
  { company: "Rainmaker", token: "make-rain" },
  { company: "SoloPulse", token: "solopulseco" },
  { company: "Traackr", token: "traackr" },
  // Probed live 2026-07-11 (candidate sweep):
  { company: "Atom Computing", token: "atomcomputing" },
  { company: "Shield AI", token: "shieldai" },
  { company: "Waabi", token: "waabi" },
  { company: "Zoox", token: "zoox" },
  { company: "Belvedere Trading", token: "belvederetrading" },
  { company: "Dexterity", token: "dexterity" },
  { company: "Included Health", token: "includedhealth" },
  // Probed live 2026-07-14 (candidate sweep):
  { company: "Anchorage Digital", token: "anchorage" },
  { company: "Loadsmart", token: "loadsmart" },
  { company: "Merlin Labs", token: "merlinlabs" },
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
