-- Persona Intelligence: initial schema
--
-- Design notes
-- * Every table carries user_id so Row Level Security can be expressed as a
--   single, auditable rule: a row is visible only to its owner.
-- * Child rows (sources, claims, briefs, notes, ...) must also reference a
--   research project the caller owns. Because the ownership sub-select runs
--   under RLS too, a user can never attach rows to someone else's project.
-- * Public-source data (sources, claims, profile_sections) and private user
--   content (user_notes, user overrides) live in separate columns/tables.
-- * All deletes cascade from auth.users and research_projects so account and
--   project deletion leave no orphaned personal data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- User settings (one row per auth user)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  research_preferences jsonb not null default '{}'::jsonb,
  retention_days integer not null default 365 check (retention_days between 7 and 3650),
  daily_research_quota integer not null default 10 check (daily_research_quota between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Research projects
-- ---------------------------------------------------------------------------

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  research_objective text check (char_length(research_objective) <= 2000),
  -- Validated search input (name, company, role, location, profile URL, context).
  input jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_input', 'completed', 'partial', 'failed')),
  person_id uuid,
  last_researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_projects_user_updated_idx on public.research_projects (user_id, updated_at desc);

create trigger research_projects_updated_at before update on public.research_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Persons (the researched individual, scoped to the researching user)
-- ---------------------------------------------------------------------------

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 200),
  normalized_attributes jsonb not null default '{}'::jsonb,
  public_description text check (char_length(public_description) <= 2000),
  identity_status text not null default 'unconfirmed'
    check (identity_status in ('unconfirmed', 'ambiguous', 'user_confirmed', 'matched_by_identifiers')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index persons_project_idx on public.persons (research_project_id);
create index persons_user_idx on public.persons (user_id);

create trigger persons_updated_at before update on public.persons
  for each row execute function public.set_updated_at();

alter table public.research_projects
  add constraint research_projects_person_fk
  foreign key (person_id) references public.persons (id) on delete set null;

create table public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  identifier_type text not null
    check (identifier_type in ('profile_url', 'personal_website', 'company', 'role', 'location', 'other')),
  value text not null check (char_length(value) <= 2048),
  verification_status text not null default 'user_supplied'
    check (verification_status in ('user_supplied', 'observed_in_source', 'user_confirmed', 'unverified')),
  created_at timestamptz not null default now()
);

create index person_identifiers_person_idx on public.person_identifiers (person_id);

-- ---------------------------------------------------------------------------
-- Research jobs
-- ---------------------------------------------------------------------------

create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  kind text not null default 'initial' check (kind in ('initial', 'refresh')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_input', 'completed', 'partial', 'failed')),
  current_stage text,
  -- Per-stage status log: [{stage, status, message, at}]
  progress jsonb not null default '[]'::jsonb,
  -- Identity candidates awaiting the user's choice, and the chosen one.
  identity jsonb not null default '{}'::jsonb,
  error_details jsonb,
  quality_report jsonb,
  usage jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index research_jobs_project_idx on public.research_jobs (research_project_id, created_at desc);
create index research_jobs_user_created_idx on public.research_jobs (user_id, created_at desc);
create index research_jobs_user_active_idx on public.research_jobs (user_id) where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  job_id uuid references public.research_jobs (id) on delete set null,
  url text not null check (char_length(url) <= 2048),
  normalized_url text not null check (char_length(normalized_url) <= 2048),
  title text check (char_length(title) <= 500),
  domain text not null,
  source_type text not null,
  author text check (char_length(author) <= 300),
  published_at date,
  accessed_at timestamptz not null default now(),
  excerpt text check (char_length(excerpt) <= 4000),
  -- Bounded plain-text extract used for evidence checking. Never raw HTML.
  content_text text check (char_length(content_text) <= 60000),
  retrieval_status text not null default 'snippet_only'
    check (retrieval_status in ('snippet_only', 'retrieved', 'not_permitted', 'blocked', 'failed')),
  retrieval_note text check (char_length(retrieval_note) <= 500),
  relevance text not null default 'unassessed'
    check (relevance in ('unassessed', 'about_person', 'possibly_about_person', 'unrelated')),
  provider text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_project_id, normalized_url)
);

create index sources_project_idx on public.sources (research_project_id);
create index sources_user_idx on public.sources (user_id);

-- ---------------------------------------------------------------------------
-- Claims and evidence
-- ---------------------------------------------------------------------------

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid references public.persons (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  job_id uuid references public.research_jobs (id) on delete cascade,
  claim_text text not null check (char_length(claim_text) <= 2000),
  category text not null,
  evidence_type text not null
    check (evidence_type in ('documented_fact', 'self_statement', 'secondary_report', 'interpretation', 'hypothesis', 'unknown')),
  confidence_label text not null
    check (confidence_label in ('high', 'moderate', 'low', 'insufficient')),
  confidence_rationale text not null,
  verification_status text not null
    check (verification_status in ('corroborated', 'single_source', 'conflicting', 'unverified')),
  temporal_status text not null default 'unknown' check (temporal_status in ('current', 'historical', 'unknown')),
  conflict_group text,
  limitations text,
  first_observed_date date,
  last_observed_date date,
  created_at timestamptz not null default now()
);

create index claims_project_idx on public.claims (research_project_id, job_id);
create index claims_user_idx on public.claims (user_id);

create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  supporting_excerpt text not null check (char_length(supporting_excerpt) <= 2000),
  evidence_relationship text not null default 'supports'
    check (evidence_relationship in ('supports', 'contradicts', 'context')),
  source_credibility text not null
    check (source_credibility in ('primary', 'established_publication', 'secondary', 'user_generated', 'unknown')),
  support_strength text not null check (support_strength in ('direct', 'partial', 'indirect')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index claim_evidence_claim_idx on public.claim_evidence (claim_id);
create index claim_evidence_source_idx on public.claim_evidence (source_id);

-- ---------------------------------------------------------------------------
-- Profile sections (versioned; user edits stored separately from generated content)
-- ---------------------------------------------------------------------------

create table public.profile_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid references public.persons (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  job_id uuid references public.research_jobs (id) on delete set null,
  section_type text not null,
  structured_content jsonb not null,
  version integer not null default 1,
  is_current boolean not null default true,
  -- User-written replacement for the generated summary. Never overwritten by regeneration.
  user_override text check (char_length(user_override) <= 10000),
  user_override_at timestamptz,
  generated_at timestamptz not null default now(),
  model_metadata jsonb not null default '{}'::jsonb
);

create index profile_sections_project_idx on public.profile_sections (research_project_id, section_type, version desc);
create unique index profile_sections_one_current_idx
  on public.profile_sections (research_project_id, section_type) where is_current;

-- ---------------------------------------------------------------------------
-- Meeting briefs
-- ---------------------------------------------------------------------------

create table public.meeting_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  objective text not null,
  context jsonb not null default '{}'::jsonb,
  structured_brief jsonb not null,
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meeting_briefs_project_idx on public.meeting_briefs (research_project_id, created_at desc);
create index meeting_briefs_user_idx on public.meeting_briefs (user_id, created_at desc);

create trigger meeting_briefs_updated_at before update on public.meeting_briefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Private user notes
-- ---------------------------------------------------------------------------

create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  person_id uuid references public.persons (id) on delete set null,
  section_type text,
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_notes_project_idx on public.user_notes (research_project_id, created_at desc);

create trigger user_notes_updated_at before update on public.user_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Usage accounting and audit trail
-- ---------------------------------------------------------------------------

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.research_jobs (id) on delete set null,
  kind text not null check (kind in ('search_query', 'page_fetch', 'ai_call')),
  provider text not null,
  units integer not null default 1,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) <= 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.user_settings enable row level security;
alter table public.research_projects enable row level security;
alter table public.persons enable row level security;
alter table public.person_identifiers enable row level security;
alter table public.research_jobs enable row level security;
alter table public.sources enable row level security;
alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.profile_sections enable row level security;
alter table public.meeting_briefs enable row level security;
alter table public.user_notes enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_events enable row level security;

-- Owner-only tables without a project parent.
create policy user_settings_owner on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy research_projects_owner on public.research_projects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Project children: owner only, and the referenced project must be the owner's.
create policy persons_owner on public.persons
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy person_identifiers_owner on public.person_identifiers
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.persons p where p.id = person_id and p.user_id = auth.uid())
  );

create policy research_jobs_owner on public.research_jobs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy sources_owner on public.sources
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy claims_owner on public.claims
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy claim_evidence_owner on public.claim_evidence
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.claims c where c.id = claim_id and c.user_id = auth.uid())
    and exists (select 1 from public.sources s where s.id = source_id and s.user_id = auth.uid())
  );

create policy profile_sections_owner on public.profile_sections
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy meeting_briefs_owner on public.meeting_briefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

create policy user_notes_owner on public.user_notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_projects p where p.id = research_project_id and p.user_id = auth.uid())
  );

-- Usage and audit rows are append-only for users: readable and insertable, never editable.
create policy usage_events_select on public.usage_events
  for select to authenticated using (user_id = auth.uid());
create policy usage_events_insert on public.usage_events
  for insert to authenticated with check (user_id = auth.uid());

create policy audit_events_select on public.audit_events
  for select to authenticated using (user_id = auth.uid());
create policy audit_events_insert on public.audit_events
  for insert to authenticated with check (user_id = auth.uid());

-- The anon role gets nothing.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on public.usage_events, public.audit_events from authenticated;

-- ---------------------------------------------------------------------------
-- Retention and account deletion
-- ---------------------------------------------------------------------------

-- Deletes the caller's research projects that have not been updated within
-- their configured retention window. Runs with the caller's privileges (RLS applies).
create or replace function public.apply_my_retention()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days integer;
  v_deleted integer;
begin
  select retention_days into v_days from public.user_settings where user_id = auth.uid();
  if v_days is null then
    v_days := 365;
  end if;
  delete from public.research_projects
   where user_id = auth.uid()
     and updated_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Service-level sweep for scheduled execution (e.g. pg_cron). Not callable by app users.
create or replace function public.purge_expired_research()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.research_projects p
   using (
     select u.id as user_id, coalesce(s.retention_days, 365) as days
       from auth.users u
       left join public.user_settings s on s.user_id = u.id
   ) r
   where p.user_id = r.user_id
     and p.updated_at < now() - make_interval(days => r.days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_research() from public, anon, authenticated;

-- Lets a signed-in user delete their own account. All application data cascades.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.apply_my_retention() to authenticated;

-- ---------------------------------------------------------------------------
-- Profile section versioning
-- ---------------------------------------------------------------------------

-- Atomically saves new versions of profile sections. The previous current
-- version is kept for history, and any user-written override is carried over
-- unchanged: regeneration never silently replaces user content.
-- p_sections: [{ "section_type": text, "structured_content": jsonb, "model_metadata": jsonb }]
create or replace function public.save_profile_sections(
  p_project_id uuid,
  p_person_id uuid,
  p_job_id uuid,
  p_sections jsonb
)
returns setof public.profile_sections
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_prev public.profile_sections;
  v_row public.profile_sections;
begin
  if not exists (select 1 from public.research_projects where id = p_project_id and user_id = auth.uid()) then
    raise exception 'project not found' using errcode = '42501';
  end if;
  for v_item in select * from jsonb_array_elements(p_sections)
  loop
    select * into v_prev
      from public.profile_sections
     where research_project_id = p_project_id
       and section_type = v_item->>'section_type'
       and is_current
     for update;

    if found then
      update public.profile_sections set is_current = false where id = v_prev.id;
    end if;

    insert into public.profile_sections (
      user_id, person_id, research_project_id, job_id, section_type, structured_content,
      version, is_current, user_override, user_override_at, model_metadata
    ) values (
      auth.uid(), p_person_id, p_project_id, p_job_id, v_item->>'section_type', v_item->'structured_content',
      coalesce(v_prev.version, 0) + 1, true, v_prev.user_override, v_prev.user_override_at,
      coalesce(v_item->'model_metadata', '{}'::jsonb)
    )
    returning * into v_row;
    return next v_row;
    v_prev := null;
  end loop;
end;
$$;

grant execute on function public.save_profile_sections(uuid, uuid, uuid, jsonb) to authenticated;
