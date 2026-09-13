import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueByFingerprint } from "@/lib/import/runtime-duplicates";
import { buildTransferChains } from "./chains";
import { matchTransfers, type TransferCandidate } from "./matcher";

interface DatabaseTransaction {
  id: string;
  account_id: string;
  source_transaction_id: string | null;
  fingerprint: string;
  occurred_at: string;
  posted_at: string | null;
  description: string;
  amount: string;
  currency: string;
  original_amount: string | null;
  original_currency: string | null;
  fee_amount: string;
  fee_currency: string | null;
  status: TransferCandidate["status"];
  kind: TransferCandidate["kind"];
  excluded_from_totals: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

export async function rebuildTransferSuggestions(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,account_id,source_transaction_id,fingerprint,occurred_at,posted_at,description,amount,currency,original_amount,original_currency,fee_amount,fee_currency,status,kind,excluded_from_totals,metadata")
    .eq("user_id", userId)
    .in("kind", ["transfer", "unknown"])
    .eq("status", "posted")
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  let transactions = uniqueByFingerprint(data as DatabaseTransaction[] | null ?? []).map<TransferCandidate>((row) => ({
    id: row.id,
    accountId: row.account_id,
    sourceId: row.source_transaction_id,
    fingerprint: row.fingerprint,
    occurredAt: row.occurred_at,
    postedAt: row.posted_at,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    originalAmount: row.original_amount,
    originalCurrency: row.original_currency,
    feeAmount: row.fee_amount,
    feeCurrency: row.fee_currency,
    status: row.status,
    kind: row.kind,
    excludedFromTotals: row.excluded_from_totals,
    metadata: row.metadata ?? {},
    warnings: [],
  }));
  const { data: reviewedChains, error: reviewedError } = await supabase.from("transfer_chains").select("id").eq("user_id", userId).in("status", ["confirmed", "rejected"]);
  if (reviewedError) throw reviewedError;
  if (reviewedChains?.length) {
    const { data: reviewedMembers, error: memberError } = await supabase.from("transfer_chain_members").select("transaction_id").eq("user_id", userId).in("transfer_chain_id", reviewedChains.map((chain) => chain.id));
    if (memberError) throw memberError;
    const reviewedTransactionIds = new Set((reviewedMembers ?? []).map((member) => member.transaction_id));
    transactions = transactions.filter((transaction) => !reviewedTransactionIds.has(transaction.id));
  }
  const chains = buildTransferChains(matchTransfers(transactions));

  const { data: existingSuggested, error: existingError } = await supabase.from("transfer_chains").select("id").eq("user_id", userId).eq("status", "suggested");
  if (existingError) throw existingError;
  if (existingSuggested?.length) {
    const { error: deleteError } = await supabase.from("transfer_chains").delete().in("id", existingSuggested.map((chain) => chain.id));
    if (deleteError) throw deleteError;
  }

  for (const chain of chains) {
    const first = chain.matches[0];
    const { data: insertedChain, error: chainError } = await supabase.from("transfer_chains").insert({
      user_id: userId,
      status: "suggested",
      confidence: chain.confidence,
      source_amount: first?.sourceAmount ?? null,
      source_currency: first?.sourceCurrency ?? null,
      fee_amount: chain.feeAmount,
      notes: `${chain.accountPath.length}-account path detected automatically`,
    }).select("id").single();
    if (chainError) throw chainError;

    const members = uniqueMembers(chain).map((member, sequence) => ({
      user_id: userId,
      transfer_chain_id: insertedChain.id,
      transaction_id: member.transactionId,
      sequence,
      allocated_amount: member.amount,
      allocated_currency: member.currency,
    }));
    const { error: memberError } = await supabase.from("transfer_chain_members").insert(members);
    if (memberError) throw memberError;
  }
  return chains.length;
}

function uniqueMembers(chain: ReturnType<typeof buildTransferChains>[number]) {
  const members: Array<{ transactionId: string; amount: string; currency: string }> = [];
  const seen = new Set<string>();
  for (const match of chain.matches) {
    if (!seen.has(match.sourceTransactionId)) {
      members.push({ transactionId: match.sourceTransactionId, amount: match.sourceAmount, currency: match.sourceCurrency });
      seen.add(match.sourceTransactionId);
    }
    if (!seen.has(match.targetTransactionId)) {
      members.push({ transactionId: match.targetTransactionId, amount: match.targetAmount, currency: match.targetCurrency });
      seen.add(match.targetTransactionId);
    }
  }
  return members;
}
