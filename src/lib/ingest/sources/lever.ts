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
  // Probed live 2026-07-14 (candidate sweep, batch 2):
  { company: "Metabase", token: "metabase" },
  { company: "Pickle Robot", token: "picklerobot" },
  { company: "Sysdig", token: "sysdig" },
  // Robotics (probed 2026-07-21):
  { company: "Bright Machines", token: "brightmachines" },
  // aggregator-mined direct boards, batch 1 (2026-07-22)
  { company: "Acceldata", token: "acceldata" },
  { company: "Achievers", token: "achievers" },
  { company: "Actian", token: "actian" },
  { company: "Aledade", token: "aledade" },
  { company: "Alertus Technologies", token: "alertus" },
  { company: "Allegiant Air", token: "allegiantair" },
  { company: "AllTrails", token: "alltrails" },
  { company: "AltaML", token: "altaml" },
  { company: "Analytic Partners", token: "analyticpartners" },
  { company: "Anomali", token: "anomali" },
  { company: "Appen", token: "appen-2" },
  { company: "Aquabyte", token: "aquabyte" },
  { company: "ArteraAI", token: "artera" },
  { company: "BenchSci", token: "benchsci" },
  { company: "Behaviour Interactive", token: "bhvr" },
  { company: "BioAgilytix", token: "bioagilytix" },
  { company: "Brooks Running", token: "brooksrunning" },
  { company: "Cirque du Soleil", token: "cirquedusoleil" },
  { company: "CLO Virtual Fashion", token: "clovirtualfashion" },
  { company: "Coupa Software", token: "coupa" },
  { company: "Crest Industries", token: "crestoperations" },
  { company: "Daniels Health", token: "daniels-sharpsmart" },
  { company: "Democratic Governors Association", token: "dga" },
  { company: "Diversified Automation", token: "diversified-automation" },
  { company: "OraSure Technologies", token: "dnagenotek" },
  { company: "HRL Laboratories", token: "dodmg" },
  { company: "Drivemode", token: "drivemode" },
  { company: "Lightcast", token: "economicmodeling" },
  { company: "Ekimetrics", token: "ekimetrics" },
  { company: "Elf Beauty", token: "elfbeauty" },
  { company: "Endpoint Clinical", token: "endpointclinical" },
  { company: "EQ Bank", token: "eqbank" },
  { company: "Equativ", token: "equativ" },
  { company: "Empire State Realty Trust", token: "esrtreit" },
  { company: "EV Realty", token: "evrealty-us" },
  { company: "Exowatt", token: "exowatt" },
  { company: "Extreme Networks", token: "extremenetworks" },
  { company: "Farfetch", token: "farfetch" },
  { company: "Fehr & Peers", token: "fehrandpeers" },
  { company: "Field AI", token: "field-ai" },
  { company: "Firemon", token: "firemon" },
  { company: "Fullscript", token: "fullscript" },
  { company: "GeoComply", token: "geocomply-2" },
  { company: "Cloudforce", token: "go-cloudforce" },
  { company: "GoMaterials", token: "gomaterials" },
  { company: "Gr0", token: "gr0" },
  { company: "Great Gray", token: "great-gray-group" },
  { company: "Greenlight", token: "greenlight" },
  { company: "Hanna Andersson", token: "hannaandersson" },
  { company: "Ibility", token: "ibility" },
  { company: "Ideas United", token: "ideasunited" },
  { company: "Institute of Foundation Models", token: "ifm-us" },
  { company: "IMO Health", token: "imo-online" },
  { company: "Intropic", token: "intropic" },
  { company: "ION Group", token: "ion" },
  { company: "ispace", token: "ispace-inc" },
  { company: "Kabam", token: "kabam" },
  { company: "Kepler Communications", token: "kepler" },
  { company: "Kpler", token: "kpler" },
  { company: "Larian Studios", token: "larian" },
  { company: "Lendbuzz", token: "lendbuzz" },
  { company: "Level AI", token: "levelai" },
  { company: "Lexeo Therapeutics", token: "lexeotx" },
  { company: "Link", token: "linkllc" },
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
