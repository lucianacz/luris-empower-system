-- Property capital costs live outside monthly living expenses. Linked bank
-- transactions remain the source evidence; cash payments are explicit manual
-- ledger entries and never masquerade as imported statement rows.

alter table public.merchant_profiles
  add column if not exists transaction_label text;

create table public.property_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  display_name text not null,
  location_name text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,5}$'),
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.property_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.property_projects(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_by_id uuid not null references public.people(id) on delete restrict,
  description text not null,
  transaction_label text,
  expense_type text not null check (expense_type in ('land_purchase', 'legal', 'fence', 'construction', 'tax', 'fee', 'other')),
  amount numeric(24, 8) not null check (amount > 0),
  principal_amount numeric(24, 8) not null check (principal_amount >= 0),
  fee_amount numeric(24, 8) not null default 0 check (fee_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,5}$'),
  paid_on date,
  payment_method text not null check (payment_method in ('bank_transfer', 'cash', 'card', 'other')),
  source_type text not null check (source_type in ('linked_transaction', 'manual_cash', 'manual_other')),
  manual_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (principal_amount + fee_amount = amount),
  unique (transaction_id),
  unique (user_id, manual_key)
);

create index property_projects_user_idx on public.property_projects(user_id, status);
create index property_expenses_project_paid_on_idx on public.property_expenses(project_id, paid_on desc nulls last);
create index property_expenses_user_payer_idx on public.property_expenses(user_id, paid_by_id, paid_on desc nulls last);

alter table public.property_projects enable row level security;
alter table public.property_expenses enable row level security;

create policy "Users manage their own rows" on public.property_projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own rows" on public.property_expenses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.property_projects to authenticated;
grant select, insert, update, delete on public.property_expenses to authenticated;

create trigger touch_updated_at before update on public.property_projects
for each row execute function public.touch_updated_at();

create trigger touch_updated_at before update on public.property_expenses
for each row execute function public.touch_updated_at();
