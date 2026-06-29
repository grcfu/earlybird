# EarlyBird 🐦

**Real-time internship tracker that surfaces new SWE / ML / data / quant / hardware roles the moment companies post them — minutes to days ahead of the popular GitHub job repos.**

### ▶︎ Live: **[earlybird.vercel.app](https://earlybird.vercel.app)**

![Next.js](https://img.shields.io/badge/Next.js-16-000) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Prisma](https://img.shields.io/badge/Prisma-7-2d3748) ![Postgres](https://img.shields.io/badge/Postgres-Neon-336791)

---

Most internship trackers re-publish the same community-maintained lists, so everyone sees a role at the same (delayed) time. EarlyBird instead polls **240+ companies' own applicant-tracking systems directly** every 30 minutes — so a new posting shows up here within minutes of going live, typically **days before the aggregators**. The edge is being early.

## Highlights

- **Direct-from-source ingestion** across 6 ATS families + custom APIs — Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Amazon & Uber — covering **240+ companies** (Stripe, Databricks, NVIDIA, Citadel, Jane Street, Anthropic, Citi, Morgan Stanley…), plus community aggregators for long-tail coverage.
- **Cross-source dedup & merge** — one logical role even when it appears on several feeds; the earliest known post date wins, so recency reflects when it *truly* went live.
- **Smart, always-on filtering** — US-only, internships-only, and **graduation-cycle eligibility** that auto-adjusts each year from a single grad-date constant.
- **Two ranking modes** — *Newest* (the freshness edge) and *Top companies* (a curated prestige tier so the biggest names float up), both with keyset pagination.
- **Built-in application tracker** — per-role status (interested → applied → interview → offer → rejected), notes, "new since last visit" highlighting, a live "↑ new roles" pill, and CSV export.
- **Free, hands-off automation** — ingestion runs every 30 min on **GitHub Actions** (sidestepping Vercel's cron limits), with per-source failure isolation so one flaky board never breaks a run.

## Tech stack

**Next.js 16** (App Router, RSC) · **React 19** · **TypeScript** · **Tailwind CSS 4** · **Prisma 7** (`pg` driver adapter) · **Postgres** (Neon) · deployed on **Vercel**, scheduled by **GitHub Actions**. Email/Discord/Telegram alerts via **Resend** + webhooks.

## How it works

- **Ingestion** (`src/lib/ingest`) fans out across every company's ATS with bounded concurrency, normalizes each into a common shape, filters to internships by title, and bulk-upserts. Roles that fall off a board for 2+ days are auto-deactivated so "active only" stays honest.
- **Recency** uses a materialized `effectiveAt` column (posting date when sane, else first-seen time), powering the "newest in the last N days" views and the cycle estimate.
- **Notifications** (`src/lib/notify`) match each user's saved filters and deliver `INSTANT` or once-daily `DAILY_DIGEST` alerts, with a per-(user, role) record guaranteeing nothing is sent twice.

## Run it locally

```bash
npm install
cp .env.example .env          # set DATABASE_URL (any Postgres)
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
npm run ingest                # pull a fresh batch of listings
```

`npm test` runs the unit suite; `npm run lint` checks the code.

## Architecture notes

- **Why GitHub Actions for cron?** Vercel's Hobby plan caps cron at once/day; a GitHub Actions schedule runs every 30 min for free and executes `npm run ingest` directly on the runner — avoiding Vercel's 60s function limit while fanning out across 240+ boards.
- **Adding a company** is a one-line, verified entry in `src/lib/ingest/sources/*.ts`.
- **Endpoints** (`/api/ingest`, `/api/notify`) are guarded by a `CRON_SECRET`; full env + deploy details live in [`.env.example`](./.env.example) and [`.github/workflows/cron.yml`](./.github/workflows/cron.yml).
