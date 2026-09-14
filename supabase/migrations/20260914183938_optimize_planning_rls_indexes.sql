create index account_balance_snapshots_account_idx
  on public.account_balance_snapshots(financial_account_id)
  where financial_account_id is not null;

create index account_balance_snapshots_owner_person_idx
  on public.account_balance_snapshots(owner_person_id);

create index planning_profiles_person_idx
  on public.planning_profiles(person_id);

create index recurring_obligations_owner_person_idx
  on public.recurring_obligations(owner_person_id)
  where owner_person_id is not null;

drop policy if exists "Users manage their own account balance snapshots" on public.account_balance_snapshots;
create policy "Users manage their own account balance snapshots"
  on public.account_balance_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own planning profiles" on public.planning_profiles;
create policy "Users manage their own planning profiles"
  on public.planning_profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
