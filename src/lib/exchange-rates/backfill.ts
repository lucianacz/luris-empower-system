import Decimal from "decimal.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonalHistoricalRate {
  id: string;
  rate_date: string;
  source_currency: string;
  rate_to_reporting: string | number;
}

interface TransactionWithoutUsdValue {
  id: string;
  occurred_at: string;
  amount: string | number;
  currency: string;
  reporting_values?: Array<{ reporting_currency: string }> | { reporting_currency: string } | null;
}

export function nearestHistoricalRate(rates: PersonalHistoricalRate[], transactionDate: string) {
  const target = Date.parse(`${transactionDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  return rates.reduce<PersonalHistoricalRate | null>((best, candidate) => {
    if (!best) return candidate;
    const candidateDistance = Math.abs(Date.parse(`${candidate.rate_date}T00:00:00Z`) - target);
    const bestDistance = Math.abs(Date.parse(`${best.rate_date}T00:00:00Z`) - target);
    if (candidateDistance !== bestDistance) return candidateDistance < bestDistance ? candidate : best;
    return candidate.rate_date < best.rate_date ? candidate : best;
  }, null);
}

export async function backfillEstimatedReportingValues(supabase: SupabaseClient, userId: string) {
  const rates = await loadPersonalRates(supabase, userId);
  const ratesByCurrency = new Map<string, PersonalHistoricalRate[]>();
  for (const rate of rates) ratesByCurrency.set(rate.source_currency, [...(ratesByCurrency.get(rate.source_currency) ?? []), rate]);

  const transactions = await loadTransactionsWithoutUsdValue(supabase, userId);
  const rows = transactions.flatMap((transaction) => {
    if (hasUsdValue(transaction.reporting_values)) return [];
    const rate = nearestHistoricalRate(ratesByCurrency.get(transaction.currency) ?? [], transaction.occurred_at);
    if (!rate) return [];
    const rateValue = new Decimal(rate.rate_to_reporting);
    return [{
      user_id: userId,
      transaction_id: transaction.id,
      exchange_rate_id: rate.id,
      reporting_currency: "USD",
      reporting_amount: new Decimal(transaction.amount).times(rateValue).toDecimalPlaces(8).toFixed(),
      rate_to_reporting: rateValue.toFixed(),
      source: `Estimated from nearest ARQ conversion · rate date ${rate.rate_date}`,
      is_estimated: true,
    }];
  });

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from("transaction_reporting_values").upsert(rows.slice(index, index + 500), { onConflict: "transaction_id,reporting_currency" });
    if (error) throw error;
  }

  return rows.length;
}

async function loadPersonalRates(supabase: SupabaseClient, userId: string) {
  const rows: PersonalHistoricalRate[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = supabase.from("exchange_rates")
      .select("id,rate_date,source_currency,rate_to_reporting")
      .eq("user_id", userId)
      .eq("reporting_currency", "USD")
      .eq("methodology", "personal_arq_conversion")
      .order("id")
      .limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as PersonalHistoricalRate[];
    rows.push(...page);
    if (page.length < 500) break;
    cursor = page.at(-1)!.id;
  }
  return rows;
}

async function loadTransactionsWithoutUsdValue(supabase: SupabaseClient, userId: string) {
  const rows: TransactionWithoutUsdValue[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = supabase.from("transactions")
      .select("id,occurred_at,amount,currency,reporting_values:transaction_reporting_values(reporting_currency)")
      .eq("user_id", userId)
      .eq("status", "posted")
      .eq("excluded_from_totals", false)
      .in("kind", ["expense", "fee", "tax", "refund"])
      .neq("currency", "USD")
      .order("id")
      .limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as TransactionWithoutUsdValue[];
    rows.push(...page);
    if (page.length < 500) break;
    cursor = page.at(-1)!.id;
  }
  return rows;
}

function hasUsdValue(value: TransactionWithoutUsdValue["reporting_values"]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.some((item) => item.reporting_currency === "USD");
}
