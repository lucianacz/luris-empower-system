import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultCategories } from "@/lib/categories/defaults";
import { stableFingerprint } from "@/lib/import/normalize";
import { canonicalMerchant } from "@/lib/reporting/report";

const confirmedCashExpenses = [
  { month: "2025-10", occurredAt: "2025-10-15T12:00:00.000Z" },
  { month: "2025-11", occurredAt: "2025-11-15T12:00:00.000Z" },
  { month: "2025-12", occurredAt: "2025-12-15T12:00:00.000Z" },
] as const;

export async function syncConfirmedCashExpenses(supabase: SupabaseClient, userId: string) {
  const { data: luciana, error: personError } = await supabase.from("people").select("id").eq("user_id", userId).eq("role", "self").single();
  if (personError) throw personError;
  const categoryIds = await ensureDefaultCategories(supabase, userId);
  const housingCategoryId = categoryIds.get("Housing");
  if (!housingCategoryId) throw new Error("The Housing category is required for confirmed cash rent.");

  const { data: account, error: accountError } = await supabase.from("financial_accounts").upsert({
    user_id: userId,
    owner_person_id: luciana.id,
    institution: "cash",
    name: "Cash · Luciana",
    currency: "USD",
    account_type: "cash",
    is_active: true,
    coverage_start: "2025-10-01",
    coverage_end: "2025-12-31",
    last_transaction_at: confirmedCashExpenses.at(-1)!.occurredAt,
  }, { onConflict: "user_id,institution,name,currency,owner_person_id" }).select("id").single();
  if (accountError) throw accountError;

  const merchantName = "Argentina apartment rent · cash";
  const rows = confirmedCashExpenses.map((expense) => ({
    user_id: userId,
    account_id: account.id,
    import_batch_id: null,
    category_id: housingCategoryId,
    source_transaction_id: `confirmed-cash-rent-${expense.month}`,
    fingerprint: stableFingerprint(["confirmed-cash-rent", expense.month, "1000", "USD", "Luciana Czikk"]),
    occurred_at: expense.occurredAt,
    posted_at: expense.occurredAt,
    description: merchantName,
    transaction_label: "Personal rent · paid in cash · exact day unknown",
    merchant_name: merchantName,
    merchant_key: canonicalMerchant(merchantName),
    merchant_country: "AR",
    amount: "-1000",
    currency: "USD",
    original_amount: "-1000",
    original_currency: "USD",
    fee_amount: "0",
    fee_currency: "USD",
    status: "posted",
    kind: "expense",
    excluded_from_totals: false,
    account_owner_id: luciana.id,
    paid_by_id: luciana.id,
    beneficiary_scope: "personal",
    reimbursement_status: "none",
    metadata: {
      source: "user_confirmed_manual_cash",
      serviceMonth: expense.month,
      datePrecision: "month",
      exactPaymentDateKnown: false,
      fundingNote: "Paid from cash returned by Julian. Luciana recalled an approximately USD 3,852 loan around May 11, 2025; no separate matching bank transfer is present in the imported statements.",
    },
  }));
  const { data, error } = await supabase.from("transactions").upsert(rows, { onConflict: "user_id,account_id,fingerprint" }).select("id");
  if (error) throw error;
  return { accountId: account.id, transactionCount: data?.length ?? 0 };
}
