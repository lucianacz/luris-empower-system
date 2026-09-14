import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultCategories } from "@/lib/categories/defaults";
import { knownMerchantRules, matchKnownMerchant, normalizeUserCountryHint, resolvedKnownMerchantKind, resolvedKnownMerchantName } from "@/lib/categories/known-merchants";
import { cleanDescription } from "@/lib/import/normalize";
import type { TransactionKind } from "@/lib/import/types";
import { canonicalMerchant } from "@/lib/reporting/report";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { uniqueByFingerprint } from "@/lib/import/runtime-duplicates";
import { backfillEstimatedReportingValues } from "@/lib/exchange-rates/backfill";
import { analyzeRecurring } from "./recurring";
import { currentFinanceDate } from "@/lib/dates/current-date";

export async function rebuildSpendingIntelligence(supabase: SupabaseClient, userId: string) {
  const categoryIds = await ensureDefaultCategories(supabase, userId);
  const transactions = await loadTransactions(supabase, userId);
  await applyCountryOverrides(supabase, userId, transactions);
  await applyKnownMerchantRules(supabase, userId, transactions, categoryIds);
  await applySpecificCategoryRefinements(supabase, userId, transactions, categoryIds);
  await applyHospitalAlemanRule(supabase, userId, transactions, categoryIds.get("Health insurance") ?? null);
  const estimatedReportingValueCount = await backfillEstimatedReportingValues(supabase, userId);
  const analysis = analyzeRecurring(uniqueByFingerprint(transactions), currentFinanceDate());
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
    const { data: existingLinks, error: existingLinksError } = await supabase.from("recurring_obligation_transactions").select("transaction_id").eq("recurring_obligation_id", obligation.id).eq("user_id", userId);
    if (existingLinksError) throw existingLinksError;
    const staleLinkIds = (existingLinks ?? []).map((link) => link.transaction_id).filter((transactionId) => !pattern.transactionIds.includes(transactionId));
    for (let index = 0; index < staleLinkIds.length; index += 500) {
      const { error } = await supabase.from("recurring_obligation_transactions").delete().eq("recurring_obligation_id", obligation.id).eq("user_id", userId).in("transaction_id", staleLinkIds.slice(index, index + 500));
      if (error) throw error;
    }
    const links = pattern.transactionIds.map((transactionId) => ({ user_id: userId, recurring_obligation_id: obligation.id, transaction_id: transactionId }));
    for (let index = 0; index < links.length; index += 500) {
      const { error } = await supabase.from("recurring_obligation_transactions").upsert(links.slice(index, index + 500), { onConflict: "recurring_obligation_id,transaction_id" });
      if (error) throw error;
    }
  }

  const { data: existingQuestions, error: existingError } = await supabase.from("questions").select("id,group_key,status").eq("user_id", userId).not("group_key", "is", null);
  if (existingError) throw existingError;
  const existingByKey = new Map((existingQuestions ?? []).map((question) => [question.group_key, question]));
  const activeQuestionKeys = new Set(analysis.questions.map((question) => question.key));
  const staleQuestionIds = (existingQuestions ?? [])
    .filter((question) => question.status === "open" && question.group_key?.startsWith("recurring-") && !activeQuestionKeys.has(question.group_key))
    .map((question) => question.id);
  if (staleQuestionIds.length) {
    const { error } = await supabase.from("questions").update({ status: "dismissed", resolution: { automatic: true, reason: "No longer meets the multi-month recurring-payment criteria." }, resolved_at: new Date().toISOString() }).eq("user_id", userId).in("id", staleQuestionIds);
    if (error) throw error;
  }
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
  return { obligationCount, questionCount, insightCount: analysis.insights.length, estimatedReportingValueCount };
}

async function applyCountryOverrides(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[]) {
  const costaRicaIds = transactions
    .filter((transaction) => transaction.merchant_country && normalizeUserCountryHint(transaction.merchant_country) === "CR" && transaction.merchant_country !== "CR")
    .map((transaction) => transaction.id);
  for (let index = 0; index < costaRicaIds.length; index += 500) {
    const { error } = await supabase.from("transactions").update({ merchant_country: "CR" }).eq("user_id", userId).in("id", costaRicaIds.slice(index, index + 500));
    if (error) throw error;
  }
  for (const transaction of transactions) {
    if (transaction.merchant_country) transaction.merchant_country = normalizeUserCountryHint(transaction.merchant_country);
  }
}

async function applyKnownMerchantRules(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryIds: Map<string, string>) {
  for (const rule of knownMerchantRules) {
    const related = transactions.filter((transaction) => matchKnownMerchant(transaction.description, transaction)?.id === rule.id);
    if (!related.length) continue;
    const categoryId = rule.categoryName ? categoryIds.get(rule.categoryName) ?? null : null;
    let personId: string | null = null;
    if (rule.personRole) {
      const { data: person, error } = await supabase.from("people").upsert({ user_id: userId, display_name: rule.displayName, role: "provider", notes: rule.personRole }, { onConflict: "user_id,display_name" }).select("id").single();
      if (error) throw error;
      personId = person.id;
    }
    const byMerchant = new Map<string, WorkspaceTransaction[]>();
    for (const transaction of related) {
      const merchantName = resolvedKnownMerchantName(rule, transaction.description);
      byMerchant.set(merchantName, [...(byMerchant.get(merchantName) ?? []), transaction]);
    }
    for (const [merchantName, merchantTransactions] of byMerchant) {
      const merchantKey = canonicalMerchant(merchantName);
      const update = {
        category_id: categoryId,
        merchant_name: merchantName,
        merchant_key: merchantKey,
        ...(rule.countryCode ? { merchant_country: rule.countryCode } : {}),
        ...(rule.kind ? { kind: rule.kind } : {}),
        ...(rule.excludedFromTotals !== undefined ? { excluded_from_totals: rule.excludedFromTotals } : {}),
        ...(rule.beneficiaryScope ? { beneficiary_scope: rule.beneficiaryScope } : {}),
      };
      for (let index = 0; index < merchantTransactions.length; index += 500) {
        const { error } = await supabase.from("transactions").update(update).eq("user_id", userId).in("id", merchantTransactions.slice(index, index + 500).map((transaction) => transaction.id));
        if (error) throw error;
      }
      const { error: merchantError } = await supabase.from("merchant_profiles").upsert({ user_id: userId, merchant_key: merchantKey, display_name: merchantName, category_id: categoryId, person_id: personId, country_code: rule.countryCode ?? merchantTransactions.find((transaction) => transaction.merchant_country)?.merchant_country ?? null, notes: rule.notes ?? rule.personRole ?? null }, { onConflict: "user_id,merchant_key" });
      if (merchantError) throw merchantError;
      for (const transaction of merchantTransactions) {
        transaction.category_id = categoryId;
        transaction.category = rule.categoryName ? categoryFor(rule.categoryName) : null;
        transaction.merchant_name = merchantName;
        transaction.merchant_key = merchantKey;
        if (rule.countryCode) transaction.merchant_country = rule.countryCode;
        if (rule.beneficiaryScope) transaction.beneficiary_scope = rule.beneficiaryScope;
        transaction.kind = resolvedKnownMerchantKind(rule, transaction.amount, transaction.kind as TransactionKind);
        if (rule.excludedFromTotals !== undefined) transaction.excluded_from_totals = rule.excludedFromTotals;
      }
    }
    if (!rule.kind && rule.categoryName) {
      const expenseIds = related.filter((transaction) => Number(transaction.amount) < 0).map((transaction) => transaction.id);
      for (let index = 0; index < expenseIds.length; index += 500) {
        const { error } = await supabase.from("transactions").update({ kind: "expense" }).eq("user_id", userId).in("id", expenseIds.slice(index, index + 500));
        if (error) throw error;
      }
    }
    if (categoryId && rule.amount === undefined) {
      for (const description of [...new Set(related.map((transaction) => cleanDescription(transaction.description)))]) {
        const { error } = await supabase.from("categorization_rules").upsert({ user_id: userId, category_id: categoryId, name: `${rule.displayName} · ${rule.categoryName}`, match_text: description.toLocaleLowerCase(), conditions: { descriptionEquals: description, knownMerchantRule: rule.id }, enabled: true }, { onConflict: "user_id,match_text" });
        if (error) throw error;
      }
    }
  }
}

async function applySpecificCategoryRefinements(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryIds: Map<string, string>) {
  const refinements = [
    { categoryName: "Hotels", pattern: /hotel|hostel|booking(?:\.com|\.[a-z])?|lodging|accommodation/i, fromCategories: new Set(["Travel", "Hotels"]) },
    { categoryName: "Car rental", pattern: /car rental|alquiler de auto|\benterprise\b|rent[ -]?a[ -]?car/i, fromCategories: new Set(["Travel", "Transport", "Car rental"]) },
    { categoryName: "Car repairs", pattern: /car repair|reparaci[oó]n.*(?:auto|carro)|mec[aá]nic|neum[aá]tic|la casa del hyundai|centro llantero del sur/i, fromCategories: new Set(["Transport", "Car repairs"]) },
    { categoryName: "Fuel & gas", pattern: /fuel|gasolin|combustible|servicentro|gas station|lumicentro|terpel|racetrac/i, fromCategories: new Set(["Transport", "Fuel & gas"]) },
    { categoryName: "Parking", pattern: /parking|estacionamiento/i, fromCategories: new Set(["Transport", "Parking"]) },
    { categoryName: "Tolls & highways", pattern: /\bausol\b|toll|peaje|autopista|ruta 27/i, fromCategories: new Set(["Transport", "Tolls & highways"]) },
  ];
  for (const refinement of refinements) {
    const categoryId = categoryIds.get(refinement.categoryName);
    if (!categoryId) continue;
    const related = transactions.filter((transaction) => refinement.pattern.test(cleanDescription(transaction.description)) && (!transaction.category || refinement.fromCategories.has(transaction.category.name)));
    for (let index = 0; index < related.length; index += 500) {
      const { error } = await supabase.from("transactions").update({ category_id: categoryId }).eq("user_id", userId).in("id", related.slice(index, index + 500).map((transaction) => transaction.id));
      if (error) throw error;
    }
    for (const transaction of related) {
      transaction.category_id = categoryId;
      transaction.category = categoryFor(refinement.categoryName);
    }
  }
  const airbnb = transactions.filter((transaction) => /\bairbnb\b/i.test(cleanDescription(transaction.description)));
  if (airbnb.length) {
    const ids = airbnb.map((transaction) => transaction.id);
    const { error } = await supabase.from("transactions").update({ merchant_country: null }).eq("user_id", userId).in("id", ids);
    if (error) throw error;
    for (const transaction of airbnb) transaction.merchant_country = null;
  }
}

function categoryFor(name: string): WorkspaceTransaction["category"] {
  const category = defaultCategoryDetails[name];
  return category ? { name, ...category } : { name, life_area: "Other", is_essential: false, is_extraordinary: false, color: "#8f8a82" };
}

const defaultCategoryDetails: Record<string, Omit<NonNullable<WorkspaceTransaction["category"]>, "name">> = {
  "Alternative therapy": { life_area: "Health", is_essential: false, is_extraordinary: false, color: "#8c7aa9" },
  "Bills & utilities": { life_area: "Home", is_essential: true, is_extraordinary: false, color: "#557a95" },
  Car: { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#48605a" },
  "Car rental": { life_area: "Mobility", is_essential: false, is_extraordinary: true, color: "#4f7f8f" },
  "Car repairs": { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#6a7f4f" },
  Cleaning: { life_area: "Home", is_essential: true, is_extraordinary: false, color: "#8a806f" },
  Dentist: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#4f8c80" },
  Dermatology: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#357d8a" },
  "Dining out": { life_area: "Food", is_essential: false, is_extraordinary: false, color: "#d37a3d" },
  "Diving & activities": { life_area: "Travel", is_essential: false, is_extraordinary: false, color: "#167b91" },
  "English classes": { life_area: "Growth", is_essential: false, is_extraordinary: false, color: "#7b8b65" },
  Groceries: { life_area: "Food", is_essential: true, is_extraordinary: false, color: "#52796f" },
  "Fuel & gas": { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#b56b36" },
  "Friends & social": { life_area: "Relationships", is_essential: false, is_extraordinary: false, color: "#c65f7c" },
  Hotels: { life_area: "Travel", is_essential: false, is_extraordinary: true, color: "#7b6fa8" },
  Housing: { life_area: "Home", is_essential: true, is_extraordinary: false, color: "#7a6c5d" },
  "Personal care": { life_area: "Lifestyle", is_essential: false, is_extraordinary: false, color: "#b07d8b" },
  Parking: { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#65766f" },
  Pharmacy: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#6f9d84" },
  Therapy: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#568b82" },
  Transport: { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#496f5d" },
  "Tolls & highways": { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#7a7542" },
  "Work tests": { life_area: "Work", is_essential: false, is_extraordinary: false, color: "#6f7782" },
  "Workshops & classes": { life_area: "Growth", is_essential: false, is_extraordinary: false, color: "#9a6b52" },
};

async function applyHospitalAlemanRule(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryId: string | null) {
  if (!categoryId) return;
  const related = transactions.filter((transaction) => /hospital\s*alem[aá]n|hospitalaleman/i.test(transaction.description));
  if (!related.length) return;
  const ids = related.map((transaction) => transaction.id);
  const { error } = await supabase.from("transactions").update({ category_id: categoryId, merchant_name: "Hospital Alemán", merchant_key: "hospital alemán", merchant_country: "AR", beneficiary_scope: "personal" }).eq("user_id", userId).in("id", ids);
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
    transaction.beneficiary_scope = "personal";
  }
}

async function loadTransactions(supabase: SupabaseClient, userId: string) {
  const transactions: WorkspaceTransaction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions").select("id,fingerprint,occurred_at,description,amount,currency,kind,status,excluded_from_totals,fee_amount,category_id,merchant_name,merchant_key,merchant_country,category:categories(name,life_area,is_essential,is_extraordinary,color)").eq("user_id", userId).order("occurred_at").range(from, from + 999);
    if (error) throw error;
    transactions.push(...(data ?? []).map((row) => ({ ...row, category: first(row.category), account: null } as unknown as WorkspaceTransaction)));
    if (!data || data.length < 1000) break;
  }
  return transactions;
}

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }
export { canonicalMerchant };
