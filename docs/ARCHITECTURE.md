# Vantage — Architecture & Product Notes

This is the design record for the MVP: the decisions made, why, and the concrete path to
extend each subsystem. See the root `README.md` for setup and feature list; this doc is
for whoever picks up development next.

## Product shape

Vantage is an intelligence desk, not a social network. The user is one person (or a small
team acting as one account) trying to keep track of a set of topics and accounts without
manually checking a dozen feeds a day. Every design decision optimizes for that: dense
information, low chrome, AI doing the first pass of triage so the human only sees what
already cleared a relevance bar.

The five core loops, in the order data flows through them:

1. **Configure** — the user defines *sources* (who/what to watch) and *topics* (what to
   watch for). This is the only fully manual step.
2. **Ingest** — `src/lib/ingestion/` pulls new content from each active source's feed.
3. **Match** — new content is keyword-matched against active topics
   (`content_topic_matches`, `match_reason: 'keyword'`) as a cheap first filter.
4. **Analyze** — every new item goes through Claude (`src/lib/ai/analyze.ts`) for the
   judgment a keyword match can't make: is this *actually* relevant, what does it mean,
   is there an opportunity in it, how urgent is it.
5. **Surface** — analysis above the user's bar becomes an alert; everything becomes
   searchable, filterable, and attributable back to its source and topic.

A sixth loop, **discover**, runs orthogonal to this: instead of processing content the
user already told the system to watch, it uses Claude with live web search to suggest
*new* sources for a topic — closing the loop from "I know what I'm looking for" to "I
found people/publications I didn't know existed."

## Why single-tenant ownership, not workspaces

Every table carries `user_id` and is RLS-scoped to `auth.uid()` directly (see
`supabase/schema.sql`) — there is no `workspaces` or `teams` layer, unlike, say,
ShareFair's `spaces`. That's a deliberate MVP cut, not an oversight: the core value
proposition (AI triage of a personal watch list) doesn't need multi-user collaboration to
prove out, and adding it later is additive, not a rewrite:

**Path to multi-tenant:** introduce a `workspaces` table and a `workspace_members` join
table (mirroring ShareFair's `spaces`/`space_members` pattern), add `workspace_id` to
`sources`, `topics`, `content_items`, `alerts`, etc. alongside the existing `user_id`
(keep `user_id` as "who added this" for provenance), and change RLS policies from
`user_id = auth.uid()` to a `is_workspace_member(workspace_id)` security-definer function
check (see ShareFair's `is_space_member` for the exact pattern to copy). The ingestion and
analysis pipelines don't change at all — they already operate on rows, not on the
ownership model directly.

## Ingestion architecture

`src/lib/ingestion/rss.ts` implements one connector: RSS/Atom, chosen because it's the
only ingestion path that works with **zero external credentials** — no API key
negotiation, no OAuth app review, no paid tier. It covers a genuinely large slice of the
"social web": blogs, YouTube channels (via their hidden RSS endpoint), most subreddits
(`.rss` suffix), and most news sites.

X/Twitter and LinkedIn don't offer this. Monitoring them requires their paid,
authenticated APIs. The system is built so adding them is additive:

```
src/lib/ingestion/
  rss.ts       — fetchFeed(url) -> FeedItem[]        (implemented)
  twitter.ts   — fetchTwitterUser(handle) -> FeedItem[]   (not implemented — needs X API v2 + OAuth)
  linkedin.ts  — fetchLinkedInCompany(id) -> FeedItem[]   (not implemented — needs LinkedIn Marketing API)
  sync.ts      — orchestrates: pick the right fetcher by source.platform, dedupe, match, log
```

Every fetcher returns the same `FeedItem` shape (`externalId`, `url`, `title`, `body`,
`authorName`, `publishedAt`). `sync.ts`'s `syncSource()` doesn't care which fetcher
produced the items — it hashes, dedupes (`content_items.content_hash`, unique per user),
keyword-matches against active topics, and logs to `ingestion_runs` identically regardless
of source. To add Twitter: write `twitter.ts` with that shape, branch on
`source.platform === "twitter"` in `syncSource()`, and everything downstream (analysis,
alerts, dashboard, search) works unchanged.

## AI architecture

Two distinct Claude usages, deliberately on different models:

**Analysis (`src/lib/ai/analyze.ts`)** runs on *every* ingested item — high volume, low
individual stakes, needs to be cheap and fast. Uses `claude-haiku-4-5` by default
(overridable via `ANTHROPIC_ANALYSIS_MODEL`) with a **forced tool call**
(`tool_choice: {type: "tool", name: "submit_analysis"}`) rather than free-text + JSON
parsing — this guarantees a well-formed response every time, which matters when the
pipeline runs unattended on a cron schedule with no human in the loop to catch a malformed
response.

**Discovery (`src/lib/ai/discover.ts`)** runs rarely (a handful of times per user per day
at most) and needs real, current information about the outside world — a much better fit
for Claude's server-side `web_search` tool than for the analysis model's speed/cost
profile. Uses `claude-sonnet-5` by default (`ANTHROPIC_DISCOVERY_MODEL`). The model is
given both `web_search` and a `propose_sources` tool with `tool_choice: "auto"` (not
forced) — it searches first, then calls `propose_sources` when it has real candidates, or
returns an empty list when it doesn't. Forcing a specific tool here would prevent the
model from using web search first.

**Why not a single model for both:** analysis is high-volume/low-stakes-per-item (a
misjudged priority is low-cost and self-corrects over many items); discovery is
low-volume/needs-accuracy-per-call (a fabricated source suggestion actively wastes the
user's time). Cost-optimizing analysis and quality-optimizing discovery independently
is the right tradeoff, not a single "good enough everywhere" model choice.

## Alerting model

Alerts aren't a separate detection pass — they're a threshold check on analysis output,
run inline in `src/lib/ai/pipeline.ts` right after `content_analysis` is written. Two
modes, chosen per-user automatically:

- **No `alert_rules` configured** (the common MVP case): alert on any item analyzed as
  `high` or `urgent` priority. Zero configuration required to get useful alerts.
- **`alert_rules` configured** (via Settings): each active rule can scope to a specific
  topic and/or source and set its own `min_priority`; the first matching rule fires the
  alert. This is additive — a user can start with zero rules and add precision later.

`digest_frequency` exists on `alert_rules` (`realtime`/`daily`/`weekly`) as schema
groundwork for a future digest-email feature; the MVP only implements `realtime`
(immediate in-app alert). Wiring `daily`/`weekly` means a new cron route that batches
unsent alerts per rule and emails a summary — the data model doesn't need to change.

## Security notes

- **RLS is the only data boundary for user-facing access** — every table with user data
  has `user_id = auth.uid()` policies; there is no server-side authorization check
  duplicating what RLS already enforces, by design (don't maintain two authorization
  systems that can drift).
- **The service-role client is isolated** (`src/lib/supabase/admin.ts`) and only ever
  imported from `src/app/api/cron/*` and `src/app/api/sources/[id]/sync` — both of which
  either verify a `CRON_SECRET` header or an authenticated user session before doing any
  writes. It is never imported into a client component or a page that renders
  user-supplied data without that check.
- **`content_items`, `content_analysis`, `content_topic_matches`, and
  `source_suggestions` have no client-facing INSERT policy** — only the service-role
  routes write to them. This means even a compromised client session can't forge fake
  "AI analysis" or inject fabricated content into another user's feed; it can only read
  and manage its own rows.
- **RSS fetches go through a 15-second timeout and a declared User-Agent**, and parsed
  HTML is stripped to plain text before storage (`stripHtml` in `rss.ts`) — ingested
  content is never rendered as HTML in the UI, only as plain text, so a malicious feed
  can't inject markup into the app.

## What a v2 would add, roughly in priority order

1. **Workspaces/teams** (see above) — the highest-leverage single change for a real
   product, since it unlocks shared monitoring for a company/team rather than one person.
2. **Twitter/X and LinkedIn connectors** — the biggest gap in "social media" coverage
   given RSS's blind spot for those two platforms specifically.
3. **Digest emails** (daily/weekly `alert_rules.digest_frequency`) — the schema is ready;
   needs an email provider (Resend, Postgres `pg_cron` or an external scheduler, and a
   template).
4. **Realtime** — Supabase Realtime subscriptions on `alerts` and `content_items` so the
   dashboard updates live instead of on refresh; the schema already supports it, this is
   purely a frontend wiring change (`supabase.channel(...)` in a client component).
5. **Multi-language UI** — the data model already carries `language`/`region` on sources
   and topics and the AI prompt is language-agnostic; the UI itself is English-only. An
   i18n layer (see ShareFair's `src/lib/i18n/` for the pattern this codebase already uses
   elsewhere) would be additive.
