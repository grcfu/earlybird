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
  // Host + site grepped from the careers page, CXS-confirmed 2026-08-04.
  {
    company: "S&P Global",
    token: "spgi",
    host: "spgi.wd5.myworkdayjobs.com",
    site: "SPGI_Careers",
  },
  {
    company: "Nasdaq",
    token: "nasdaq",
    host: "nasdaq.wd1.myworkdayjobs.com",
    site: "Global_External_Site",
  },
  {
    company: "Expedia Group",
    token: "expedia",
    host: "expedia.wd108.myworkdayjobs.com",
    site: "search",
  },

  // Mined 2026-08-04: host + tenant + site pulled straight out of aggregator
  // apply-URLs (they embed the full CXS path), then every board POSTed once and
  // kept only on a 200 with a non-empty jobPostings array. This is how the big
  // enterprises finally got covered — their careers pages are JS shells that
  // expose nothing to grep. Several entries are deliberately the *early-career*
  // site rather than the main one (Salesforce Futureforce, PwC US_Entry_Level,
  // BlackRock_Early_Careers, Cadence University_Talent, Agilent_Student_Careers,
  // KLA UR, Chevron University, BD US_EARLY_TALENT) — that is where the intern
  // reqs live.
  //
  // Two rules when adding here, both learned the hard way:
  //   - Never add a second board for a company whose site path differs from an
  //     existing one only in case. CXS resolves the path case-insensitively, so
  //     it is the same board, but urlHostPath() lowercases only the host — the
  //     two spellings hash to two listingIds and every req lands twice.
  //   - Reuse the company's existing display name verbatim (HPE, not Hewlett
  //     Packard Enterprise). The name is part of listingId, so a variant splits
  //     one employer into two in the UI.
  {
    company: "Intel",
    token: "intel",
    host: "intel.wd1.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "NXP Semiconductors",
    token: "nxp",
    host: "nxp.wd3.myworkdayjobs.com",
    site: "careers",
  },
  {
    company: "ASML",
    token: "asml",
    host: "asml.wd3.myworkdayjobs.com",
    site: "asmlext1",
  },
  {
    company: "Tokyo Electron",
    token: "tel",
    host: "tel.wd3.myworkdayjobs.com",
    site: "tel-careers",
  },
  {
    company: "Axcelis Technologies",
    token: "axcelis",
    host: "axcelis.wd1.myworkdayjobs.com",
    site: "axcelis",
  },
  {
    company: "Illumina",
    token: "illumina",
    host: "illumina.wd1.myworkdayjobs.com",
    site: "illumina-careers",
  },
  {
    company: "Agilent Technologies",
    token: "agilent",
    host: "agilent.wd5.myworkdayjobs.com",
    site: "Agilent_Student_Careers",
  },
  {
    company: "KLA",
    token: "kla",
    host: "kla.wd1.myworkdayjobs.com",
    site: "UR",
  },
  {
    company: "Cadence",
    token: "cadence",
    host: "cadence.wd1.myworkdayjobs.com",
    site: "University_Talent",
  },
  {
    company: "Zebra Technologies",
    token: "zebra",
    host: "zebra.wd501.myworkdayjobs.com",
    site: "Zebra_careers",
  },
  {
    company: "Samsung",
    token: "sec",
    host: "sec.wd3.myworkdayjobs.com",
    site: "Samsung_Careers",
  },
  {
    company: "HPE",
    token: "hpe",
    host: "hpe.wd5.myworkdayjobs.com",
    site: "acjobsite",
  },
  {
    company: "HP",
    token: "hp",
    host: "hp.wd5.myworkdayjobs.com",
    site: "EXTEU-AC-CareerSite",
  },
  {
    company: "Equinix",
    token: "equinix",
    host: "equinix.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Iron Mountain",
    token: "ironmountain",
    host: "ironmountain.wd5.myworkdayjobs.com",
    site: "iron-mountain-jobs",
  },
  {
    company: "Salesforce",
    token: "salesforce",
    host: "salesforce.wd12.myworkdayjobs.com",
    site: "Futureforce_Internships",
  },
  {
    company: "Cisco",
    token: "cisco",
    host: "cisco.wd5.myworkdayjobs.com",
    site: "cisco_careers",
  },
  {
    company: "Palo Alto Networks",
    token: "paloaltonetworks",
    host: "paloaltonetworks.wd5.myworkdayjobs.com",
    site: "panwexternalcareers",
  },
  {
    company: "Autodesk",
    token: "autodesk",
    host: "autodesk.wd1.myworkdayjobs.com",
    site: "uni",
  },
  {
    company: "Workday",
    token: "workday",
    host: "workday.wd5.myworkdayjobs.com",
    site: "Workday_Jobs",
  },
  {
    company: "Accenture",
    token: "accenture",
    host: "accenture.wd103.myworkdayjobs.com",
    site: "AccentureCareers",
  },
  {
    company: "Kyndryl",
    token: "kyndryl",
    host: "kyndryl.wd5.myworkdayjobs.com",
    site: "KyndrylProfessionalCareers",
  },
  {
    company: "DXC Technology",
    token: "dxctechnology",
    host: "dxctechnology.wd1.myworkdayjobs.com",
    site: "dxcjobs",
  },
  {
    company: "Unisys",
    token: "unisys",
    host: "unisys.wd5.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Etsy",
    token: "etsy",
    host: "etsy.wd5.myworkdayjobs.com",
    site: "Etsy_Careers",
  },
  {
    company: "Zillow",
    token: "zillow",
    host: "zillow.wd5.myworkdayjobs.com",
    site: "Zillow_Group_External",
  },
  {
    company: "Expedia Group",
    token: "expedia",
    host: "expedia.wd108.myworkdayjobs.com",
    site: "private",
  },
  {
    company: "CCC Intelligent Solutions",
    token: "cccis",
    host: "cccis.wd1.myworkdayjobs.com",
    site: "broadbean_external",
  },
  {
    company: "Vertex Inc",
    token: "vertexinc",
    host: "vertexinc.wd1.myworkdayjobs.com",
    site: "VertexInc",
  },
  {
    company: "Citi",
    token: "citi",
    host: "citi.wd5.myworkdayjobs.com",
    site: "Citi_Early_Careers_Events_Site",
  },
  {
    company: "BlackRock",
    token: "blackrock",
    host: "blackrock.wd1.myworkdayjobs.com",
    site: "BlackRock_Early_Careers_Program",
  },
  {
    company: "Bank of America",
    token: "ghr",
    host: "ghr.wd1.myworkdayjobs.com",
    site: "us-emplsv",
  },
  {
    company: "PNC Financial Services",
    token: "pnc",
    host: "pnc.wd5.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Vanguard",
    token: "vanguard",
    host: "vanguard.wd5.myworkdayjobs.com",
    site: "vanguard_external",
  },
  {
    company: "State Street",
    token: "statestreet",
    host: "statestreet.wd1.myworkdayjobs.com",
    site: "equest",
  },
  {
    company: "Neuberger Berman",
    token: "nb",
    host: "nb.wd1.myworkdayjobs.com",
    site: "NBCareers",
  },
  {
    company: "AllianceBernstein",
    token: "abglobal",
    host: "abglobal.wd1.myworkdayjobs.com",
    site: "alliancebernsteincareers",
  },
  {
    company: "Fidelity International",
    token: "fil",
    host: "fil.wd3.myworkdayjobs.com",
    site: "001",
  },
  {
    company: "CME Group",
    token: "cmegroup",
    host: "cmegroup.wd1.myworkdayjobs.com",
    site: "cme_careers",
  },
  {
    company: "Mastercard",
    token: "mastercard",
    host: "mastercard.wd1.myworkdayjobs.com",
    site: "Public_Posting_Site",
  },
  {
    company: "Visa",
    token: "visa",
    host: "visa.wd5.myworkdayjobs.com",
    site: "Visa",
  },
  {
    company: "Fiserv",
    token: "fiserv",
    host: "fiserv.wd5.myworkdayjobs.com",
    site: "ext",
  },
  {
    company: "FIS",
    token: "fis",
    host: "fis.wd5.myworkdayjobs.com",
    site: "searchjobs",
  },
  {
    company: "Global Payments",
    token: "tsys",
    host: "tsys.wd1.myworkdayjobs.com",
    site: "TSYS",
  },
  {
    company: "Synchrony Bank",
    token: "synchronyfinancial",
    host: "synchronyfinancial.wd5.myworkdayjobs.com",
    site: "careers",
  },
  {
    company: "Prudential Financial",
    token: "pru",
    host: "pru.wd5.myworkdayjobs.com",
    site: "Careers",
  },
  {
    company: "The Hartford",
    token: "thehartford",
    host: "thehartford.wd5.myworkdayjobs.com",
    site: "Careers_External",
  },
  {
    company: "Travelers",
    token: "travelers",
    host: "travelers.wd5.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Allstate",
    token: "allstate",
    host: "allstate.wd5.myworkdayjobs.com",
    site: "allstate_careers",
  },
  {
    company: "Nationwide",
    token: "nationwide",
    host: "nationwide.wd1.myworkdayjobs.com",
    site: "Nationwide_Career",
  },
  {
    company: "PwC",
    token: "pwc",
    host: "pwc.wd3.myworkdayjobs.com",
    site: "US_Entry_Level_Careers",
  },
  {
    company: "DraftKings",
    token: "draftkings",
    host: "draftkings.wd1.myworkdayjobs.com",
    site: "DraftKings",
  },
  {
    company: "Dow Jones",
    token: "dowjones",
    host: "dowjones.wd1.myworkdayjobs.com",
    site: "Dow_Jones_Career",
  },
  {
    company: "RTX",
    token: "globalhr",
    host: "globalhr.wd5.myworkdayjobs.com",
    site: "rec_rtx_ext_gateway",
  },
  {
    company: "GE Aerospace",
    token: "geaerospace",
    host: "geaerospace.wd5.myworkdayjobs.com",
    site: "ge_externalsite",
  },
  {
    company: "Airbus",
    token: "ag",
    host: "ag.wd3.myworkdayjobs.com",
    site: "Airbus",
  },
  {
    company: "Sierra Space",
    token: "sierraspace",
    host: "sierraspace.wd1.myworkdayjobs.com",
    site: "Sierra_Space_External_Career_Site",
  },
  {
    company: "The Aerospace Corporation",
    token: "aero",
    host: "aero.wd5.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "CACI",
    token: "caci",
    host: "caci.wd1.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Ultra",
    token: "ultra",
    host: "ultra.wd3.myworkdayjobs.com",
    site: "ultra-careers",
  },
  {
    company: "Ensign-Bickford Aerospace & Defense",
    token: "ebi",
    host: "ebi.wd5.myworkdayjobs.com",
    site: "ebadcareers",
  },
  {
    company: "Caterpillar",
    token: "cat",
    host: "cat.wd5.myworkdayjobs.com",
    site: "CaterpillarCareers",
  },
  {
    company: "Rockwell Automation",
    token: "rockwellautomation",
    host: "rockwellautomation.wd1.myworkdayjobs.com",
    site: "External_Rockwell_Automation",
  },
  {
    company: "ABB",
    token: "abb",
    host: "abb.wd3.myworkdayjobs.com",
    site: "external_career_page",
  },
  {
    company: "Stanley Black & Decker",
    token: "sbdinc",
    host: "sbdinc.wd1.myworkdayjobs.com",
    site: "Stanley_Black_Decker_Career_Site",
  },
  {
    company: "Terex",
    token: "terex",
    host: "terex.wd1.myworkdayjobs.com",
    site: "terexcareers",
  },
  {
    company: "Oshkosh",
    token: "oshkoshcorporation",
    host: "oshkoshcorporation.wd5.myworkdayjobs.com",
    site: "Oshkosh",
  },
  {
    company: "Carrier Global",
    token: "carrier",
    host: "carrier.wd5.myworkdayjobs.com",
    site: "jobs",
  },
  {
    company: "General Motors",
    token: "generalmotors",
    host: "generalmotors.wd5.myworkdayjobs.com",
    site: "Careers_GM",
  },
  {
    company: "Magna International",
    token: "magna",
    host: "magna.wd3.myworkdayjobs.com",
    site: "Magna",
  },
  {
    company: "Aptiv",
    token: "aptiv",
    host: "aptiv.wd5.myworkdayjobs.com",
    site: "aptiv_careers",
  },
  {
    company: "Valeo",
    token: "valeo",
    host: "valeo.wd3.myworkdayjobs.com",
    site: "valeo_jobs",
  },
  {
    company: "Novartis",
    token: "novartis",
    host: "novartis.wd3.myworkdayjobs.com",
    site: "Novartis_Careers",
  },
  {
    company: "Bristol Myers Squibb",
    token: "bristolmyerssquibb",
    host: "bristolmyerssquibb.wd5.myworkdayjobs.com",
    site: "bms",
  },
  {
    company: "Biogen",
    token: "biibhr",
    host: "biibhr.wd3.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Moderna",
    token: "modernatx",
    host: "modernatx.wd1.myworkdayjobs.com",
    site: "M_tx",
  },
  {
    company: "Regeneron",
    token: "regeneron",
    host: "regeneron.wd1.myworkdayjobs.com",
    site: "Careers",
  },
  {
    company: "Vertex Pharmaceuticals",
    token: "vrtx",
    host: "vrtx.wd501.myworkdayjobs.com",
    site: "vertex_careers",
  },
  {
    company: "AstraZeneca",
    token: "astrazeneca",
    host: "astrazeneca.wd3.myworkdayjobs.com",
    site: "Careers",
  },
  {
    company: "GSK",
    token: "gsk",
    host: "gsk.wd5.myworkdayjobs.com",
    site: "GSKCareers",
  },
  {
    company: "Sanofi",
    token: "sanofi",
    host: "sanofi.wd3.myworkdayjobs.com",
    site: "SanofiCareers",
  },
  {
    company: "Genentech",
    token: "roche",
    host: "roche.wd3.myworkdayjobs.com",
    site: "ROG-A2O-GENE",
  },
  {
    company: "Medtronic",
    token: "medtronic",
    host: "medtronic.wd1.myworkdayjobs.com",
    site: "MedtronicCareers",
  },
  {
    company: "Edwards Lifesciences",
    token: "edwards",
    host: "edwards.wd5.myworkdayjobs.com",
    site: "edwardscareers",
  },
  {
    company: "Baxter International",
    token: "baxter",
    host: "baxter.wd1.myworkdayjobs.com",
    site: "baxter",
  },
  {
    company: "Becton Dickinson",
    token: "bdx",
    host: "bdx.wd1.myworkdayjobs.com",
    site: "US_EARLY_TALENT_SITE",
  },
  {
    company: "Revvity",
    token: "revvity",
    host: "revvity.wd103.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "PerkinElmer",
    token: "newperkinelmer",
    host: "newperkinelmer.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Labcorp",
    token: "labcorp",
    host: "labcorp.wd1.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Abbott",
    token: "abbott",
    host: "abbott.wd5.myworkdayjobs.com",
    site: "abbottcareers2",
  },
  {
    company: "Chevron",
    token: "chevron",
    host: "chevron.wd5.myworkdayjobs.com",
    site: "University",
  },
  {
    company: "Shell",
    token: "shell",
    host: "shell.wd3.myworkdayjobs.com",
    site: "ShellCareers",
  },
  {
    company: "Vistra",
    token: "vst",
    host: "vst.wd5.myworkdayjobs.com",
    site: "vistra_careers",
  },
  {
    company: "Xcel Energy",
    token: "xcelenergy",
    host: "xcelenergy.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Dow",
    token: "dow",
    host: "dow.wd1.myworkdayjobs.com",
    site: "ExternalCareers",
  },
  {
    company: "PPG Industries",
    token: "ppg",
    host: "ppg.wd5.myworkdayjobs.com",
    site: "PPG_CAREERS",
  },
  {
    company: "Air Products",
    token: "airproducts",
    host: "airproducts.wd5.myworkdayjobs.com",
    site: "AP0001",
  },
  {
    company: "Corteva",
    token: "corteva",
    host: "corteva.wd5.myworkdayjobs.com",
    site: "corteva",
  },
  {
    company: "The Mosaic Company",
    token: "mosaic",
    host: "mosaic.wd5.myworkdayjobs.com",
    site: "mosaic",
  },
  {
    company: "Procter & Gamble",
    token: "pg",
    host: "pg.wd5.myworkdayjobs.com",
    site: "1000",
  },
  {
    company: "The Coca-Cola Company",
    token: "coke",
    host: "coke.wd1.myworkdayjobs.com",
    site: "coca-cola-careers",
  },
  {
    company: "Kraft Heinz",
    token: "heinz",
    host: "heinz.wd1.myworkdayjobs.com",
    site: "KraftHeinz_Careers_UR",
  },
  {
    company: "Conagra Brands",
    token: "conagrabrands",
    host: "conagrabrands.wd1.myworkdayjobs.com",
    site: "Careers_US",
  },
  {
    company: "The Campbell's Company",
    token: "campbellsoup",
    host: "campbellsoup.wd5.myworkdayjobs.com",
    site: "externalcareers_globalsite",
  },
  {
    company: "Tyson Foods",
    token: "tysonfoods",
    host: "tysonfoods.wd5.myworkdayjobs.com",
    site: "TSN",
  },
  {
    company: "Clorox",
    token: "clorox",
    host: "clorox.wd1.myworkdayjobs.com",
    site: "InviteClorox",
  },
  {
    company: "Unilever",
    token: "unilever",
    host: "unilever.wd3.myworkdayjobs.com",
    site: "Unilever_Experienced_Professionals",
  },
  {
    company: "Levi Strauss & Co.",
    token: "levistraussandco",
    host: "levistraussandco.wd5.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Lowe's",
    token: "lowes",
    host: "lowes.wd5.myworkdayjobs.com",
    site: "LWS_External_CS",
  },
  {
    company: "TJX",
    token: "tjx",
    host: "tjx.wd1.myworkdayjobs.com",
    site: "tjx_external",
  },
  {
    company: "Dick's Sporting Goods",
    token: "dickssportinggoods",
    host: "dickssportinggoods.wd1.myworkdayjobs.com",
    site: "DSG",
  },
  {
    company: "O'Reilly Auto Parts",
    token: "oreillyauto",
    host: "oreillyauto.wd1.myworkdayjobs.com",
    site: "oreilly",
  },
  {
    company: "Walmart",
    token: "walmart",
    host: "walmart.wd504.myworkdayjobs.com",
    site: "WalmartExternal",
  },
  {
    company: "UPS",
    token: "hcmportal",
    host: "hcmportal.wd5.myworkdayjobs.com",
    site: "Search",
  },
  {
    company: "Southwest Airlines",
    token: "swa",
    host: "swa.wd1.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Warner Bros.",
    token: "warnerbros",
    host: "warnerbros.wd5.myworkdayjobs.com",
    site: "global",
  },
  {
    company: "Warner Music",
    token: "wmg",
    host: "wmg.wd1.myworkdayjobs.com",
    site: "WMGUS",
  },
  {
    company: "Live Nation",
    token: "livenation",
    host: "livenation.wd503.myworkdayjobs.com",
    site: "LNExternalSite",
  },
  {
    company: "Sony Pictures Entertainment",
    token: "spe",
    host: "spe.wd1.myworkdayjobs.com",
    site: "SonyPicturesEntertainment",
  },
  {
    company: "TelevisaUnivision",
    token: "univision",
    host: "univision.wd1.myworkdayjobs.com",
    site: "External",
  },
  {
    company: "Verizon",
    token: "verizon",
    host: "verizon.wd12.myworkdayjobs.com",
    site: "verizon-careers",
  },
  {
    company: "JLL",
    token: "jll",
    host: "jll.wd1.myworkdayjobs.com",
    site: "jllcareers",
  },
  {
    company: "Cushman & Wakefield",
    token: "cw",
    host: "cw.wd1.myworkdayjobs.com",
    site: "external",
  },
  {
    company: "Colliers",
    token: "colliers",
    host: "colliers.wd3.myworkdayjobs.com",
    site: "Colliers-External-Career-Site",
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
    let raw: { jobPostings?: WdPosting[]; total?: number };
    try {
      raw = (await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliedFacets: {},
          limit: PAGE,
          offset: page * PAGE,
          searchText: "intern",
        }),
        // Workday's search is slow and times out at the shared 20s default often
        // enough to drop whole companies. Give it more room.
        timeoutMs: 35_000,
      })) as { jobPostings?: WdPosting[]; total?: number };
    } catch (err) {
      // A flaky later page shouldn't discard the pages we already have — keep
      // them and stop. Only a first-page failure is a real per-company failure.
      if (page > 0) break;
      throw err;
    }

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
  // Concurrency raised from 4 with the 2026-08-04 batch (84 -> 208 boards).
  // Every board is a different tenant host, so this doesn't hammer one origin.
  load: () => loadAts({ sourceName: SOURCE_NAME, companies: BOARDS, fetchCompany, concurrency: 8 }),
};
