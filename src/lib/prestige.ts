// Curated company prestige tiers for the "Top companies" sort. Tier 1 floats
// highest, then Tier 2, then everything else (Tier 3). Matched case-insensitively
// on word boundaries against the listing's company name, so it works for direct
// and aggregator roles alike (e.g. "Google LLC" still matches "google").
//
// This is a deliberately hand-curated ranking — extend the lists to taste.

const TIER1 = [
  // Big tech / large public
  "google", "alphabet", "amazon", "meta", "facebook", "apple", "microsoft",
  "nvidia", "netflix", "tesla", "spacex", "oracle", "ibm", "intel", "qualcomm",
  "cisco", "salesforce", "adobe", "sap", "samsung", "sony", "disney", "comcast",
  "ebay", "dell", "hp", "hpe", "uber", "airbnb", "spotify", "bloomberg",
  // Major finance / banks
  "paypal", "visa", "mastercard", "american express", "wells fargo", "jpmorgan",
  "jpmorgan chase", "goldman sachs", "morgan stanley", "citi", "citigroup",
  "capital one", "bank of america", "blackrock",
  // Top quant / trading
  "jane street", "citadel", "citadel securities", "two sigma", "jump trading",
  "hudson river trading", "de shaw", "point72", "drw", "optiver", "imc",
  "akuna capital", "tower research", "squarepoint", "schonfeld", "virtu",
  "millennium", "balyasny", "five rings",
  // Top tech / AI
  "stripe", "databricks", "openai", "anthropic", "xai", "palantir", "snowflake",
  "coinbase", "doordash", "pinterest", "reddit", "robinhood", "waymo", "scale ai",
];

const TIER2 = [
  "notion", "ramp", "brex", "plaid", "instacart", "lyft", "twitch", "roblox",
  "gitlab", "cloudflare", "okta", "affirm", "chime", "sofi", "gusto", "asana",
  "toast", "block", "square", "duolingo", "discord", "perplexity", "cohere",
  "mistral", "cursor", "replit", "rippling", "airtable", "samsara", "verkada",
  "anduril", "flexport", "faire", "nubank", "ripple", "epic games", "riot games",
  "box", "postman", "carta", "adyen", "grafana", "cockroach", "clickhouse",
  "elastic", "fivetran", "lambda", "coreweave", "runway", "sierra", "harvey",
  "vanta", "crusoe", "cognition", "elevenlabs", "gong", "figma", "datadog",
  "mongodb", "neuralink", "lucid", "nuro", "aurora", "zipline", "figure",
  "qualtrics", "smartsheet", "western digital", "bosch", "continental",
  "experian", "target", "autodesk", "samsung semiconductor",
];

// Build a Postgres ARE pattern: \m(name1|name2|...)\M (word-boundaried).
function toPattern(names: string[]): string {
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return "\\m(" + escaped.join("|") + ")\\M";
}

export const TIER1_PATTERN = toPattern(TIER1);
export const TIER2_PATTERN = toPattern(TIER2);
