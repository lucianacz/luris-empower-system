alter type public.financial_institution add value if not exists 'wise';

alter table public.financial_accounts
  add column if not exists owner_person_id uuid references public.people(id) on delete set null;

alter table public.investment_accounts
  add column if not exists owner_person_id uuid references public.people(id) on delete set null;

alter table public.location_periods
  add column if not exists person_id uuid references public.people(id) on delete cascade;

update public.financial_accounts account
set owner_person_id = coalesce(
  (
    select tx.account_owner_id
    from public.transactions tx
    where tx.account_id = account.id
      and tx.account_owner_id is not null
    group by tx.account_owner_id
    order by count(*) desc
    limit 1
  ),
  (
    select person.id
    from public.people person
    where person.user_id = account.user_id and person.role = 'self'
    order by person.created_at
    limit 1
  )
)
where account.owner_person_id is null;

update public.investment_accounts investment_account
set owner_person_id = coalesce(
  (
    select financial_account.owner_person_id
    from public.financial_accounts financial_account
    where financial_account.id = investment_account.financial_account_id
  ),
  (
    select person.id
    from public.people person
    where person.user_id = investment_account.user_id and person.role = 'self'
    order by person.created_at
    limit 1
  )
)
where investment_account.owner_person_id is null;

update public.location_periods period
set person_id = (
  select person.id
  from public.people person
  where person.user_id = period.user_id and person.role = 'self'
  order by person.created_at
  limit 1
)
where period.person_id is null;

alter table public.financial_accounts
  drop constraint if exists financial_accounts_user_id_institution_name_currency_key;

alter table public.financial_accounts
  add constraint financial_accounts_user_institution_name_currency_owner_key
  unique nulls not distinct (user_id, institution, name, currency, owner_person_id);

create index if not exists financial_accounts_user_owner_idx
  on public.financial_accounts(user_id, owner_person_id);

create index if not exists investment_accounts_user_owner_idx
  on public.investment_accounts(user_id, owner_person_id);

create index if not exists location_periods_user_person_dates_idx
  on public.location_periods(user_id, person_id, starts_on, ends_on);
