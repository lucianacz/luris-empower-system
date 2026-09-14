alter table public.recurring_obligations
  add column if not exists owner_person_id uuid references public.people(id) on delete set null;

update public.recurring_obligations obligation
set owner_person_id = (
  select transaction.account_owner_id as owner_person_id
  from public.recurring_obligation_transactions link
  join public.transactions transaction on transaction.id = link.transaction_id
  where link.recurring_obligation_id = obligation.id
    and transaction.account_owner_id is not null
  group by transaction.account_owner_id
  order by count(*) desc
  limit 1
)
where obligation.owner_person_id is null;

alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_user_id_merchant_key_key;

alter table public.recurring_obligations
  add constraint recurring_obligations_user_merchant_owner_key
  unique nulls not distinct (user_id, merchant_key, owner_person_id);

create index if not exists recurring_obligations_owner_idx
  on public.recurring_obligations(user_id, owner_person_id, status);

create table public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_person_id uuid not null references public.people(id) on delete cascade,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  institution text not null,
  amount numeric(24, 8) not null check (amount >= 0),
  currency text not null default 'USD',
  balance_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, owner_person_id, institution, currency, balance_date)
);

create index account_balance_snapshots_latest_idx
  on public.account_balance_snapshots(user_id, owner_person_id, balance_date desc);

create table public.planning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  expected_monthly_income numeric(24, 8) check (expected_monthly_income is null or expected_monthly_income >= 0),
  income_currency text not null default 'USD',
  income_day smallint check (income_day is null or income_day between 1 and 31),
  safety_months numeric(5, 2) not null default 3 check (safety_months >= 0 and safety_months <= 24),
  income_is_variable boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, person_id)
);

alter table public.account_balance_snapshots enable row level security;
alter table public.planning_profiles enable row level security;

create policy "Users manage their own account balance snapshots"
  on public.account_balance_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own planning profiles"
  on public.planning_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all privileges on table public.account_balance_snapshots from anon;
revoke all privileges on table public.planning_profiles from anon;
revoke truncate, references, trigger on table public.account_balance_snapshots from authenticated;
revoke truncate, references, trigger on table public.planning_profiles from authenticated;
grant select, insert, update, delete on table public.account_balance_snapshots to authenticated;
grant select, insert, update, delete on table public.planning_profiles to authenticated;
grant all privileges on table public.account_balance_snapshots to service_role;
grant all privileges on table public.planning_profiles to service_role;

create trigger touch_account_balance_snapshots_updated_at
  before update on public.account_balance_snapshots
  for each row execute function public.touch_updated_at();

create trigger touch_planning_profiles_updated_at
  before update on public.planning_profiles
  for each row execute function public.touch_updated_at();
