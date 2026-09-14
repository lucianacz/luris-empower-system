-- Preserve the statement description as immutable evidence while allowing a
-- user-facing explanation to be edited independently.
alter table public.transactions
  add column if not exists transaction_label text;

comment on column public.transactions.transaction_label is
  'Editable explanation shown below the original statement description.';
