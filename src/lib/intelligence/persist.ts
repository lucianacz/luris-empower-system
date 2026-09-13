import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultCategories } from "@/lib/categories/defaults";
import { canonicalMerchant } from "@/lib/reporting/report";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { analyzeRecurring } from "./recurring";

export async function rebuildSpendingIntelligence(supabase: SupabaseClient, userId: string) {
  const categoryIds = await ensureDefaultCategories(supabase, userId);
  const transactions = await loadTransactions(supabase, userId);
  await applyHospitalAlemanRule(supabase, userId, transactions, categoryIds.get("Health insurance") ?? null);
  const analysis = analyzeRecurring(transactions, new Date().toISOString().slice(0, 10));
  let obligationCount = 0;

  for (const pattern of analysis.patterns) {
    const related = transactions.filter((transaction) => pattern.transactionIds.includes(transaction.id));
    const hospitalAleman = /hospital\s*alem[aá]n|hospitalaleman/i.test(`${pattern.key} ${pattern.providerName}`);
    const categoryId = hospitalAleman ? categoryIds.get("Health insurance") ?? null : related.find((transaction) => transaction.category_id)?.category_id ?? null;
    const providerName = hospitalAleman ? "Hospital Alemán" : pattern.providerName;
    const countryCode = hospitalAleman ? "AR" : related.find((transaction) => transaction.merchant_country)?.merchant_country ?? null;
    const { data: merchant, error: merchantError } = await supabase.from("merchant_profiles").upsert({ user_id: userId, merchant_key: pattern.key, display_name: providerName, category_id: categoryId, country_code: countryCode }, { onConflict: "user_id,merchant_key" }).select("id").single();
    if (merchantError) throw merchantError;
    const { data: obligation, error: obligationError } = await supabase.from("recurring_obligations").upsert({ user_id: userId, merchant_profile_id: merchant.id, provider_name: providerName, merchant_key: pattern.key, category_id: categoryId, country_code: countryCode, frequency: hospitalAleman ? "monthly" : pattern.frequency, status: hospitalAleman ? "active" : pattern.status, expected_amount: pattern.medianAmount || null, currency: pattern.currency, next_expected_on: pattern.expectedNextPayment }, { onConflict: "user_id,merchant_key" }).select("id").single();
    if (obligationError) throw obligationError;
    obligationCount += 1;
    const links = pattern.transactionIds.map((transactionId) => ({ user_id: userId, recurring_obligation_id: obligation.id, transaction_id: transactionId }));
    for (let index = 0; index < links.length; index += 500) {
      const { error } = await supabase.from("recurring_obligation_transactions").upsert(links.slice(index, index + 500), { onConflict: "recurring_obligation_id,transaction_id" });
      if (error) throw error;
    }
  }

  const { data: existingQuestions, error: existingError } = await supabase.from("questions").select("id,group_key,status").eq("user_id", userId).not("group_key", "is", null);
  if (existingError) throw existingError;
  const existingByKey = new Map((existingQuestions ?? []).map((question) => [question.group_key, question]));
  let questionCount = 0;
  for (const question of analysis.questions) {
    const existing = existingByKey.get(question.key);
    const payload = { prompt: question.prompt, question_type: question.type, context: { explanation: question.explanation, merchantKey: question.merchantKey }, priority: question.priority, supporting_transaction_ids: question.transactionIds, transaction_id: question.transactionIds[0] ?? null };
    if (existing?.status === "open") {
      const { error } = await supabase.from("questions").update(payload).eq("id", existing.id).eq("user_id", userId);
      if (error) throw error;
      questionCount += 1;
    } else if (!existing) {
      const { error } = await supabase.from("questions").insert({ ...payload, user_id: userId, group_key: question.key });
      if (error) throw error;
      questionCount += 1;
    }
  }

  for (const insight of analysis.insights) {
    const { error } = await supabase.from("insights").upsert({ user_id: userId, insight_key: insight.key, insight_type: "spending", title: insight.title, body: insight.body, priority: insight.priority, transaction_ids: insight.transactionIds, metadata: {} }, { onConflict: "user_id,insight_key" });
    if (error) throw error;
  }
  return { obligationCount, questionCount, insightCount: analysis.insights.length };
}

async function applyHospitalAlemanRule(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryId: string | null) {
  if (!categoryId) return;
  const related = transactions.filter((transaction) => /hospital\s*alem[aá]n|hospitalaleman/i.test(transaction.description));
  if (!related.length) return;
  const ids = related.map((transaction) => transaction.id);
  const { error } = await supabase.from("transactions").update({ category_id: categoryId, merchant_name: "Hospital Alemán", merchant_key: "hospital alemán", merchant_country: "AR" }).eq("user_id", userId).in("id", ids);
  if (error) throw error;
  const descriptions = [...new Set(related.map((transaction) => transaction.description))];
  for (const description of descriptions) {
    const { error: ruleError } = await supabase.from("categorization_rules").upsert({ user_id: userId, category_id: categoryId, name: "Hospital Alemán health insurance", match_text: description.trim().toLocaleLowerCase(), conditions: { descriptionEquals: description }, enabled: true }, { onConflict: "user_id,match_text" });
    if (ruleError) throw ruleError;
  }
  for (const transaction of related) {
    transaction.category_id = categoryId;
    transaction.category = { name: "Health insurance", life_area: "Health", is_essential: true, is_extraordinary: false, color: "#326a60" };
    transaction.merchant_name = "Hospital Alemán";
    transaction.merchant_key = "hospital alemán";
    transaction.merchant_country = "AR";
  }
}

async function loadTransactions(supabase: SupabaseClient, userId: string) {
  const transactions: WorkspaceTransaction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions").select("id,occurred_at,description,amount,currency,kind,status,excluded_from_totals,fee_amount,category_id,merchant_name,merchant_key,merchant_country,category:categories(name,life_area,is_essential,is_extraordinary,color)").eq("user_id", userId).order("occurred_at").range(from, from + 999);
    if (error) throw error;
    transactions.push(...(data ?? []).map((row) => ({ ...row, category: first(row.category), account: null } as unknown as WorkspaceTransaction)));
    if (!data || data.length < 1000) break;
  }
  return transactions;
}

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }
export { canonicalMerchant };
