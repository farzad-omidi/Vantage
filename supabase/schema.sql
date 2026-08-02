-- Vantage — AI-powered social media intelligence platform
-- Full schema: tables, indexes, RLS policies, triggers, and RPCs.
--
-- Ownership model: every row is scoped to a single owning user (user_id =
-- auth.uid()), enforced by RLS. There is no team/workspace layer in this
-- MVP — see docs/ARCHITECTURE.md for the multi-tenant path.
--
-- Two write paths:
--   1. The app, as a signed-in user, via the anon key — always RLS-scoped.
--   2. The ingestion/analysis cron routes (src/app/api/cron/*), via the
--      Supabase service role key — these run server-side only, iterate
--      across all users' active sources/topics, and intentionally bypass
--      RLS because they act as the platform itself, not as any one user.

-- ============================================================================
-- extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- categories — user-defined groupings, shared by sources and topics
-- ============================================================================
create table public.categories (
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
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,

  name text not null,
  handle text,
  platform text not null check (
    platform in ('rss', 'blog', 'youtube', 'reddit', 'twitter', 'linkedin', 'news', 'other')
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

  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'error')),
  last_sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_user_id_idx on public.sources(user_id);
create index sources_category_id_idx on public.sources(category_id);
create index sources_status_idx on public.sources(user_id, status) where status = 'active';

-- ============================================================================
-- topics — keywords / phrases / areas of interest
-- ============================================================================
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,

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

create index topics_user_id_idx on public.topics(user_id);
create index topics_status_idx on public.topics(user_id, status) where status = 'active';
create index topics_keywords_idx on public.topics using gin(keywords);

-- ============================================================================
-- content_items — ingested posts / articles / discussions
-- ============================================================================
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,

  platform text not null,
  external_id text,
  url text,
  author_name text,
  author_handle text,
  title text,
  body text,

  -- sha256(user_id + source_id + external_id-or-url), enforces dedupe on re-sync
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

create index content_items_user_published_idx on public.content_items(user_id, published_at desc nulls last);
create index content_items_source_id_idx on public.content_items(source_id);
create index content_items_search_idx on public.content_items using gin(search_vector);

-- ============================================================================
-- content_topic_matches — which topics a content item matched, and how
-- ============================================================================
create table public.content_topic_matches (
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_reason text not null default 'keyword' check (match_reason in ('keyword', 'ai')),
  created_at timestamptz not null default now(),
  primary key (content_item_id, topic_id)
);

create index content_topic_matches_topic_idx on public.content_topic_matches(topic_id);
create index content_topic_matches_user_idx on public.content_topic_matches(user_id);

-- ============================================================================
-- content_analysis — AI analysis output, one row per content item
-- ============================================================================
create table public.content_analysis (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null unique references public.content_items(id) on delete cascade,
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

create index content_analysis_user_priority_idx on public.content_analysis(user_id, priority);
create index content_analysis_user_analyzed_idx on public.content_analysis(user_id, analyzed_at desc);

-- ============================================================================
-- alerts — filtered, prioritized notifications surfaced to the user
-- ============================================================================
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,

  title text not null,
  message text,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  is_read boolean not null default false,

  created_at timestamptz not null default now()
);

create index alerts_user_unread_idx on public.alerts(user_id, is_read, created_at desc);

-- ============================================================================
-- alert_rules — what counts as worth alerting on
-- ============================================================================
create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,

  name text not null,
  min_priority text not null default 'medium' check (min_priority in ('low', 'medium', 'high', 'urgent')),
  digest_frequency text not null default 'realtime' check (digest_frequency in ('realtime', 'daily', 'weekly')),
  active boolean not null default true,

  created_at timestamptz not null default now()
);

create index alert_rules_user_idx on public.alert_rules(user_id) where active;

-- ============================================================================
-- source_notes / source_interactions — knowledge & relationship management
-- ============================================================================
create table public.source_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index source_notes_source_idx on public.source_notes(source_id, created_at desc);

create table public.source_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  kind text not null check (kind in ('viewed', 'contacted', 'replied', 'meeting', 'collaboration', 'other')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index source_interactions_source_idx on public.source_interactions(source_id, occurred_at desc);

-- ============================================================================
-- source_suggestions — discovery engine output
-- ============================================================================
create table public.source_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  handle text,
  platform text not null check (
    platform in ('rss', 'blog', 'youtube', 'reddit', 'twitter', 'linkedin', 'news', 'other')
  ),
  url text,
  reason text,
  based_on_topic_id uuid references public.topics(id) on delete set null,
  based_on_source_id uuid references public.sources(id) on delete set null,
  mention_count int not null default 1,

  status text not null default 'new' check (status in ('new', 'approved', 'dismissed')),
  discovered_at timestamptz not null default now(),

  -- Plain generated column (rather than an expression index) so PostgREST
  -- upsert(..., { onConflict: "user_id,platform,dedupe_key" }) can target it directly.
  dedupe_key text generated always as (lower(coalesce(handle, url, name))) stored
);

create unique index source_suggestions_dedupe_idx
  on public.source_suggestions(user_id, platform, dedupe_key);
create index source_suggestions_user_status_idx on public.source_suggestions(user_id, status);

-- ============================================================================
-- ingestion_runs — observability for the sync pipeline
-- ============================================================================
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  status text not null check (status in ('success', 'error')),
  items_found int not null default 0,
  items_new int not null default 0,
  error text,
  ran_at timestamptz not null default now()
);

create index ingestion_runs_source_idx on public.ingestion_runs(source_id, ran_at desc);

-- ============================================================================
-- historical views (RLS-respecting via security_invoker)
-- ============================================================================
create view public.topic_daily_activity
with (security_invoker = true) as
select
  m.user_id,
  m.topic_id,
  date_trunc('day', coalesce(ci.published_at, ci.fetched_at)) as day,
  count(*) as item_count,
  count(*) filter (where ca.priority in ('high', 'urgent')) as high_priority_count
from public.content_topic_matches m
join public.content_items ci on ci.id = m.content_item_id
left join public.content_analysis ca on ca.content_item_id = ci.id
group by m.user_id, m.topic_id, date_trunc('day', coalesce(ci.published_at, ci.fetched_at));

create view public.source_activity_summary
with (security_invoker = true) as
select
  s.id as source_id,
  s.user_id,
  count(ci.id) as total_items,
  max(ci.published_at) as last_item_at,
  count(ci.id) filter (where ci.fetched_at > now() - interval '7 days') as items_last_7_days
from public.sources s
left join public.content_items ci on ci.source_id = s.id
group by s.id, s.user_id;

-- ============================================================================
-- updated_at trigger (shared)
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

-- ============================================================================
-- profiles auto-create on signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public;

-- ============================================================================
-- approve_source_suggestion — atomically promote a suggestion into a source
-- ============================================================================
create or replace function public.approve_source_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion public.source_suggestions%rowtype;
  v_source_id uuid;
begin
  select * into v_suggestion
  from public.source_suggestions
  where id = p_suggestion_id and user_id = auth.uid() and status = 'new'
  for update;

  if not found then
    raise exception 'suggestion not found or already resolved';
  end if;

  insert into public.sources (user_id, name, handle, platform, profile_url, feed_url, description)
  values (
    v_suggestion.user_id,
    v_suggestion.name,
    v_suggestion.handle,
    v_suggestion.platform,
    v_suggestion.url,
    case when v_suggestion.platform in ('rss', 'blog') then v_suggestion.url else null end,
    v_suggestion.reason
  )
  returning id into v_source_id;

  update public.source_suggestions
  set status = 'approved'
  where id = p_suggestion_id;

  return v_source_id;
end;
$$;

revoke execute on function public.approve_source_suggestion(uuid) from public;
grant execute on function public.approve_source_suggestion(uuid) to authenticated;

-- ============================================================================
-- row level security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.sources enable row level security;
alter table public.topics enable row level security;
alter table public.content_items enable row level security;
alter table public.content_topic_matches enable row level security;
alter table public.content_analysis enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_rules enable row level security;
alter table public.source_notes enable row level security;
alter table public.source_interactions enable row level security;
alter table public.source_suggestions enable row level security;
alter table public.ingestion_runs enable row level security;

create policy profiles_select_self on public.profiles for select
  using (id = auth.uid());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy categories_all on public.categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sources_all on public.sources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy topics_all on public.topics for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy content_items_select on public.content_items for select
  using (user_id = auth.uid());
create policy content_items_delete on public.content_items for delete
  using (user_id = auth.uid());

create policy content_topic_matches_select on public.content_topic_matches for select
  using (user_id = auth.uid());

create policy content_analysis_select on public.content_analysis for select
  using (user_id = auth.uid());

create policy alerts_select on public.alerts for select
  using (user_id = auth.uid());
create policy alerts_update on public.alerts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alerts_delete on public.alerts for delete
  using (user_id = auth.uid());

create policy alert_rules_all on public.alert_rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_notes_all on public.source_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_interactions_all on public.source_interactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy source_suggestions_select on public.source_suggestions for select
  using (user_id = auth.uid());
create policy source_suggestions_update on public.source_suggestions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy source_suggestions_delete on public.source_suggestions for delete
  using (user_id = auth.uid());

create policy ingestion_runs_select on public.ingestion_runs for select
  using (user_id = auth.uid());

-- Note: content_items, content_analysis, content_topic_matches, and
-- source_suggestions are INSERTed only by the service-role cron routes
-- (src/app/api/cron/*), which bypass RLS by design — there is intentionally
-- no client-facing insert policy for those tables.
