import { fetchJson } from "@/lib/ingest/http";
import { loadAts, parseIsoDate, type AtsCompany, type AtsJob } from "@/lib/ingest/sources/ats";
import type { Source } from "@/lib/ingest/types";

const SOURCE_NAME = "greenhouse";

// Display name -> Greenhouse board token. Tokens verified against
// boards-api.greenhouse.io during development; prune any that 404.
const BOARDS: AtsCompany[] = [
  { company: "Stripe", token: "stripe" },
  { company: "Databricks", token: "databricks" },
  { company: "Airbnb", token: "airbnb" },
  { company: "Robinhood", token: "robinhood" },
  { company: "Coinbase", token: "coinbase" },
  { company: "Instacart", token: "instacart" },
  { company: "Reddit", token: "reddit" },
  { company: "Pinterest", token: "pinterest" },
  { company: "Dropbox", token: "dropbox" },
  { company: "Gusto", token: "gusto" },
  { company: "Brex", token: "brex" },
  { company: "Discord", token: "discord" },
  { company: "Cloudflare", token: "cloudflare" },
  { company: "Asana", token: "asana" },
  { company: "Samsara", token: "samsara" },
  { company: "Affirm", token: "affirm" },
  { company: "Chime", token: "chime" },
  { company: "Gemini", token: "gemini" },
  { company: "Faire", token: "faire" },
  { company: "Flexport", token: "flexport" },
  { company: "Nextdoor", token: "nextdoor" },
  { company: "SoFi", token: "sofi" },
  { company: "Lyft", token: "lyft" },
  { company: "Twilio", token: "twilio" },
  { company: "Anduril", token: "andurilindustries" },
  { company: "Verkada", token: "verkada" },
  { company: "Airtable", token: "airtable" },
  { company: "Toast", token: "toast" },
  { company: "Block", token: "block" },
  // Verified additions:
  { company: "DoorDash", token: "doordashusa" },
  { company: "Datadog", token: "datadog" },
  { company: "Roblox", token: "roblox" },
  { company: "Figma", token: "figma" },
  { company: "GitLab", token: "gitlab" },
  { company: "MongoDB", token: "mongodb" },
  { company: "Elastic", token: "elastic" },
  { company: "Squarespace", token: "squarespace" },
  { company: "Checkr", token: "checkr" },
  { company: "Webflow", token: "webflow" },
  { company: "Okta", token: "okta" },
  { company: "PagerDuty", token: "pagerduty" },
  { company: "Twitch", token: "twitch" },
  { company: "Peloton", token: "peloton" },
  { company: "Scale AI", token: "scaleai" },
  { company: "Anthropic", token: "anthropic" },
  { company: "Nuro", token: "nuro" },
  { company: "Sigma Computing", token: "sigmacomputing" },
  { company: "Grafana", token: "grafanalabs" },
  { company: "Cockroach Labs", token: "cockroachlabs" },
  { company: "ClickHouse", token: "clickhouse" },
  { company: "Temporal", token: "temporaltechnologies" },
  { company: "Fivetran", token: "fivetran" },
  { company: "Hightouch", token: "hightouch" },
  { company: "Duolingo", token: "duolingo" },
  { company: "StockX", token: "stockx" },
  // Quant / trading:
  { company: "Jane Street", token: "janestreet" },
  { company: "Jump Trading", token: "jumptrading" },
  { company: "IMC Trading", token: "imc" },
  { company: "Akuna Capital", token: "akunacapital" },
  { company: "Old Mission Capital", token: "oldmissioncapital" },
  { company: "Tower Research Capital", token: "towerresearchcapital" },
  { company: "PDT Partners", token: "pdtpartners" },
  { company: "Squarepoint Capital", token: "squarepointcapital" },
  { company: "Flow Traders", token: "flowtraders" },
  // More verified additions:
  { company: "Gong", token: "gongio" },
  { company: "LaunchDarkly", token: "launchdarkly" },
  { company: "Lattice", token: "lattice" },
  { company: "Calendly", token: "calendly" },
  { company: "Marqeta", token: "marqeta" },
  { company: "Bill.com", token: "billcom" },
  { company: "Lithic", token: "lithic" },
  { company: "Fireblocks", token: "fireblocks" },
  { company: "Abnormal Security", token: "abnormalsecurity" },
  { company: "Tailscale", token: "tailscale" },
  { company: "Orca Security", token: "orcasecurity" },
  { company: "Dremio", token: "dremio" },
  { company: "Zipline", token: "flyzipline" },
  { company: "Figure", token: "figureai" },
  { company: "Aurora", token: "aurorainnovation" },
  { company: "Stability AI", token: "stabilityai" },
  { company: "Hume AI", token: "humeai" },
  { company: "AssemblyAI", token: "assemblyai" },
  { company: "Imbue", token: "imbue" },
  // More verified additions:
  { company: "xAI", token: "xai" },
  { company: "Waymo", token: "waymo" },
  { company: "Neuralink", token: "neuralink" },
  { company: "CoreWeave", token: "coreweave" },
  { company: "Ripple", token: "ripple" },
  { company: "Riot Games", token: "riotgames" },
  { company: "Epic Games", token: "epicgames" },
  { company: "Box", token: "boxinc" },
  { company: "Postman", token: "postman" },
  { company: "Qualtrics", token: "qualtrics" },
  { company: "Samsung Semiconductor", token: "samsungsemiconductor" },
  { company: "SambaNova", token: "sambanovasystems" },
  { company: "Lucid Motors", token: "lucidmotors" },
  { company: "Wayve", token: "wayve" },
  { company: "Astranis", token: "astranis" },
  { company: "Nubank", token: "nubank" },
  { company: "Recursion", token: "recursionpharmaceuticals" },
  // Quant / trading desks:
  { company: "Point72", token: "point72" },
  { company: "DRW", token: "drweng" },
  { company: "Schonfeld", token: "schonfeld" },
  { company: "Virtu Financial", token: "virtu" },
  { company: "Five Rings", token: "fiveringsllc" },
  { company: "Geneva Trading", token: "genevatrading" },
  { company: "DV Trading", token: "dvtrading" },
  // Fintech / SaaS / other:
  { company: "Adyen", token: "adyen" },
  { company: "Smartsheet", token: "smartsheet" },
  { company: "Carta", token: "carta" },
  { company: "Justworks", token: "justworks" },
  { company: "Highnote", token: "highnote" },
  { company: "Life360", token: "life360" },
  { company: "Komodo Health", token: "komodohealth" },
  { company: "Flatiron Health", token: "flatironhealth" },
  { company: "Vannevar Labs", token: "vannevarlabs" },
  { company: "Rocket Lab", token: "rocketlab" },
  { company: "Man Group", token: "mangroup" },
  { company: "Marshall Wace", token: "marshallwace" },
  { company: "Vatic Labs", token: "vaticlabs" },
  { company: "ZoomInfo", token: "zoominfo" },
  { company: "Betterment", token: "betterment" },
];

interface GhJob {
  title?: unknown;
  absolute_url?: unknown;
  updated_at?: unknown;
  location?: { name?: unknown };
}

async function fetchCompany(c: AtsCompany): Promise<AtsJob[]> {
  const raw = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs?content=false`,
  );
  const jobs = (raw as { jobs?: GhJob[] })?.jobs ?? [];
  return jobs.map((j) => ({
    title: typeof j.title === "string" ? j.title.trim() : "",
    locations: typeof j.location?.name === "string" ? [j.location.name.trim()] : [],
    url: typeof j.absolute_url === "string" ? j.absolute_url : "",
    // Greenhouse's list endpoint exposes updated_at, not a true posted date — a
    // close-enough freshness proxy (new roles have a recent timestamp).
    datePosted: parseIsoDate(j.updated_at),
  }));
}

export const greenhouseSource: Source = {
  name: SOURCE_NAME,
  load: () => loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany }),
};
