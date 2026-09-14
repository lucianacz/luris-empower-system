-- Faster reporting reads, explicit ownership, and fully reversible investment imports.
-- All changes are additive and preserve imported data.

alter table public.investment_positions
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;

alter table public.portfolio_snapshots
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;

create index if not exists transactions_user_status_date_idx on public.transactions(user_id, status, occurred_at desc);
create index if not exists transactions_import_batch_idx on public.transactions(import_batch_id);
create index if not exists transactions_account_idx on public.transactions(account_id);
create index if not exists transactions_category_idx on public.transactions(category_id);
create index if not exists transactions_account_owner_idx on public.transactions(account_owner_id);
create index if not exists transactions_paid_by_idx on public.transactions(paid_by_id);
create index if not exists questions_user_status_priority_idx on public.questions(user_id, status, priority desc, created_at desc);
create index if not exists import_batches_user_status_created_idx on public.import_batches(user_id, status, created_at desc);
create index if not exists investment_transactions_user_date_idx on public.investment_transactions(user_id, occurred_at desc);
create index if not exists investment_transactions_import_batch_idx on public.investment_transactions(import_batch_id);
create index if not exists investment_positions_user_valuation_idx on public.investment_positions(user_id, valuation_date desc);
create index if not exists investment_positions_import_batch_idx on public.investment_positions(import_batch_id);
create index if not exists portfolio_snapshots_user_valuation_idx on public.portfolio_snapshots(user_id, valuation_date desc);
create index if not exists portfolio_snapshots_import_batch_idx on public.portfolio_snapshots(import_batch_id);
create index if not exists expense_splits_transaction_idx on public.expense_splits(transaction_id);
create index if not exists expense_allocations_transaction_idx on public.expense_period_allocations(transaction_id);

-- Evaluate auth.uid() once per statement instead of once per row.
do $$
declare table_name text;
declare owner_column text;
begin
  foreach table_name in array array[
    'profiles','financial_accounts','import_mappings','import_batches','import_files','categories','transactions',
    'transfer_chains','transfer_chain_members','categorization_rules','questions','expense_splits','budgets','life_periods',
    'investment_accounts','investment_assets','investment_transactions','investment_positions','portfolio_snapshots',
    'people','locations','location_currency_hints','location_periods','exchange_rates','transaction_reporting_values',
    'merchant_profiles','recurring_obligations','recurring_obligation_transactions','expense_period_allocations','insights'
  ]
  loop
    owner_column := case when table_name = 'profiles' then 'id' else 'user_id' end;
    execute format('drop policy if exists "Users manage their own rows" on public.%I', table_name);
    execute format(
      'create policy "Users manage their own rows" on public.%I for all using ((select auth.uid()) = %I) with check ((select auth.uid()) = %I)',
      table_name,
      owner_column,
      owner_column
    );
  end loop;
end $$;

drop policy if exists "Users upload their own statements" on storage.objects;
create policy "Users upload their own statements" on storage.objects for insert to authenticated
with check (bucket_id = 'statement-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users read their own statements" on storage.objects;
create policy "Users read their own statements" on storage.objects for select to authenticated
using (bucket_id = 'statement-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own statements" on storage.objects;
create policy "Users delete their own statements" on storage.objects for delete to authenticated
using (bucket_id = 'statement-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.rollback_import_batch(target_batch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_user uuid;
declare target_account uuid;
begin
  select user_id, account_id into target_user, target_account from public.import_batches where id = target_batch_id;
  if target_user is null or target_user <> (select auth.uid()) then raise exception 'Import batch not found'; end if;
  delete from public.transactions where import_batch_id = target_batch_id;
  delete from public.investment_transactions where import_batch_id = target_batch_id;
  delete from public.investment_positions where import_batch_id = target_batch_id;
  delete from public.portfolio_snapshots where import_batch_id = target_batch_id;
  delete from public.transfer_chains chain
  where chain.user_id = target_user
    and not exists (select 1 from public.transfer_chain_members member where member.transfer_chain_id = chain.id);
  update public.import_batches set status = 'rolled_back', rolled_back_at = now(), imported_count = 0 where id = target_batch_id;
  update public.financial_accounts account set
    last_imported_at = (select max(batch.confirmed_at) from public.import_batches batch where batch.account_id = target_account and batch.id <> target_batch_id and batch.status = 'confirmed'),
    last_transaction_at = (select max(transaction.occurred_at) from public.transactions transaction where transaction.account_id = target_account),
    coverage_start = (select min(transaction.occurred_at)::date from public.transactions transaction where transaction.account_id = target_account),
    coverage_end = (select max(transaction.occurred_at)::date from public.transactions transaction where transaction.account_id = target_account)
  where account.id = target_account and account.user_id = target_user;
end;
$$;

revoke all on function public.rollback_import_batch(uuid) from public;
grant execute on function public.rollback_import_batch(uuid) to authenticated;
