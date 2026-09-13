import Decimal from "decimal.js";
import { findCoverageGaps } from "@/lib/accounts/coverage";
import { demoWorkspace } from "@/lib/workspace/demo";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildSpendingSummary } from "@/lib/spending/summary";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

export async function GET() {
  if (!hasSupabaseEnv()) return Response.json(demoWorkspace);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ...demoWorkspace, mode: "signed-out" as const });

  const [accounts, questions, chains, imports, categories, investments] = await Promise.all([
    supabase.from("financial_accounts").select("id,institution,name,currency,last_imported_at,last_transaction_at,coverage_start,coverage_end").eq("user_id", user.id).order("name"),
    supabase.from("questions").select("id,prompt,question_type,created_at,transaction_id,context").eq("user_id", user.id).eq("status", "open").order("created_at", { ascending: false }).limit(100),
    supabase.from("transfer_chains").select("id,status,confidence,source_amount,source_currency,fee_amount,notes,transfer_chain_members(sequence,allocated_amount,allocated_currency,transaction:transactions(id,occurred_at,description,amount,currency,kind,status,excluded_from_totals,fee_amount,category_id,account:financial_accounts(name,institution)))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("import_batches").select("id,account_id,file_name,status,row_count,imported_count,duplicate_count,unresolved_count,coverage_start,coverage_end,confirmed_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(250),
    supabase.from("categories").select("id,name,kind,color,icon,parent_id,life_area,is_essential").eq("user_id", user.id).eq("is_archived", false).order("name"),
    supabase.from("investment_positions").select("id,quantity,cost_basis,current_value,realized_profit_loss,unrealized_profit_loss,currency,valuation_date,asset:investment_assets(symbol,name,asset_type),account:investment_accounts(name)").eq("user_id", user.id).order("valuation_date", { ascending: false }),
  ]);
  const errors = [accounts.error, questions.error, chains.error, imports.error, categories.error, investments.error].filter(Boolean);
  if (errors.length) return Response.json({ error: errors[0]?.message ?? "Workspace data could not be loaded." }, { status: 422 });
  const transactions = await loadTransactions(supabase, user.id);

  const totals = calculateTotals(transactions);
  return Response.json({
    mode: "live",
    totals,
    accounts: (accounts.data ?? []).map((account) => {
      const periods = (imports.data ?? []).filter((batch) => batch.account_id === account.id && batch.status === "confirmed" && batch.coverage_start && batch.coverage_end).map((batch) => ({ start: batch.coverage_start as string, end: batch.coverage_end as string }));
      return { ...account, coverage_gaps: findCoverageGaps(periods), overlapping_periods: countOverlaps(periods) };
    }),
    transactions,
    spending: buildSpendingSummary(transactions),
    questions: questions.data ?? [],
    transferChains: (chains.data ?? []).map((chain) => {
      const members = [...(chain.transfer_chain_members ?? [])].sort((left, right) => left.sequence - right.sequence);
      return { ...chain, members, member_count: members.length, transfer_chain_members: undefined };
    }),
    imports: imports.data ?? [],
    categories: categories.data ?? [],
    investments: investments.data ?? [],
  });
}

async function loadTransactions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const transactions: WorkspaceTransaction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions").select("id,occurred_at,description,amount,currency,kind,status,excluded_from_totals,fee_amount,category_id,category:categories(name,life_area,is_essential,color),account:financial_accounts(name,institution),expense_splits(id,split_kind,label,percentage,amount)").eq("user_id", userId).order("occurred_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    transactions.push(...((data ?? []) as unknown as WorkspaceTransaction[]));
    if (!data || data.length < 1000) break;
  }
  return transactions;
}

function countOverlaps(periods: Array<{ start: string; end: string }>) {
  const sorted = [...periods].sort((left, right) => left.start.localeCompare(right.start));
  let overlaps = 0;
  let latestEnd = sorted[0]?.end;
  for (const period of sorted.slice(1)) {
    if (latestEnd && period.start <= latestEnd) overlaps += 1;
    if (!latestEnd || period.end > latestEnd) latestEnd = period.end;
  }
  return overlaps;
}

function calculateTotals(transactions: Array<{ amount: string | number; currency: string; kind: string; status: string; excluded_from_totals: boolean; fee_amount: string | number }>) {
  const totals = new Map<string, { currency: string; income: Decimal; spending: Decimal; internalMovement: Decimal; fees: Decimal }>();
  for (const transaction of transactions) {
    if (transaction.status !== "posted") continue;
    const summary = totals.get(transaction.currency) ?? { currency: transaction.currency, income: new Decimal(0), spending: new Decimal(0), internalMovement: new Decimal(0), fees: new Decimal(0) };
    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee_amount || 0).abs();
    summary.fees = summary.fees.plus(fee);
    if (transaction.kind === "transfer") summary.internalMovement = summary.internalMovement.plus(amount.abs());
    if (!transaction.excluded_from_totals && transaction.kind === "income" && amount.isPositive()) summary.income = summary.income.plus(amount);
    if (!transaction.excluded_from_totals && ["expense", "fee", "tax"].includes(transaction.kind) && amount.isNegative()) summary.spending = summary.spending.plus(amount.abs());
    if (!transaction.excluded_from_totals && transaction.kind === "refund" && amount.isPositive()) summary.spending = summary.spending.minus(amount);
    if (transaction.excluded_from_totals && fee.isPositive()) summary.spending = summary.spending.plus(fee);
    totals.set(transaction.currency, summary);
  }
  return [...totals.values()].map((value) => ({ currency: value.currency, income: value.income.toNumber(), spending: value.spending.toNumber(), internalMovement: value.internalMovement.toNumber(), fees: value.fees.toNumber() }));
}
