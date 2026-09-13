create extension if not exists pgcrypto;

create type public.financial_institution as enum ('deel', 'arq', 'brubank', 'payoneer', 'alpaca', 'cash', 'other');
create type public.import_status as enum ('previewed', 'confirmed', 'failed', 'rolled_back');
create type public.transaction_status as enum ('posted', 'pending', 'failed', 'reversed');
create type public.transaction_kind as enum ('income', 'expense', 'transfer', 'fee', 'tax', 'refund', 'cash_withdrawal', 'investment_purchase', 'investment_sale', 'investment_income', 'unknown');
create type public.question_status as enum ('open', 'resolved', 'dismissed');
create type public.transfer_status as enum ('suggested', 'confirmed', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  reporting_currency text not null default 'USD',
  timezone text not null default 'America/Costa_Rica',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution public.financial_institution not null,
  name text not null,
  currency text not null check (currency ~ '^[A-Z]{3,5}$'),
  account_type text not null default 'cash',
  account_identifier_hint text,
  is_active boolean not null default true,
  last_imported_at timestamptz,
  last_transaction_at timestamptz,
  coverage_start date,
  coverage_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, institution, name, currency)
);

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution public.financial_institution not null,
  signature text not null,
  name text not null,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, institution, signature)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  institution public.financial_institution not null,
  status public.import_status not null default 'previewed',
  file_name text not null,
  file_checksum text not null,
  file_size bigint not null check (file_size >= 0),
  source_format text not null check (source_format in ('csv', 'pdf', 'xlsx')),
  adapter_name text not null,
  mapping jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  unresolved_count integer not null default 0,
  confirmed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, file_checksum)
);

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid not null unique references public.import_batches(id) on delete cascade,
  storage_bucket text not null default 'statement-files',
  storage_path text not null,
  content_type text,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  kind text not null default 'expense' check (kind in ('income', 'expense', 'transfer', 'investment')),
  color text,
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, parent_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  source_transaction_id text,
  fingerprint text not null,
  occurred_at timestamptz not null,
  posted_at timestamptz,
  description text not null,
  amount numeric(24, 8) not null,
  currency text not null,
  original_amount numeric(24, 8),
  original_currency text,
  fee_amount numeric(24, 8) not null default 0,
  fee_currency text,
  status public.transaction_status not null default 'posted',
  kind public.transaction_kind not null default 'unknown',
  excluded_from_totals boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, fingerprint)
);
create index transactions_user_date_idx on public.transactions(user_id, occurred_at desc);
create index transactions_transfer_candidates_idx on public.transactions(user_id, currency, amount, occurred_at) where kind in ('transfer', 'unknown');

create table public.transfer_chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.transfer_status not null default 'suggested',
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  source_amount numeric(24, 8),
  source_currency text,
  reporting_amount numeric(24, 8),
  reporting_currency text,
  fee_amount numeric(24, 8) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transfer_chain_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_chain_id uuid not null references public.transfer_chains(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  allocated_amount numeric(24, 8),
  allocated_currency text,
  created_at timestamptz not null default now(),
  unique (transfer_chain_id, transaction_id),
  unique (transfer_chain_id, sequence)
);

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  priority integer not null default 100,
  conditions jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete cascade,
  question_type text not null,
  prompt text not null,
  context jsonb not null default '{}'::jsonb,
  status public.question_status not null default 'open',
  resolution jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  split_kind text not null check (split_kind in ('personal', 'shared', 'household_member')),
  label text not null,
  percentage numeric(7, 4) check (percentage between 0 and 1),
  amount numeric(24, 8),
  currency text,
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(24, 8) not null,
  currency text not null,
  household_scope text not null default 'personal' check (household_scope in ('personal', 'shared', 'household')),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.life_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  institution public.financial_institution not null,
  name text not null,
  base_currency text not null,
  cash_available numeric(24, 8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  name text not null,
  asset_type text not null,
  currency text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol, name)
);

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  asset_id uuid references public.investment_assets(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  occurred_at timestamptz not null,
  transaction_type text not null check (transaction_type in ('purchase', 'sale', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'tax', 'correction')),
  quantity numeric(30, 12),
  unit_price numeric(24, 8),
  gross_amount numeric(24, 8) not null,
  fee_amount numeric(24, 8) not null default 0,
  tax_amount numeric(24, 8) not null default 0,
  currency text not null,
  cost_basis numeric(24, 8),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  asset_id uuid not null references public.investment_assets(id) on delete cascade,
  quantity numeric(30, 12) not null,
  cost_basis numeric(24, 8),
  current_value numeric(24, 8),
  realized_profit_loss numeric(24, 8) not null default 0,
  unrealized_profit_loss numeric(24, 8),
  currency text not null,
  valuation_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (investment_account_id, asset_id)
);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  valuation_date date not null,
  cash_value numeric(24, 8) not null default 0,
  positions_value numeric(24, 8) not null default 0,
  total_value numeric(24, 8) not null,
  contributions numeric(24, 8) not null default 0,
  withdrawals numeric(24, 8) not null default 0,
  dividends numeric(24, 8) not null default 0,
  interest numeric(24, 8) not null default 0,
  fees numeric(24, 8) not null default 0,
  taxes numeric(24, 8) not null default 0,
  realized_profit_loss numeric(24, 8) not null default 0,
  unrealized_profit_loss numeric(24, 8) not null default 0,
  currency text not null,
  exchange_rate_effect numeric(24, 8),
  created_at timestamptz not null default now(),
  unique (investment_account_id, valuation_date)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','financial_accounts','import_mappings','transactions','transfer_chains','categorization_rules','investment_accounts','investment_positions']
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','financial_accounts','import_mappings','import_batches','import_files','categories','transactions',
    'transfer_chains','transfer_chain_members','categorization_rules','questions','expense_splits','budgets','life_periods',
    'investment_accounts','investment_assets','investment_transactions','investment_positions','portfolio_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "Users manage their own rows" on public.%I for all using (auth.uid() = %I) with check (auth.uid() = %I)', table_name, case when table_name = 'profiles' then 'id' else 'user_id' end, case when table_name = 'profiles' then 'id' else 'user_id' end);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statement-files', 'statement-files', false, 15728640, array['text/csv','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload their own statements" on storage.objects for insert to authenticated
with check (bucket_id = 'statement-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users read their own statements" on storage.objects for select to authenticated
using (bucket_id = 'statement-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their own statements" on storage.objects for delete to authenticated
using (bucket_id = 'statement-files' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.rollback_import_batch(target_batch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_user uuid;
begin
  select user_id into target_user from public.import_batches where id = target_batch_id;
  if target_user is null or target_user <> auth.uid() then raise exception 'Import batch not found'; end if;
  delete from public.transactions where import_batch_id = target_batch_id;
  update public.import_batches set status = 'rolled_back', rolled_back_at = now(), imported_count = 0 where id = target_batch_id;
end;
$$;
