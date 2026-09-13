-- Additive reporting and intelligence schema. This migration preserves every
-- imported transaction and import batch.

alter table public.profiles
  add column if not exists ars_exchange_rate_method text;

alter table public.categories
  add column if not exists is_extraordinary boolean not null default false;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'other' check (role in ('self', 'partner', 'provider', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country_code text,
  country_name text,
  default_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, country_code, name)
);

create table public.location_currency_hints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  weight numeric(5, 4) not null default 0.2 check (weight between 0 and 1),
  created_at timestamptz not null default now(),
  unique (user_id, currency, location_id)
);

create table public.location_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  period_type text not null default 'stay' check (period_type in ('location', 'stay', 'temporary_stay', 'home_base')),
  trip_purpose text,
  confidence numeric(5, 4) not null default 0 check (confidence between 0 and 1),
  explanation text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index location_periods_user_dates_idx on public.location_periods(user_id, starts_on, ends_on);

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rate_date date not null,
  source_currency text not null,
  reporting_currency text not null default 'USD',
  rate_to_reporting numeric(30, 12) not null check (rate_to_reporting > 0),
  source text not null,
  methodology text not null,
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, rate_date, source_currency, reporting_currency, source, methodology)
);

create table public.transaction_reporting_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  exchange_rate_id uuid references public.exchange_rates(id) on delete set null,
  reporting_currency text not null default 'USD',
  reporting_amount numeric(24, 8) not null,
  rate_to_reporting numeric(30, 12) not null check (rate_to_reporting > 0),
  source text not null,
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, reporting_currency)
);

create table public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  display_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  country_code text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create table public.recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_profile_id uuid references public.merchant_profiles(id) on delete set null,
  provider_name text not null,
  merchant_key text not null,
  category_id uuid references public.categories(id) on delete set null,
  country_code text,
  frequency text not null default 'uncertain' check (frequency in ('weekly', 'monthly', 'quarterly', 'annual', 'uncertain')),
  status text not null default 'uncertain' check (status in ('active', 'inactive', 'uncertain')),
  expected_amount numeric(24, 8),
  currency text,
  next_expected_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create table public.recurring_obligation_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_obligation_id uuid not null references public.recurring_obligations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (recurring_obligation_id, transaction_id)
);

create table public.expense_period_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  recurring_obligation_id uuid references public.recurring_obligations(id) on delete set null,
  service_month date not null,
  amount numeric(24, 8) not null,
  currency text not null,
  reporting_amount numeric(24, 8),
  reporting_currency text not null default 'USD',
  is_estimated boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, service_month)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_key text not null,
  insight_type text not null,
  title text not null,
  body text not null,
  priority integer not null default 50,
  transaction_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, insight_key)
);

alter table public.transactions
  add column if not exists account_owner_id uuid references public.people(id) on delete set null,
  add column if not exists paid_by_id uuid references public.people(id) on delete set null,
  add column if not exists beneficiary_scope text not null default 'personal' check (beneficiary_scope in ('personal', 'shared', 'partner', 'other')),
  add column if not exists reimbursement_status text not null default 'none' check (reimbursement_status in ('none', 'expected', 'partial', 'settled', 'uncertain')),
  add column if not exists merchant_name text,
  add column if not exists merchant_key text,
  add column if not exists merchant_country text,
  add column if not exists merchant_city text,
  add column if not exists location_period_id uuid references public.location_periods(id) on delete set null,
  add column if not exists travel_origin text,
  add column if not exists travel_destination text,
  add column if not exists travel_date date;

alter table public.expense_splits
  add column if not exists beneficiary_person_id uuid references public.people(id) on delete set null;

alter table public.questions
  add column if not exists group_key text,
  add column if not exists priority integer not null default 50,
  add column if not exists supporting_transaction_ids uuid[] not null default '{}';
create unique index if not exists questions_user_group_key_idx on public.questions(user_id, group_key) where group_key is not null;

create index if not exists transactions_location_idx on public.transactions(user_id, location_period_id, occurred_at);
create index if not exists transactions_merchant_idx on public.transactions(user_id, merchant_name, occurred_at);
create index if not exists reporting_values_transaction_idx on public.transaction_reporting_values(user_id, transaction_id);
create index if not exists recurring_obligations_user_idx on public.recurring_obligations(user_id, status);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'people','locations','location_currency_hints','location_periods','exchange_rates',
    'transaction_reporting_values','merchant_profiles','recurring_obligations',
    'recurring_obligation_transactions','expense_period_allocations','insights'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "Users manage their own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'people','locations','location_periods','transaction_reporting_values','merchant_profiles',
    'recurring_obligations','expense_period_allocations','insights'
  ]
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name);
  end loop;
end $$;
