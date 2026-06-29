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
  // Verified additions:
  { company: "Cohere", token: "cohere" },
  { company: "Cursor", token: "cursor" },
  { company: "Sierra", token: "sierra" },
  { company: "ElevenLabs", token: "elevenlabs" },
  { company: "Cognition", token: "cognition" },
  { company: "Crusoe", token: "crusoe" },
  { company: "Decagon", token: "decagon" },
  { company: "Writer", token: "writer" },
  { company: "Suno", token: "suno" },
  { company: "Baseten", token: "baseten" },
  { company: "Deepgram", token: "deepgram" },
  { company: "Fireworks AI", token: "fireworksai" },
  { company: "Supabase", token: "supabase" },
  { company: "PostHog", token: "posthog" },
  { company: "Watershed", token: "watershed" },
  { company: "Gamma", token: "gamma" },
  { company: "Mercor", token: "mercor" },
  { company: "Sardine", token: "sardine" },
  { company: "Character.AI", token: "character" },
  { company: "Render", token: "render" },
  { company: "Railway", token: "railway" },
  { company: "Browserbase", token: "browserbase" },
  { company: "Zed", token: "zed" },
  // More verified additions:
  { company: "Harvey", token: "harvey" },
  { company: "Vanta", token: "vanta" },
  { company: "Synthesia", token: "synthesia" },
  { company: "Lovable", token: "lovable" },
  { company: "Drata", token: "drata" },
  { company: "Granola", token: "granola" },
  { company: "Pika", token: "pika" },
  // More verified additions:
  { company: "Runway", token: "runway" },
  { company: "Lambda", token: "lambda" },
  { company: "Cartesia", token: "cartesia" },
  { company: "Physical Intelligence", token: "physicalintelligence" },
  { company: "Sesame", token: "sesame" },
  { company: "Poolside", token: "poolside" },
  { company: "OpenSea", token: "opensea" },
  { company: "Attio", token: "attio" },
  { company: "Standard Bots", token: "standardbots" },
  { company: "Warp", token: "warp" },
  { company: "Distyl", token: "distyl" },
  { company: "Pinecone", token: "pinecone" },
  { company: "Weaviate", token: "weaviate" },
  { company: "Abridge", token: "abridge" },
  { company: "OpenEvidence", token: "openevidence" },
  { company: "Reka AI", token: "reka" },
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
