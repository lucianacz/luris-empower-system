-- Savings goals are planning records, not spending transactions. They can be
-- personal to one person or shared by the household, and remain editable as
-- priorities, deadlines, and saved amounts change.

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_person_id uuid references public.people(id) on delete set null,
  name text not null,
  scope text not null check (scope in ('personal', 'shared')),
  target_amount numeric(24, 8) not null check (target_amount > 0),
  saved_amount numeric(24, 8) not null default 0 check (saved_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,5}$'),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'personal' and owner_person_id is not null)
    or (scope = 'shared' and owner_person_id is null)
  ),
  unique (user_id, name)
);

create index savings_goals_user_status_target_idx
  on public.savings_goals(user_id, status, target_date);

create index savings_goals_owner_idx
  on public.savings_goals(owner_person_id)
  where owner_person_id is not null;

alter table public.savings_goals enable row level security;

create policy "Users manage their own savings goals" on public.savings_goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.savings_goals to authenticated;

create trigger touch_updated_at before update on public.savings_goals
for each row execute function public.touch_updated_at();
