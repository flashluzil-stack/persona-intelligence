-- Persona Intelligence: localization preference, freemium entitlements and billing.
--
-- Security model
-- * Users can READ their own billing rows (purchases, credits, subscriptions,
--   unlocks). They can never write them: all writes go through SECURITY DEFINER
--   functions executable only by service_role, called from verified server code
--   (signed payment webhooks, or an authenticated route that has already
--   checked ownership).
-- * billing_events (raw webhook payloads) are not readable by users at all.
-- * Credit balances are the sum of an append-only ledger; every entry has a
--   unique idempotency key, so retries and concurrent requests cannot double
--   charge or double grant.

-- ---------------------------------------------------------------------------
-- Language preference
-- ---------------------------------------------------------------------------

alter table public.user_settings
  add column if not exists locale text check (locale in ('en', 'he'));

-- ---------------------------------------------------------------------------
-- Billing tables
-- ---------------------------------------------------------------------------

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  product_key text not null,
  kind text not null check (kind in ('report', 'credits', 'subscription')),
  research_project_id uuid references public.research_projects (id) on delete set null,
  credits integer not null default 0 check (credits >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  provider_transaction_id text unique,
  provider_subscription_id text,
  amount_minor bigint,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

create index purchases_user_created_idx on public.purchases (user_id, created_at desc);

create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'consume', 'refund', 'adjustment')),
  purchase_id uuid references public.purchases (id) on delete set null,
  research_project_id uuid references public.research_projects (id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null unique,
  product_key text not null,
  status text not null check (status in ('active', 'trialing', 'past_due', 'paused', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, updated_at desc);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- One unlock per report. A report belongs to exactly one user.
create table public.report_unlocks (
  research_project_id uuid primary key references public.research_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('purchase', 'credits', 'subscription', 'grandfathered', 'admin')),
  purchase_id uuid references public.purchases (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index report_unlocks_user_idx on public.report_unlocks (user_id, created_at desc);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- RLS: read-own for users, no user writes, billing_events closed.
-- ---------------------------------------------------------------------------

alter table public.billing_customers enable row level security;
alter table public.purchases enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.subscriptions enable row level security;
alter table public.report_unlocks enable row level security;
alter table public.billing_events enable row level security;

create policy billing_customers_read_own on public.billing_customers for select to authenticated using (user_id = auth.uid());
create policy purchases_read_own on public.purchases for select to authenticated using (user_id = auth.uid());
create policy credit_ledger_read_own on public.credit_ledger for select to authenticated using (user_id = auth.uid());
create policy subscriptions_read_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy report_unlocks_read_own on public.report_unlocks for select to authenticated using (user_id = auth.uid());

-- Supabase grants broad default privileges on new public tables; narrow them.
revoke all on public.billing_customers, public.purchases, public.credit_ledger,
  public.subscriptions, public.report_unlocks, public.billing_events from anon, authenticated;
grant select on public.billing_customers, public.purchases, public.credit_ledger,
  public.subscriptions, public.report_unlocks to authenticated;
grant all on public.billing_customers, public.purchases, public.credit_ledger,
  public.subscriptions, public.report_unlocks, public.billing_events to service_role;

-- Existing reports created before the paywall stay fully accessible.
insert into public.report_unlocks (research_project_id, user_id, source)
select id, user_id, 'grandfathered' from public.research_projects
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Entitlement functions (service_role only)
-- ---------------------------------------------------------------------------

-- A report is ready to unlock when it has a generated profile.
create or replace function public.billing_report_ready(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_sections
     where research_project_id = p_project and is_current and section_type = 'overview'
  );
$$;

create or replace function public.billing_credit_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where user_id = p_user;
$$;

-- Atomically spends credits to unlock one report. Safe under retries and concurrency.
create or replace function public.billing_unlock_with_credits(p_user uuid, p_project uuid, p_cost integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_cost is null or p_cost < 1 then
    raise exception 'invalid credit cost';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user::text, 0));
  if not exists (select 1 from public.research_projects where id = p_project and user_id = p_user) then
    return 'not_found';
  end if;
  if exists (select 1 from public.report_unlocks where research_project_id = p_project) then
    return 'already_unlocked';
  end if;
  if not public.billing_report_ready(p_project) then
    return 'not_ready';
  end if;
  select coalesce(sum(delta), 0) into v_balance from public.credit_ledger where user_id = p_user;
  if v_balance < p_cost then
    return 'insufficient_credits';
  end if;
  insert into public.credit_ledger (user_id, delta, reason, research_project_id, idempotency_key)
  values (p_user, -p_cost, 'consume', p_project, 'consume:' || p_project::text);
  insert into public.report_unlocks (research_project_id, user_id, source)
  values (p_project, p_user, 'credits');
  return 'unlocked';
end;
$$;

-- Unlocks a report under an active subscription, enforcing the per-period fair-use limit.
create or replace function public.billing_unlock_with_subscription(p_user uuid, p_project uuid, p_period_limit integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions;
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user::text, 0));
  if not exists (select 1 from public.research_projects where id = p_project and user_id = p_user) then
    return 'not_found';
  end if;
  if exists (select 1 from public.report_unlocks where research_project_id = p_project) then
    return 'already_unlocked';
  end if;
  if not public.billing_report_ready(p_project) then
    return 'not_ready';
  end if;
  select * into v_sub from public.subscriptions
   where user_id = p_user
     and (status in ('active', 'trialing')
          or (status in ('past_due', 'canceled') and current_period_end > now()))
   order by current_period_end desc nulls last
   limit 1;
  if not found then
    return 'no_subscription';
  end if;
  select count(*) into v_used from public.report_unlocks
   where user_id = p_user and source = 'subscription'
     and created_at >= coalesce(v_sub.current_period_start, now() - interval '31 days');
  if p_period_limit is not null and v_used >= p_period_limit then
    return 'fair_use_limit';
  end if;
  insert into public.report_unlocks (research_project_id, user_id, source, subscription_id)
  values (p_project, p_user, 'subscription', v_sub.id);
  return 'unlocked';
end;
$$;

-- Marks a purchase paid and grants what it bought. Idempotent.
create or replace function public.billing_complete_purchase(
  p_purchase uuid, p_transaction text, p_amount_minor bigint, p_currency text, p_subscription text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.purchases;
begin
  select * into v_p from public.purchases where id = p_purchase for update;
  if not found then
    return 'not_found';
  end if;
  if v_p.provider_transaction_id is not null and v_p.provider_transaction_id <> p_transaction then
    return 'transaction_mismatch';
  end if;
  if v_p.status = 'refunded' then
    return 'refunded';
  end if;
  if v_p.status <> 'paid' then
    update public.purchases
       set status = 'paid', paid_at = now(), provider_transaction_id = p_transaction,
           amount_minor = coalesce(p_amount_minor, amount_minor), currency = coalesce(p_currency, currency),
           provider_subscription_id = coalesce(p_subscription, provider_subscription_id)
     where id = p_purchase;
  end if;
  if v_p.kind = 'credits' and v_p.credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, purchase_id, idempotency_key)
    values (v_p.user_id, v_p.credits, 'purchase', v_p.id, 'purchase:' || v_p.id::text)
    on conflict (idempotency_key) do nothing;
  elsif v_p.kind = 'report' and v_p.research_project_id is not null then
    insert into public.report_unlocks (research_project_id, user_id, source, purchase_id)
    select v_p.research_project_id, v_p.user_id, 'purchase', v_p.id
     where exists (select 1 from public.research_projects where id = v_p.research_project_id and user_id = v_p.user_id)
    on conflict (research_project_id) do nothing;
  end if;
  return 'paid';
end;
$$;

-- Reverses a refunded purchase. Idempotent.
create or replace function public.billing_refund_purchase(p_purchase uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.purchases;
begin
  select * into v_p from public.purchases where id = p_purchase for update;
  if not found then
    return 'not_found';
  end if;
  if v_p.status = 'refunded' then
    return 'already_refunded';
  end if;
  update public.purchases set status = 'refunded', refunded_at = now() where id = p_purchase;
  if v_p.kind = 'credits' and v_p.credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, purchase_id, idempotency_key)
    values (v_p.user_id, -v_p.credits, 'refund', v_p.id, 'refund:' || v_p.id::text)
    on conflict (idempotency_key) do nothing;
  elsif v_p.kind = 'report' then
    delete from public.report_unlocks where purchase_id = v_p.id and source = 'purchase';
  end if;
  return 'refunded';
end;
$$;

-- Creates or updates a subscription from a verified provider event.
create or replace function public.billing_upsert_subscription(
  p_user uuid, p_provider text, p_provider_subscription text, p_product text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean, p_canceled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.subscriptions (user_id, provider, provider_subscription_id, product_key, status,
    current_period_start, current_period_end, cancel_at_period_end, canceled_at)
  values (p_user, p_provider, p_provider_subscription, p_product, p_status,
    p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false), p_canceled_at)
  on conflict (provider_subscription_id) do update
    set status = excluded.status,
        product_key = excluded.product_key,
        current_period_start = coalesce(excluded.current_period_start, subscriptions.current_period_start),
        current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = coalesce(excluded.canceled_at, subscriptions.canceled_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- Moves everything owned by an anonymous (guest) user to a permanent account.
create or replace function public.transfer_guest_data(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_from = p_to then
    return 0;
  end if;
  if not exists (select 1 from auth.users where id = p_from and is_anonymous) then
    raise exception 'source user is not a guest account';
  end if;
  if not exists (select 1 from auth.users where id = p_to and not is_anonymous) then
    raise exception 'target user is not a permanent account';
  end if;
  update public.research_projects set user_id = p_to where user_id = p_from;
  get diagnostics v_count = row_count;
  update public.persons set user_id = p_to where user_id = p_from;
  update public.person_identifiers set user_id = p_to where user_id = p_from;
  update public.research_jobs set user_id = p_to where user_id = p_from;
  update public.sources set user_id = p_to where user_id = p_from;
  update public.claims set user_id = p_to where user_id = p_from;
  update public.claim_evidence set user_id = p_to where user_id = p_from;
  update public.profile_sections set user_id = p_to where user_id = p_from;
  update public.meeting_briefs set user_id = p_to where user_id = p_from;
  update public.user_notes set user_id = p_to where user_id = p_from;
  update public.usage_events set user_id = p_to where user_id = p_from;
  update public.report_unlocks set user_id = p_to where user_id = p_from;
  update public.purchases set user_id = p_to where user_id = p_from;
  update public.credit_ledger set user_id = p_to where user_id = p_from;
  delete from auth.users where id = p_from;
  return v_count;
end;
$$;

-- Global count of research runs today by users without an active subscription
-- (the cost-exposed "free" traffic). Returns only an aggregate number.
create or replace function public.free_research_runs_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.research_jobs j
   where j.created_at >= date_trunc('day', now())
     and not exists (
       select 1 from public.subscriptions s
        where s.user_id = j.user_id
          and (s.status in ('active', 'trialing') or (s.status in ('past_due', 'canceled') and s.current_period_end > now()))
     );
$$;

revoke all on function public.billing_report_ready(uuid) from public, anon, authenticated;
revoke all on function public.billing_credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.billing_unlock_with_credits(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.billing_unlock_with_subscription(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.billing_complete_purchase(uuid, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.billing_refund_purchase(uuid) from public, anon, authenticated;
revoke all on function public.billing_upsert_subscription(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.transfer_guest_data(uuid, uuid) from public, anon, authenticated;
revoke all on function public.free_research_runs_today() from public, anon;

grant execute on function public.billing_report_ready(uuid) to service_role;
grant execute on function public.billing_credit_balance(uuid) to service_role;
grant execute on function public.billing_unlock_with_credits(uuid, uuid, integer) to service_role;
grant execute on function public.billing_unlock_with_subscription(uuid, uuid, integer) to service_role;
grant execute on function public.billing_complete_purchase(uuid, text, bigint, text, text) to service_role;
grant execute on function public.billing_refund_purchase(uuid) to service_role;
grant execute on function public.billing_upsert_subscription(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) to service_role;
grant execute on function public.transfer_guest_data(uuid, uuid) to service_role;
grant execute on function public.free_research_runs_today() to authenticated, service_role;
