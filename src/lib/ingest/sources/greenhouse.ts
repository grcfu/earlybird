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
