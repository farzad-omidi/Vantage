-- Vantage — AI-powered social media intelligence platform
-- Full schema: schema, tables, indexes, RLS policies, triggers, and RPCs.
--
-- NAMESPACING: everything lives in a dedicated `vantage` Postgres schema
-- rather than `public`. That lets Vantage share a Supabase project with other
-- apps without colliding on common table names (`profiles`, `categories`) or
-- on the `on_auth_user_created` trigger. If you deploy to a dedicated project
-- you can still run this file unchanged.
--
-- After applying, expose the schema to PostgREST — either tick `vantage` under
-- Settings → API → Exposed schemas in the Supabase dashboard, or run the
-- `alter role authenticator` statement at the bottom of this file.
--
-- Ownership model: every row is scoped to a single owning user
-- (user_id = auth.uid()), enforced by RLS. There is no team/workspace layer in
-- this MVP — see docs/ARCHITECTURE.md for the multi-tenant path.

create schema if not exists vantage;

-- ============================================================================
-- profiles
-- ============================================================================
create table vantage.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- categories — user-defined groupings, shared by sources and topics
-- ============================================================================
create table vantage.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('source', 'topic')),
  name text not null,
  color text not null default '#6366f1',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

-- ============================================================================
-- sources — monitored accounts / feeds
-- ============================================================================
create table vantage.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references vantage.categories(id) on delete set null,

  name text not null,
  handle text,
  platform text not null check (
    platform in ('rss', 'blog', 'youtube', 'reddit', 'twitter', 'instagram',
                 'linkedin', 'news', 'email', 'other')
  ),
  profile_url text,
  feed_url text,

  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'active' check (status in ('active', 'paused')),

  -- knowledge / relationship management
  is_saved boolean not null default false,
  relationship_stage text not null default 'new' check (
    relationship_stage in ('new', 'watching', 'engaged', 'partner')
  ),

  avatar_url text,
  description text,
  language text not null default 'en',
  region text,

  -- Platform-neutral reach figure: YouTube subscribers today, Instagram
  -- followers once that adapter lands. Null when the platform exposes none.
  audience_size bigint,
  audience_checked_at timestamptz,

  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'error')),
  last_sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_user_id_idx on vantage.sources(user_id);
create index sources_category_id_idx on vantage.sources(category_id);
create index sources_status_idx on vantage.sources(user_id, status) where status = 'active';

-- ============================================================================
-- topics — keywords / phrases / areas of interest
-- ============================================================================
create table vantage.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references vantage.categories(id) on delete set null,

  name text not null,
  description text,
  keywords text[] not null default '{}',

  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'active' check (status in ('active', 'paused')),

  language text not null default 'en',
  region text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index topics_user_id_idx on vantage.topics(user_id);
create index topics_status_idx on vantage.topics(user_id, status) where status = 'active';
create index topics_keywords_idx on vantage.topics using gin(keywords);

-- ============================================================================
-- content_items — ingested posts / articles / discussions
-- ============================================================================
create table vantage.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references vantage.sources(id) on delete set null,

  platform text not null,
  external_id text,
  url text,
  author_name text,
  author_handle text,
  title text,
  body text,

  -- sha256(user_id + source_id + external_id), enforces dedupe on re-sync
  content_hash text not null,

  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw jsonb,

  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(author_name, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  unique (user_id, content_hash)
);

create index content_items_user_published_idx on vantage.content_items(user_id, published_at desc nulls last);
create index content_items_source_id_idx on vantage.content_items(source_id);
create index content_items_search_idx on vantage.content_items using gin(search_vector);

-- ============================================================================
-- content_topic_matches — which topics a content item matched, and how
-- ============================================================================
create table vantage.content_topic_matches (
  content_item_id uuid not null references vantage.content_items(id) on delete cascade,
  topic_id uuid not null references vantage.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_reason text not null default 'keyword' check (match_reason in ('keyword', 'ai')),
  created_at timestamptz not null default now(),
  primary key (content_item_id, topic_id)
);

create index content_topic_matches_topic_idx on vantage.content_topic_matches(topic_id);
create index content_topic_matches_user_idx on vantage.content_topic_matches(user_id);

-- ============================================================================
-- content_analysis — AI analysis output, one row per content item
-- ============================================================================
create table vantage.content_analysis (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null unique references vantage.content_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  is_relevant boolean not null default true,
  relevance_score numeric(4, 3),
  classification text,
  summary text,
  importance_explanation text,
  opportunities text[] not null default '{}',
  priority text not null default 'low' check (priority in ('low', 'medium', 'high', 'urgent')),
  sentiment text check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  language text,

  model text,
  analyzed_at timestamptz not null default now()
);

create index content_analysis_user_priority_idx on vantage.content_analysis(user_id, priority);
create index content_analysis_user_analyzed_idx on vantage.content_analysis(user_id, analyzed_at desc);

-- ============================================================================
-- alerts — filtered, prioritized notifications surfaced to the user
-- ============================================================================
create table vantage.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid references vantage.content_items(id) on delete cascade,
  source_id uuid references vantage.sources(id) on delete set null,
  topic_id uuid references vantage.topics(id) on delete set null,

  title text not null,
  message text,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  is_read boolean not null default false,

  created_at timestamptz not null default now()
);

create index alerts_user_unread_idx on vantage.alerts(user_id, is_read, created_at desc);

-- ============================================================================
-- alert_rules — what counts as worth alerting on
-- ============================================================================
create table vantage.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references vantage.topics(id) on delete cascade,
  source_id uuid references vantage.sources(id) on delete cascade,

  name text not null,
  min_priority text not null default 'medium' check (min_priority in ('low', 'medium', 'high', 'urgent')),
  digest_frequency text not null default 'realtime' check (digest_frequency in ('realtime', 'daily', 'weekly')),
  active boolean not null default true,

  created_at timestamptz not null default now()
);

create index alert_rules_user_idx on vantage.alert_rules(user_id) where active;

-- ============================================================================
-- source_notes / source_interactions — knowledge & relationship management
-- ============================================================================
create table vantage.source_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references vantage.sources(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index source_notes_source_idx on vantage.source_notes(source_id, created_at desc);

create table vantage.source_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references vantage.sources(id) on delete cascade,
  kind text not null check (kind in ('viewed', 'contacted', 'replied', 'meeting', 'collaboration', 'other')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index source_interactions_source_idx on vantage.source_interactions(source_id, occurred_at desc);

-- ============================================================================
-- source_suggestions — discovery engine output
-- ============================================================================
create table vantage.source_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  handle text,
  platform text not null check (
    platform in ('rss', 'blog', 'youtube', 'reddit', 'twitter', 'instagram',
                 'linkedin', 'news', 'email', 'other')
  ),
  url text,
  reason text,
  based_on_topic_id uuid references vantage.topics(id) on delete set null,
  based_on_source_id uuid references vantage.sources(id) on delete set null,
  mention_count int not null default 1,

  status text not null default 'new' check (status in ('new', 'approved', 'dismissed')),
  discovered_at timestamptz not null default now(),

  -- Plain generated column (rather than an expression index) so PostgREST
  -- upsert(..., { onConflict: "user_id,platform,dedupe_key" }) can target it.
  dedupe_key text generated always as (lower(coalesce(handle, url, name))) stored
);

create unique index source_suggestions_dedupe_idx
  on vantage.source_suggestions(user_id, platform, dedupe_key);
create index source_suggestions_user_status_idx on vantage.source_suggestions(user_id, status);

-- ============================================================================
-- ingestion_runs — observability for the sync pipeline
-- ============================================================================
create table vantage.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references vantage.sources(id) on delete cascade,
  status text not null check (status in ('success', 'error')),
  items_found int not null default 0,
  items_new int not null default 0,
  error text,
  ran_at timestamptz not null default now()
);

create index ingestion_runs_source_idx on vantage.ingestion_runs(source_id, ran_at desc);

-- ============================================================================
-- historical views (RLS-respecting via security_invoker)
-- ============================================================================
create view vantage.topic_daily_activity
with (security_invoker = true) as
select
  m.user_id,
  m.topic_id,
  date_trunc('day', coalesce(ci.published_at, ci.fetched_at)) as day,
  count(*) as item_count,
  count(*) filter (where ca.priority in ('high', 'urgent')) as high_priority_count
from vantage.content_topic_matches m
join vantage.content_items ci on ci.id = m.content_item_id
left join vantage.content_analysis ca on ca.content_item_id = ci.id
group by m.user_id, m.topic_id, date_trunc('day', coalesce(ci.published_at, ci.fetched_at));

create view vantage.source_activity_summary
with (security_invoker = true) as
select
  s.id as source_id,
  s.user_id,
  count(ci.id) as total_items,
  max(ci.published_at) as last_item_at,
  count(ci.id) filter (where ci.fetched_at > now() - interval '7 days') as items_last_7_days
from vantage.sources s
left join vantage.content_items ci on ci.source_id = s.id
group by s.id, s.user_id;

-- ============================================================================
-- updated_at trigger (shared)
-- ============================================================================
create or replace function vantage.set_updated_at()
returns trigger
language plpgsql
set search_path = vantage
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sources_set_updated_at
  before update on vantage.sources
  for each row execute function vantage.set_updated_at();

create trigger topics_set_updated_at
  before update on vantage.topics
  for each row execute function vantage.set_updated_at();

-- ============================================================================
-- profiles auto-create on signup
-- ============================================================================
-- The trigger is deliberately suffixed `_vantage`: a shared Supabase project
-- may already carry another app's `on_auth_user_created`. Both fire
-- independently, each populating its own app's profile table.
create or replace function vantage.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = vantage
as $$
begin
  insert into vantage.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_vantage
  after insert on auth.users
  for each row execute function vantage.handle_new_user();

revoke execute on function vantage.handle_new_user() from public;

-- Backfill for users that already exist (e.g. on a shared project).
insert into vantage.profiles (id, email, display_name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ============================================================================
-- approve_source_suggestion — atomically promote a suggestion into a source
-- ============================================================================
create or replace function vantage.approve_source_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = vantage
as $$
declare
  v_suggestion vantage.source_suggestions%rowtype;
  v_source_id uuid;
begin
  select * into v_suggestion
  from vantage.source_suggestions
  where id = p_suggestion_id and user_id = auth.uid() and status = 'new'
  for update;

  if not found then
    raise exception 'suggestion not found or already resolved';
  end if;

  insert into vantage.sources (user_id, name, handle, platform, profile_url, feed_url, description)
  values (
    v_suggestion.user_id,
    v_suggestion.name,
    v_suggestion.handle,
    v_suggestion.platform,
    v_suggestion.url,
    -- youtube joins rss/blog here: a channel URL is not itself a feed, but
    -- syncSource resolves it to one, so an approved channel is syncable
    -- immediately instead of arriving inert.
    case when v_suggestion.platform in ('rss', 'blog', 'youtube') then v_suggestion.url else null end,
    v_suggestion.reason
  )
  returning id into v_source_id;

  update vantage.source_suggestions set status = 'approved' where id = p_suggestion_id;

  return v_source_id;
end;
$$;

revoke execute on function vantage.approve_source_suggestion(uuid) from public;
grant execute on function vantage.approve_source_suggestion(uuid) to authenticated;

-- ============================================================================
-- row level security
-- ============================================================================
alter table vantage.profiles enable row level security;
alter table vantage.categories enable row level security;
alter table vantage.sources enable row level security;
alter table vantage.topics enable row level security;
alter table vantage.content_items enable row level security;
alter table vantage.content_topic_matches enable row level security;
alter table vantage.content_analysis enable row level security;
alter table vantage.alerts enable row level security;
alter table vantage.alert_rules enable row level security;
alter table vantage.source_notes enable row level security;
alter table vantage.source_interactions enable row level security;
alter table vantage.source_suggestions enable row level security;
alter table vantage.ingestion_runs enable row level security;

create policy profiles_select_self on vantage.profiles for select
  using (id = auth.uid());
create policy profiles_update_self on vantage.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy categories_all on vantage.categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sources_all on vantage.sources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy topics_all on vantage.topics for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Content, matches, analysis, alerts, suggestions and run logs are written by
-- the ingestion/analysis pipeline. Writes are permitted only for the caller's
-- OWN rows, which is what preserves the property that matters: nobody can
-- inject content or forged analysis into someone else's feed. Scoping writes
-- this way (rather than requiring the service role) is what lets the in-app
-- "Sync now" and "Run discovery" work on a plain user session.
create policy content_items_select on vantage.content_items for select
  using (user_id = auth.uid());
create policy content_items_insert on vantage.content_items for insert
  with check (user_id = auth.uid());
create policy content_items_delete on vantage.content_items for delete
  using (user_id = auth.uid());

create policy content_topic_matches_select on vantage.content_topic_matches for select
  using (user_id = auth.uid());
create policy content_topic_matches_insert on vantage.content_topic_matches for insert
  with check (user_id = auth.uid());
create policy content_topic_matches_delete on vantage.content_topic_matches for delete
  using (user_id = auth.uid());

create policy content_analysis_select on vantage.content_analysis for select
  using (user_id = auth.uid());
create policy content_analysis_insert on vantage.content_analysis for insert
  with check (user_id = auth.uid());

create policy alerts_select on vantage.alerts for select
  using (user_id = auth.uid());
create policy alerts_insert on vantage.alerts for insert
  with check (user_id = auth.uid());
create policy alerts_update on vantage.alerts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alerts_delete on vantage.alerts for delete
  using (user_id = auth.uid());

create policy alert_rules_all on vantage.alert_rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_notes_all on vantage.source_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_interactions_all on vantage.source_interactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_suggestions_select on vantage.source_suggestions for select
  using (user_id = auth.uid());
create policy source_suggestions_insert on vantage.source_suggestions for insert
  with check (user_id = auth.uid());
create policy source_suggestions_update on vantage.source_suggestions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy source_suggestions_delete on vantage.source_suggestions for delete
  using (user_id = auth.uid());

create policy ingestion_runs_select on vantage.ingestion_runs for select
  using (user_id = auth.uid());
create policy ingestion_runs_insert on vantage.ingestion_runs for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- grants — a custom schema starts with none
-- ============================================================================
grant usage on schema vantage to anon, authenticated, service_role;
grant all on all tables in schema vantage to anon, authenticated, service_role;
grant all on all sequences in schema vantage to anon, authenticated, service_role;
grant all on all functions in schema vantage to anon, authenticated, service_role;

alter default privileges in schema vantage
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema vantage
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema vantage
  grant all on functions to anon, authenticated, service_role;

-- ============================================================================
-- expose the schema to PostgREST
-- ============================================================================
-- Equivalent to ticking `vantage` under Settings → API → Exposed schemas.
-- Keep `public` and `graphql_public` in the list or you will break any other
-- app sharing this project.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, vantage';
notify pgrst, 'reload config';
