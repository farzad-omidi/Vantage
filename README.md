# Vantage

**Live:** [vantage-zeta-navy.vercel.app](https://vantage-zeta-navy.vercel.app)

AI-powered social & market intelligence. Monitor accounts and topics across the social web,
let Claude analyze what's actually relevant, and surface it — with an explanation of why it
matters and what to do about it — before you'd find it yourself.

Built with Next.js (App Router), Supabase (Postgres + Auth + Realtime-ready), and the
Anthropic API. No other backend to run.

## What's actually here

This is a real, working MVP, not a mockup — every screen reads and writes real data. What
it is **not**:

- **Live ingestion works out of the box only for RSS/Atom feeds** — blogs, YouTube channels
  (`https://www.youtube.com/feeds/videos.xml?channel_id=...`), most subreddits (append
  `.rss` to any subreddit URL), and many news sites. X/Twitter and LinkedIn don't offer
  free feeds; monitoring them needs their paid APIs wired into the same adapter pattern
  (see [Architecture](#architecture) → Ingestion).
- **No scheduler is running by default.** Ingestion, AI analysis, and discovery all have
  working `/api/cron/*` routes, but nothing calls them on a timer until you point an
  external scheduler at them — see [Scheduling](#scheduling-ingestion--analysis).
- **Single-tenant ownership, not team workspaces.** Every row is scoped to the user who
  created it. Multi-user collaboration on one workspace is a real next step, not this MVP.
- **No billing/subscriptions, no email digests, no legal docs** (privacy policy, terms) —
  needed before a public launch, out of scope here.

## Features in this MVP

- **Email + password sign-in** — no email round-trip. Turn off *Confirm email* under
  Supabase → Authentication → Providers → Email and account creation is instant; leave it
  on and Supabase sends one confirmation link, after which it's password-only. (The
  `/auth/confirm` and `/auth/callback` routes are kept so that link resolves either way.)
- **Sources** — add accounts, blogs, and feeds; organize by category and priority; live
  RSS/Atom sync with a "Sync now" button and per-source status/error tracking.
- **Topics** — define keywords, phrases, and areas of interest per topic, with priority,
  language, and region fields; keyword-matched against ingested content automatically.
- **AI content analysis** — every ingested item is analyzed by Claude for relevance,
  classification, a summary, a plain-language "why this matters," concrete opportunities,
  priority, and sentiment.
- **Read in your own language** — pick a reading language in Settings (English, فارسی,
  العربية, Bahasa Indonesia and a dozen more) and every summary, "why it matters,"
  opportunity and alert headline is written in it, whatever the source published in.
  Titles get a translation alongside the original, so you can still search for what the
  author actually wrote. Right-to-left languages render with the correct text direction.
  Content is always analyzed in its *original* language first — translating before
  judging loses the nuance the judgment depends on.
- **Intelligent alerts** — auto-generated on high/urgent findings by default, or scoped
  precisely with custom alert rules (by topic, source, and minimum priority) from Settings.
- **Discovery engine** — uses Claude's web-search tool to find real, currently active
  accounts and publications for your topics that you're not tracking yet; review and
  approve or dismiss each suggestion.
- **Dashboard** — unread alerts, a 14-day activity chart, top topics this week, and a
  unified recent-activity feed.
- **Full-text search** — across every ingested item's title, body, and author.
- **Knowledge & relationship management** — save sources, add freeform notes, log
  interactions (contacted, replied, meeting, etc.), and track a relationship stage
  (new → watching → engaged → partner) per source.

## Getting started

1. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase project.
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com/).
     Powers content analysis and discovery. Without it everything else still works and
     those two features report that they're unconfigured.
   - `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` — **optional**, and only needed for the
     scheduled `/api/cron/*` sweeps, which run across every user and so can't use any one
     user's session. The in-app "Sync now" and "Run discovery" buttons run on the signed-in
     user's own RLS-scoped session and need neither.

2. Apply the database schema in `supabase/schema.sql` to your Supabase project (SQL
   editor, the Supabase CLI, or the MCP `apply_migration` tool). It creates the `vantage`
   schema and every table, index, RLS policy, trigger, and RPC the app relies on.

   Vantage's tables deliberately live in a dedicated **`vantage`** Postgres schema rather
   than `public`, so it can share a Supabase project with other apps without colliding on
   common names (`profiles`, `categories`) or on the `on_auth_user_created` trigger. After
   applying the schema, make sure `vantage` is listed under **Settings → API → Exposed
   schemas** in the Supabase dashboard (the last statement in `schema.sql` sets this, but
   the dashboard toggle is the reliable fallback if queries come back with a
   "schema must be one of the following" / `PGRST106` error).

3. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

4. Sign in, add a topic, add an RSS source, and click **Sync now** on it — you should see
   ingested items with AI analysis within a few seconds.

## Scheduling ingestion & analysis

Three routes do the recurring work; none of them run themselves. Point a scheduler (Vercel
Cron, a GitHub Actions cron workflow, or any service that can POST on a timer) at each,
with header `x-cron-secret: <your CRON_SECRET>`:

| Route | Suggested cadence | What it does |
| --- | --- | --- |
| `POST /api/cron/sync` | every 15–30 min | Syncs every active, feed-having source across all users. |
| `POST /api/cron/analyze` | a few minutes after sync | Analyzes any ingested item that doesn't have a `content_analysis` row yet, in bounded batches. |
| `POST /api/cron/discover` | daily | Runs the discovery engine for every user with active topics. Costs a web-search-enabled model call per topic — keep this infrequent. |

Example Vercel Cron config (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/sync", "schedule": "*/20 * * * *" },
    { "path": "/api/cron/analyze", "schedule": "5-59/20 * * * *" },
    { "path": "/api/cron/discover", "schedule": "0 9 * * *" }
  ]
}
```

(Vercel Cron doesn't send custom headers — either check `request.headers.get("authorization")`
against `CRON_SECRET` there via a Vercel-specific bearer convention, or trigger these from
GitHub Actions/an external scheduler that can set `x-cron-secret` directly.)

## Architecture

- **`src/lib/domain` types** — `src/lib/database.types.ts` is the hand-written source of
  truth for the schema shape (no live Supabase project to generate against yet).
  Regenerate with the Supabase CLI once one exists, and keep it in sync with
  `supabase/schema.sql`.
- **Auth** — `src/lib/supabase/{client,server,proxy}.ts` follow the `@supabase/ssr`
  cookie-based session pattern; `src/proxy.ts` (this Next.js build's name for
  middleware) redirects signed-out visitors to `/login`.
- **Ingestion** (`src/lib/ingestion/`) — `rss.ts` fetches and normalizes RSS/Atom feeds
  with no API key required; `sync.ts` dedupes against `content_items.content_hash`,
  keyword-matches new items against active topics, and logs to `ingestion_runs`. To add a
  paid-API platform (Twitter/X, LinkedIn), write a new fetcher with the same
  `FeedItem[]`-shaped output and call it from `sync.ts` alongside `fetchFeed`.
- **AI analysis** (`src/lib/ai/analyze.ts`, `pipeline.ts`) — calls Claude (Haiku 4.5 by
  default — cheap enough to run on every item; override via `ANTHROPIC_ANALYSIS_MODEL`)
  with a forced tool call (`submit_analysis`) for reliable structured output, then writes
  `content_analysis` and raises an `alerts` row when it clears the user's bar (default:
  high/urgent, or a matching custom `alert_rules` row).
- **Discovery** (`src/lib/ai/discover.ts`, `discoveryRun.ts`) — gives Claude the
  `web_search_20260209` server tool (billed per search through the Anthropic API, no
  separate search API key) plus a forced-shape `propose_sources` tool, scoped to each
  topic and excluding sources you already track or have seen suggested.
- **Data access** — every table is row-level-security-scoped to `user_id = auth.uid()`
  (see `supabase/schema.sql`); the cron and manual-sync routes use the service-role admin
  client (`src/lib/supabase/admin.ts`) because they write on behalf of the platform, not
  an authenticated request — never import that client into client-facing code.
- **Design system** — `src/app/globals.css` defines the token system (neutral slate +
  one indigo accent + a semantic urgent/high/medium/low scale used consistently for
  alerts, source priority, and analysis priority) that every component builds on.

## Deploying

Import this repo at [vercel.com/new](https://vercel.com/new) and set the environment
variables from `.env.example` during the import. Importing from git (rather than uploading
a build) is what makes later `git push`es redeploy automatically.

Only two variables are needed for a working deployment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's publishable / anon key |

Add `ANTHROPIC_API_KEY` to switch on AI analysis and discovery, and
`SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` only if you also want the
[scheduled sweeps](#scheduling-ingestion--analysis) — without those, sources sync when a
user clicks "Sync now".

Sign-in is email + password, so there's no redirect allow-list to configure. The one
Supabase setting worth changing: **Authentication → Providers → Email → Confirm email**.
Off means account creation is immediate with no email at all; on means one confirmation
link per new account.
