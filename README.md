# EarlyBird 🐦

**Real-time internship tracker that surfaces new SWE / ML / data roles the moment companies post them — minutes to days ahead of the popular GitHub job repos — plus a hackathon feed, an email-driven application tracker, and an AI resume tailor.**

### ▶︎ Live: **[earlybird-apps.vercel.app](https://earlybird-apps.vercel.app)**

![Next.js](https://img.shields.io/badge/Next.js-16-000) ![React](https://img.shields.io/badge/React-19-149eca) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Prisma](https://img.shields.io/badge/Prisma-7-2d3748) ![Postgres](https://img.shields.io/badge/Postgres-Neon-336791) ![Auth.js](https://img.shields.io/badge/Auth.js-Google-2b7fff)

---

Most internship trackers re-publish the same community-maintained lists, so everyone sees a role at the same (delayed) time. EarlyBird instead polls **1,300+ companies' own applicant-tracking systems directly** every 15 minutes — so a new posting shows up here within minutes of going live, typically **days before the aggregators**. The edge is being early.

It's four tools under one roof:

| Tab | What it does |
|-----|--------------|
| 🎯 **Internships** | Live, deduped feed of fresh internship postings pulled straight from company ATSes |
| ⚡ **Hackathons** | Upcoming hackathons (MLH + Devpost), US in-person + all online, soonest first |
| 📮 **Applications** | Your applications tracked **automatically from your email**, with stage + dates |
| 📄 **Resume** | Tailor your resume to any job description and export a copy **in your own .docx formatting** |

## Screenshots

> Add your own PNGs to `docs/screenshots/` and uncomment the tags below (see [`docs/screenshots/README.md`](./docs/screenshots/README.md)).

<!-- ![Internships feed](docs/screenshots/internships.png) -->
<!-- ![Hackathons](docs/screenshots/hackathons.png) -->
<!-- ![Applications tracker](docs/screenshots/applications.png) -->
<!-- ![Resume Tailor](docs/screenshots/resume.png) -->

## Highlights

- **Direct-from-source ingestion** across 6 ATS families + custom APIs — Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Amazon, Uber & Oracle — covering **1,300+ companies** (Stripe, Databricks, NVIDIA, Citadel, Jane Street, Anthropic, J&J, Nike, Boeing…), plus community aggregators for long-tail coverage.
- **Cross-source dedup & merge** — one logical role even when it appears on several feeds (matched by company + per-job apply link), so the same posting never shows twice; look-alike multi-location roles collapse into one card with a per-location expander.
- **Smart, always-on filtering** — US-only, internships-only, focused role families (SWE / ML-AI / Data / PM), and **graduation-cycle eligibility** that auto-adjusts each year.
- **Hackathons feed** — MLH's season list + Devpost's API, normalized and deduped, filtered to upcoming (not-yet-started) US in-person + online events, with format / date / search filters.
- **Email-driven application tracker** — a tiny Google Apps Script forwards job emails to EarlyBird, which **classifies each into a stage** (applied → assessment → interview → offer / rejected), dedupes by company, stores the full message history, and offers trash/undo + CSV / Google-Sheets export.
- **AI resume tailor** — upload your resume once as a `.docx`; Gemini structures it, compares it to a pasted job description, and proposes ATS-focused bullet rewrites you approve one at a time behind an inline diff toggle. Export re-opens **your original file** and swaps the approved sentences inside it, so fonts, margins and even inline bold survive — nothing is re-rendered into a lookalike.
- **Two-way sync** — marking a listing *Applied* on the feed creates an application entry, and email-tracked companies reflect their stage back onto matching feed listings.
- **Google sign-in** (Auth.js) ties your tracker to your account, so it follows you across browsers and devices — no key to lose.
- **Private analytics** — a secret-gated `/stats` page (page views + unique visitors, privacy-hashed, no PII) alongside Vercel Web Analytics.
- **Free, hands-off automation** — ingestion runs every 15 min on **GitHub Actions** (sidestepping Vercel's cron limits), with per-source failure isolation so one flaky board never breaks a run.

## Tech stack

**Next.js 16** (App Router, RSC) · **React 19** · **TypeScript** · **Tailwind CSS 4** · **Prisma 7** (`pg` driver adapter) · **Postgres** (Neon) · **Auth.js v5** (Google) · deployed on **Vercel**, scheduled by **GitHub Actions**. Traffic via **Vercel Web Analytics**; email/Discord/Telegram alerts via **Resend** + webhooks.

## How it works

- **Internship ingestion** (`src/lib/ingest`) fans out across every company's ATS with bounded concurrency, normalizes each into a common shape, filters to internships by title, and bulk-upserts. Roles that fall off a board for 2+ days are auto-deactivated so "active only" stays honest. Recency uses a materialized `effectiveAt` column (posting date when sane, else first-seen time).
- **Hackathon ingestion** (`src/lib/ingest/hackathons`) parses MLH's embedded season data and Devpost's public API, normalizes format/dates, and merges across sources.
- **Application tracker** (`src/lib/apptracker`) classifies each forwarded email (stage, company, role, date — reading the original *Sent* header on forwards), dedupes by normalized company, and stores every message body for the per-application history. Anonymous per-user via a secret tracker key, upgraded to a Google account when signed in.
- **Resume tailoring** (`src/lib/resume`) reads a `.docx` as a flat list of paragraphs, giving each a positional id that ties a suggestion to one exact line. Gemini runs in JSON-schema mode for both the parse and the tailoring pass, under prompts that forbid changing any fact and require every invented metric to arrive bracketed (`[X]%`) so it's visibly unfinished. Export distributes the new wording back across the paragraph's original runs, so a bolded phrase that survives a reword stays bold. The stored resume is never mutated — tailoring works on an in-memory copy and the download is a byte-copy.
- **Notifications** (`src/lib/notify`) match each user's saved filters and deliver `INSTANT` or once-daily `DAILY_DIGEST` alerts, with a per-(user, role) record guaranteeing nothing is sent twice.

## Run it locally

```bash
npm install
cp .env.example .env          # set DATABASE_URL (any Postgres)
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
npm run ingest                # pull a fresh batch of listings + hackathons
```

`npm test` runs the unit suite; `npm run lint` checks the code.

**Optional env** (features degrade gracefully without them): `AUTH_SECRET` + `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` for Google sign-in; `STATS_SECRET` + `STATS_SALT` for the private `/stats` page; `CRON_SECRET` to guard the cron endpoints; `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`, default `gemini-3.6-flash`) for the Resume tab.

## Architecture notes

- **Why GitHub Actions for cron?** Vercel's Hobby plan caps cron at once/day; a GitHub Actions schedule runs every 15 min for free and executes `npm run ingest` directly on the runner — avoiding Vercel's 60s function limit while fanning out across 1,300+ boards.
- **Adding a company** is a one-line, verified entry in `src/lib/ingest/sources/*.ts` (tokens are mined from real apply URLs and probed live before being added).
- **Why edit the `.docx` instead of generating one?** Re-rendering a resume from structured data produces something that merely resembles the original. Reopening the user's own file and replacing sentences inside `word/document.xml` keeps their layout exactly, which is what matters when a human opens the attachment. It's also why the Resume tab is the one part of the app that requires sign-in: it stores real contact details and the file itself, rather than a browser-local key.
- **Privacy** — feed tracking works anonymously (browser/localStorage or a secret key); the `/stats` logger stores only a salted daily hash of IP+UA, never the values themselves.
- **Endpoints** (`/api/ingest`, `/api/notify`) are guarded by a `CRON_SECRET`; full env + deploy details live in [`.env.example`](./.env.example) and [`.github/workflows/cron.yml`](./.github/workflows/cron.yml).
