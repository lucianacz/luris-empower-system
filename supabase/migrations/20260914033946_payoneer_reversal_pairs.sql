-- Payoneer can reuse one transaction ID for the original payment and its
-- offsetting refund. Keep both as audit evidence, but exclude the full pair.
with reversal_pairs as (
  select transaction.user_id, transaction.account_id, transaction.source_transaction_id
  from public.transactions transaction
  join public.financial_accounts account on account.id = transaction.account_id
  where account.institution = 'payoneer'
    and transaction.source_transaction_id is not null
  group by transaction.user_id, transaction.account_id, transaction.source_transaction_id
  having count(*) >= 2
    and bool_or(transaction.description ~* '(refund|reversal)')
    and min(transaction.amount) < 0
    and max(transaction.amount) > 0
    and abs(sum(transaction.amount)) < 0.0001
)
update public.transactions transaction
set status = 'reversed',
    excluded_from_totals = true,
    transaction_label = coalesce(transaction.transaction_label, 'Reversed payment pair'),
    updated_at = now()
from reversal_pairs pair
where transaction.user_id = pair.user_id
  and transaction.account_id = pair.account_id
  and transaction.source_transaction_id = pair.source_transaction_id;
