// Which country a posting is in, as an ISO-3166 alpha-2 code, or null when we
// genuinely can't tell.
//
// This replaces the query-time "does this string look foreign" denylist, which
// could only ever recognize names somebody had typed into it: it read "Munich"
// but not "München", "Amsterdam" but not "Eindhoven", "China" but not "PRC".
// Three of the ATS APIs report a real country per posting, so for those the
// answer is looked up rather than guessed; the rest fall back to reading the
// location string, which is what the rest of this file is for.
//
// Deliberately three-valued. "Unknown" is a real answer — Workday boards often
// say "5 Locations" and nothing else — and callers decide what to do with it,
// rather than it being silently folded into "not US".

// Strip diacritics so one ASCII key matches every spelling: München→munchen,
// Vallès→valles, Zürich→zurich, São Paulo→sao paulo.
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Country names and codes as they actually appear in location strings. Includes
// the aliases that broke the old list: PRC for China, UK for GB, Holland, UAE.
const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", "u.s.": "US",
  "u.s.a.": "US", us: "US", america: "US",
  canada: "CA", can: "CA",
  mexico: "MX", mex: "MX",
  "united kingdom": "GB", uk: "GB", gb: "GB", gbr: "GB", england: "GB",
  scotland: "GB", wales: "GB", britain: "GB", "great britain": "GB",
  "northern ireland": "GB",
  ireland: "IE", eire: "IE", ie: "IE", irl: "IE",
  germany: "DE", deutschland: "DE", deu: "DE", ger: "DE",
  france: "FR", fra: "FR",
  spain: "ES", espana: "ES", esp: "ES",
  portugal: "PT", prt: "PT",
  italy: "IT", italia: "IT", ita: "IT",
  netherlands: "NL", holland: "NL", nederland: "NL", nld: "NL",
  belgium: "BE", belgique: "BE", bel: "BE",
  luxembourg: "LU", lux: "LU",
  switzerland: "CH", suisse: "CH", schweiz: "CH", che: "CH",
  austria: "AT", osterreich: "AT", aut: "AT",
  sweden: "SE", sverige: "SE", swe: "SE",
  norway: "NO", norge: "NO", nor: "NO",
  denmark: "DK", danmark: "DK", dnk: "DK",
  finland: "FI", suomi: "FI", fin: "FI",
  iceland: "IS", isl: "IS",
  poland: "PL", polska: "PL", pol: "PL",
  "czech republic": "CZ", czechia: "CZ", cze: "CZ",
  slovakia: "SK", svk: "SK",
  hungary: "HU", hun: "HU",
  romania: "RO", rou: "RO",
  bulgaria: "BG", bgr: "BG",
  greece: "GR", grc: "GR",
  turkey: "TR", turkiye: "TR", tur: "TR",
  russia: "RU", rus: "RU",
  ukraine: "UA", ukr: "UA",
  serbia: "RS", croatia: "HR", slovenia: "SI", estonia: "EE", latvia: "LV",
  lithuania: "LT", belarus: "BY", cyprus: "CY", malta: "MT",
  india: "IN", ind: "IN", bharat: "IN",
  china: "CN", prc: "CN", "p.r.c.": "CN", "peoples republic of china": "CN", chn: "CN",
  "hong kong": "HK", hkg: "HK", macau: "MO", taiwan: "TW", twn: "TW",
  japan: "JP", jpn: "JP", nippon: "JP",
  "south korea": "KR", korea: "KR", "republic of korea": "KR", kor: "KR",
  singapore: "SG", sgp: "SG",
  thailand: "TH", tha: "TH",
  vietnam: "VN", "viet nam": "VN", vnm: "VN",
  philippines: "PH", phl: "PH",
  malaysia: "MY", mys: "MY",
  indonesia: "ID", idn: "ID",
  cambodia: "KH", laos: "LA", myanmar: "MM", burma: "MM",
  australia: "AU", aus: "AU",
  "new zealand": "NZ", nz: "NZ", nzl: "NZ",
  brazil: "BR", brasil: "BR", bra: "BR",
  argentina: "AR", arg: "AR",
  chile: "CL", colombia: "CO", peru: "PE", uruguay: "UY", ecuador: "EC",
  venezuela: "VE", bolivia: "BO", paraguay: "PY", panama: "PA", "costa rica": "CR",
  guatemala: "GT", honduras: "HN", "el salvador": "SV", nicaragua: "NI",
  "dominican republic": "DO", "puerto rico": "US", // PR is US territory
  israel: "IL", isr: "IL",
  "united arab emirates": "AE", uae: "AE", are: "AE",
  "saudi arabia": "SA", sau: "SA", qatar: "QA", kuwait: "KW", bahrain: "BH",
  oman: "OM", jordan: "JO", lebanon: "LB",
  egypt: "EG", egy: "EG", morocco: "MA", tunisia: "TN", algeria: "DZ",
  "south africa": "ZA", zaf: "ZA", nigeria: "NG", nga: "NG", kenya: "KE",
  ghana: "GH", ethiopia: "ET", tanzania: "TZ", uganda: "UG", rwanda: "RW",
  pakistan: "PK", pak: "PK", bangladesh: "BD", bgd: "BD", "sri lanka": "LK",
  nepal: "NP", "kazakhstan": "KZ", uzbekistan: "UZ", azerbaijan: "AZ",
  armenia: "AM", // no entry for Georgia the country: "georgia" reads as the US state
};

// US states + DC + territories, both codes and names. The two-letter codes are
// only trusted as a comma-separated component ("Austin, TX"), since half of
// them collide with country codes — CA/DE/IN/LA/OR/PA all mean something else.
const US_STATE_CODES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc","pr","vi","gu",
]);
const US_STATE_NAMES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
  "district of columbia","washington dc","washington d.c.",
]);

// Bare city names, for the many boards that print a city and nothing else.
// Only cities with no meaningful namesake on the other side of the split.
const US_CITIES = [
  "new york city","nyc","san francisco","sf","bay area","silicon valley",
  "los angeles","san jose","san diego","seattle","bellevue","redmond","austin",
  "chicago","boston","cambridge, ma","denver","boulder","atlanta","dallas",
  "houston","philadelphia","pittsburgh","phoenix","tempe","scottsdale",
  "minneapolis","st. louis","saint louis","detroit","ann arbor","cleveland",
  "columbus","cincinnati","indianapolis","nashville","charlotte","raleigh",
  "durham","chapel hill","miami","orlando","tampa","jacksonville",
  "salt lake city","las vegas","reno","portland","sacramento","san mateo",
  "palo alto","mountain view","sunnyvale","santa clara","cupertino","fremont",
  "menlo park","redwood city","oakland","berkeley","irvine","pasadena",
  "santa monica","san bruno","burlingame","foster city","milpitas",
  "scotts valley","culver city","el segundo","kansas city","omaha",
  "des moines","madison","milwaukee","louisville","memphis","new orleans",
  "oklahoma city","tulsa","albuquerque","tucson","boise","spokane","tacoma",
  "arlington, va","alexandria, va","bethesda","rockville","reston","mclean",
  "herndon","annapolis","baltimore","wilmington, de","princeton","hoboken",
  "jersey city","stamford","hartford","new haven","providence","buffalo",
  "rochester, ny","syracuse","albany","white plains","armonk","purchase, ny",
];

// Foreign cities, including the spellings and abbreviations the old denylist
// missed. Value is the country the city is in.
const FOREIGN_CITIES: Record<string, string> = {
  // UK / Ireland
  london: "GB", manchester: "GB", birmingham: "GB", leeds: "GB", glasgow: "GB",
  edinburgh: "GB", bristol: "GB", "cambridge, uk": "GB", oxford: "GB",
  belfast: "GB", cardiff: "GB", sheffield: "GB", liverpool: "GB",
  newcastle: "GB", nottingham: "GB", southampton: "GB", "reading, uk": "GB",
  dublin: "IE", cork: "IE", galway: "IE", limerick: "IE",
  // Germany / Austria / Switzerland
  munich: "DE", munchen: "DE", berlin: "DE", hamburg: "DE", frankfurt: "DE",
  cologne: "DE", koln: "DE", stuttgart: "DE", dusseldorf: "DE", dortmund: "DE",
  essen: "DE", leipzig: "DE", dresden: "DE", hannover: "DE", nuremberg: "DE",
  nurnberg: "DE", bonn: "DE", aachen: "DE", karlsruhe: "DE", mannheim: "DE",
  freiburg: "DE", heidelberg: "DE", darmstadt: "DE", regensburg: "DE",
  wolfsburg: "DE", ingolstadt: "DE", ulm: "DE", kassel: "DE", bremen: "DE",
  vienna: "AT", wien: "AT", graz: "AT", linz: "AT", salzburg: "AT",
  innsbruck: "AT", gratkorn: "AT", villach: "AT",
  zurich: "CH", geneva: "CH", geneve: "CH", basel: "CH", lausanne: "CH",
  bern: "CH", lugano: "CH", meyrin: "CH", winterthur: "CH", zug: "CH",
  // Netherlands / Belgium / Nordics
  amsterdam: "NL", rotterdam: "NL", "the hague": "NL", "den haag": "NL",
  utrecht: "NL", eindhoven: "NL", veldhoven: "NL", nijmegen: "NL", delft: "NL",
  leiden: "NL", groningen: "NL", tilburg: "NL", enschede: "NL", arnhem: "NL",
  breda: "NL", hilversum: "NL", almere: "NL",
  brussels: "BE", bruxelles: "BE", antwerp: "BE", antwerpen: "BE", ghent: "BE",
  gent: "BE", leuven: "BE", liege: "BE", mechelen: "BE",
  stockholm: "SE", gothenburg: "SE", goteborg: "SE", malmo: "SE",
  uppsala: "SE", lund: "SE", linkoping: "SE",
  copenhagen: "DK", kobenhavn: "DK", aarhus: "DK", odense: "DK", aalborg: "DK",
  oslo: "NO", bergen: "NO", trondheim: "NO", stavanger: "NO",
  helsinki: "FI", espoo: "FI", tampere: "FI", oulu: "FI", turku: "FI",
  reykjavik: "IS",
  // France / Iberia / Italy
  paris: "FR", lyon: "FR", toulouse: "FR", marseille: "FR", bordeaux: "FR",
  lille: "FR", nantes: "FR", rennes: "FR", grenoble: "FR", nice: "FR",
  strasbourg: "FR", montpellier: "FR", "sophia antipolis": "FR",
  "aix-en-provence": "FR", versailles: "FR", toulon: "FR",
  madrid: "ES", barcelona: "ES", "sant cugat": "ES", "sant cugat del valles": "ES",
  valencia: "ES", sevilla: "ES", seville: "ES", zaragoza: "ES", bilbao: "ES",
  malaga: "ES", murcia: "ES", "palma de mallorca": "ES", martos: "ES",
  valladolid: "ES", "a coruna": "ES", granada: "ES",
  lisbon: "PT", lisboa: "PT", porto: "PT", braga: "PT", coimbra: "PT",
  milan: "IT", milano: "IT", rome: "IT", roma: "IT", turin: "IT", torino: "IT",
  naples: "IT", napoli: "IT", bologna: "IT", florence: "IT", firenze: "IT",
  genoa: "IT", genova: "IT", venice: "IT", venezia: "IT", padova: "IT",
  catania: "IT", palermo: "IT", bari: "IT", verona: "IT", modena: "IT",
  // Central & Eastern Europe
  warsaw: "PL", warszawa: "PL", krakow: "PL", cracow: "PL", wroclaw: "PL",
  gdansk: "PL", poznan: "PL", lodz: "PL", katowice: "PL", szczecin: "PL",
  prague: "CZ", praha: "CZ", brno: "CZ", ostrava: "CZ",
  bratislava: "SK", kosice: "SK",
  budapest: "HU", debrecen: "HU", szeged: "HU",
  bucharest: "RO", bucuresti: "RO", "cluj-napoca": "RO", cluj: "RO",
  timisoara: "RO", iasi: "RO", brasov: "RO",
  sofia: "BG", plovdiv: "BG",
  athens: "GR", thessaloniki: "GR",
  istanbul: "TR", ankara: "TR", izmir: "TR",
  moscow: "RU", "st petersburg": "RU", "saint petersburg": "RU",
  kyiv: "UA", kiev: "UA", lviv: "UA", kharkiv: "UA",
  belgrade: "RS", zagreb: "HR", ljubljana: "SI", tallinn: "EE", riga: "LV",
  vilnius: "LT", minsk: "BY", nicosia: "CY",
  // Middle East / Africa
  "tel aviv": "IL", jerusalem: "IL", haifa: "IL", herzliya: "IL",
  "ra'anana": "IL", raanana: "IL", "petah tikva": "IL",
  dubai: "AE", "abu dhabi": "AE", sharjah: "AE", doha: "QA", riyadh: "SA",
  jeddah: "SA", "kuwait city": "KW", manama: "BH", muscat: "OM", amman: "JO",
  cairo: "EG", "alexandria, eg": "EG", casablanca: "MA", rabat: "MA",
  tunis: "TN", "cape town": "ZA", johannesburg: "ZA", durban: "ZA",
  pretoria: "ZA", "port elizabeth": "ZA", lagos: "NG", abuja: "NG",
  nairobi: "KE", accra: "GH", "addis ababa": "ET", kampala: "UG",
  kigali: "RW", "dar es salaam": "TZ",
  // South & East Asia
  bengaluru: "IN", bangalore: "IN", hyderabad: "IN", chennai: "IN",
  mumbai: "IN", bombay: "IN", "new delhi": "IN", delhi: "IN", gurgaon: "IN",
  gurugram: "IN", noida: "IN", pune: "IN", kolkata: "IN", ahmedabad: "IN",
  jaipur: "IN", coimbatore: "IN", kochi: "IN", trivandrum: "IN", indore: "IN",
  nagpur: "IN", vadodara: "IN", surat: "IN", mysuru: "IN", mysore: "IN",
  thane: "IN", "navi mumbai": "IN", chandigarh: "IN", bhubaneswar: "IN",
  karachi: "PK", lahore: "PK", islamabad: "PK", dhaka: "BD", colombo: "LK",
  kathmandu: "NP",
  beijing: "CN", shanghai: "CN", shenzhen: "CN", guangzhou: "CN",
  hangzhou: "CN", chengdu: "CN", chongqing: "CN", wuhan: "CN", "xi'an": "CN",
  xian: "CN", nanjing: "CN", tianjin: "CN", suzhou: "CN", dalian: "CN",
  qingdao: "CN", ningbo: "CN", xiamen: "CN", shenyang: "CN", changsha: "CN",
  hefei: "CN", zhuhai: "CN", dongguan: "CN",
  tokyo: "JP", osaka: "JP", kyoto: "JP", yokohama: "JP", nagoya: "JP",
  fukuoka: "JP", sapporo: "JP", kobe: "JP", kawasaki: "JP",
  seoul: "KR", busan: "KR", incheon: "KR", daejeon: "KR", suwon: "KR",
  taipei: "TW", hsinchu: "TW", kaohsiung: "TW", taichung: "TW", tainan: "TW",
  bangkok: "TH", "ho chi minh": "VN", "ho chi minh city": "VN", hanoi: "VN",
  "da nang": "VN", manila: "PH", makati: "PH", cebu: "PH", taguig: "PH",
  "kuala lumpur": "MY", penang: "MY", "george town": "MY", jakarta: "ID",
  bandung: "ID", surabaya: "ID", "phnom penh": "KH", yangon: "MM",
  // Oceania
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", adelaide: "AU",
  canberra: "AU", hobart: "AU", "gold coast": "AU",
  auckland: "NZ", wellington: "NZ", christchurch: "NZ",
  // Canada
  toronto: "CA", montreal: "CA", vancouver: "CA", ottawa: "CA", calgary: "CA",
  edmonton: "CA", winnipeg: "CA", "quebec city": "CA", halifax: "CA",
  saskatoon: "CA", regina: "CA", kitchener: "CA", mississauga: "CA",
  brampton: "CA", burnaby: "CA", markham: "CA", laval: "CA", gatineau: "CA",
  sherbrooke: "CA", "richmond hill": "CA", oakville: "CA", "north york": "CA",
  // Latin America
  "mexico city": "MX", "ciudad de mexico": "MX", guadalajara: "MX",
  monterrey: "MX", queretaro: "MX", tijuana: "MX", puebla: "MX", merida: "MX",
  apodaca: "MX", "san luis potosi": "MX", aguascalientes: "MX",
  "sao paulo": "BR", "rio de janeiro": "BR", "belo horizonte": "BR",
  brasilia: "BR", curitiba: "BR", "porto alegre": "BR", recife: "BR",
  campinas: "BR", florianopolis: "BR",
  "buenos aires": "AR", "cordoba, ar": "AR", rosario: "AR",
  santiago: "CL", bogota: "CO", medellin: "CO", lima: "PE", quito: "EC",
  guayaquil: "EC", montevideo: "UY", "san jose, costa rica": "CR",
  "panama city": "PA", "guatemala city": "GT",
};

// Compiled once. Longest-first so "sant cugat del valles" wins over "valles".
function toPattern(keys: string[]): RegExp {
  const escaped = [...keys]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:^|[^a-z0-9])(${escaped.join("|")})(?![a-z0-9])`, "i");
}
const FOREIGN_CITY_RE = toPattern(Object.keys(FOREIGN_CITIES));
const US_CITY_RE = toPattern(US_CITIES);
const US_STATE_NAME_RE = toPattern([...US_STATE_NAMES]);

// Unambiguous "this is the US" text, for strings with no comma to split on:
// "Remote in USA", "US SC Anderson", "US Headquarters".
const US_MARKER_RE = /(?:^|[^a-z0-9])(usa|u\.?s\.?a|united states|us)(?![a-z0-9])/i;

// Country names long enough to look for anywhere in the string rather than only
// as a whole comma-separated field — "Singapore-CapitaSky" and "SINGAPORE
// GENERAL OFFICE" are both Singapore. Short codes are deliberately excluded:
// scanning for "in", "or", "de", "is", "at" as substrings would read "Remote in
// USA" as India.
const LONG_ALIASES = Object.keys(COUNTRY_ALIASES).filter(
  (k) => k.length >= 5 && !k.includes("."),
);
const LONG_ALIAS_RE = toPattern(LONG_ALIASES);

// Normalize whatever an ATS calls a country into an ISO alpha-2 code.
// Accepts "us", "US", "United States", "GB", "Deutschland".
export function normalizeCountryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = fold(raw).replace(/\.$/, "");
  if (!s) return null;
  const alias = COUNTRY_ALIASES[s];
  if (alias) return alias;
  // A bare 2-letter code we don't have an alias for — trust it as-is.
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return null;
}

// Read a country out of one location string. Order matters: an explicit country
// or US state beats a city name, so "Paris, TX" is Texas and "London, UK" isn't
// London, Ontario.
export function countryFromLocation(loc: string): string | null {
  const s = fold(loc);
  if (!s) return null;

  // Comma/slash/pipe-separated components, which is how nearly every board
  // writes these ("Austin, TX, USA", "US, CA, Santa Clara", "GB-London").
  const parts = s.split(/[,/|;]|\s-\s/).map((p) => p.trim()).filter(Boolean);

  for (const p of parts) {
    const alias = COUNTRY_ALIASES[p];
    if (alias) return alias;
  }
  // Some boards glue the code on: "GB-London", "NLE-Apodaca".
  const glued = s.match(/^([a-z]{2})-[a-z]/);
  if (glued && COUNTRY_ALIASES[glued[1]]) return COUNTRY_ALIASES[glued[1]];

  for (const p of parts) {
    if (US_STATE_CODES.has(p) || US_STATE_NAMES.has(p)) return "US";
  }

  // "USA"/"US" spelled out anywhere is about as unambiguous as it gets.
  if (US_MARKER_RE.test(s)) return "US";

  // Foreign names before the loose US checks below, so a street address like
  // "Washington Street, London" reads as London rather than Washington.
  const longAlias = LONG_ALIAS_RE.exec(s);
  if (longAlias) {
    const code = COUNTRY_ALIASES[fold(longAlias[1])];
    if (code) return code;
  }
  const foreign = FOREIGN_CITY_RE.exec(s);
  if (foreign) return FOREIGN_CITIES[fold(foreign[1])] ?? null;

  if (US_STATE_NAME_RE.test(s)) return "US";
  if (US_CITY_RE.test(s)) return "US";
  return null;
}

// The country for a posting that may list several locations.
//
// A role open in both Austin and Munich is a role you can take in the US, so
// any US location wins outright. Otherwise the first country we can name wins,
// and null means every location was unreadable ("5 Locations", "In-Office").
export function inferCountry(locations: string[]): string | null {
  let firstForeign: string | null = null;
  for (const loc of locations) {
    const c = countryFromLocation(loc);
    if (c === "US") return "US";
    if (c && !firstForeign) firstForeign = c;
  }
  return firstForeign;
}

// Prefer what the ATS reported over anything read out of a string; fall back to
// the text only when it said nothing.
export function resolveCountry(
  reported: unknown,
  locations: string[],
): string | null {
  return normalizeCountryCode(reported) ?? inferCountry(locations);
}
