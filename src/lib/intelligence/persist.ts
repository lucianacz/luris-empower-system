import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultCategories, suggestDefaultCategory } from "@/lib/categories/defaults";
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
  await applyDefaultCategorySuggestions(supabase, userId, transactions, categoryIds);
  await applyHospitalAlemanRule(supabase, userId, transactions, categoryIds.get("Health insurance") ?? null);
  await applyConfirmedFundingAttributions(supabase, userId, transactions);
  await applyHouseholdRules(supabase, userId, transactions);
  const automaticallyDismissedQuestions = await dismissUnnecessaryQuestions(supabase, userId, transactions);
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
  return { obligationCount, questionCount, insightCount: analysis.insights.length, estimatedReportingValueCount, automaticallyDismissedQuestions };
}

async function applyDefaultCategorySuggestions(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryIds: Map<string, string>) {
  const byCategory = new Map<string, WorkspaceTransaction[]>();
  for (const transaction of transactions) {
    if (transaction.status !== "posted" || transaction.excluded_from_totals || transaction.kind !== "expense" || transaction.category_id) continue;
    const categoryName = suggestDefaultCategory({ kind: transaction.kind as TransactionKind, description: transaction.description, metadata: (transaction.metadata ?? {}) as Record<string, string | number | boolean | null>, amount: transaction.amount, currency: transaction.currency });
    if (!categoryName || !categoryIds.has(categoryName)) continue;
    byCategory.set(categoryName, [...(byCategory.get(categoryName) ?? []), transaction]);
  }
  for (const [categoryName, related] of byCategory) {
    const categoryId = categoryIds.get(categoryName)!;
    for (let index = 0; index < related.length; index += 500) {
      const { error } = await supabase.from("transactions").update({ category_id: categoryId }).eq("user_id", userId).in("id", related.slice(index, index + 500).map((transaction) => transaction.id));
      if (error) throw error;
    }
    for (const transaction of related) {
      transaction.category_id = categoryId;
      transaction.category = categoryFor(categoryName);
    }
  }
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
  await Promise.all(knownMerchantRules.map(async (rule) => {
    const related = transactions.filter((transaction) => matchKnownMerchant(transaction.description, transaction)?.id === rule.id);
    if (!related.length) return;
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
        ...(rule.transactionLabel ? { transaction_label: rule.transactionLabel } : {}),
        ...(rule.countryCode ? { merchant_country: rule.countryCode } : {}),
        ...(rule.kind ? { kind: rule.kind } : {}),
        ...(rule.excludedFromTotals !== undefined ? { excluded_from_totals: rule.excludedFromTotals } : {}),
        ...(rule.beneficiaryScope ? { beneficiary_scope: rule.beneficiaryScope } : {}),
        ...(rule.reimbursementStatus ? { reimbursement_status: rule.reimbursementStatus } : {}),
      };
      for (let index = 0; index < merchantTransactions.length; index += 500) {
        const { error } = await supabase.from("transactions").update(update).eq("user_id", userId).in("id", merchantTransactions.slice(index, index + 500).map((transaction) => transaction.id));
        if (error) throw error;
      }
      const { error: merchantError } = await supabase.from("merchant_profiles").upsert({ user_id: userId, merchant_key: merchantKey, display_name: merchantName, category_id: categoryId, person_id: personId, country_code: rule.countryCode ?? merchantTransactions.find((transaction) => transaction.merchant_country)?.merchant_country ?? null, transaction_label: rule.transactionLabel ?? null, notes: rule.notes ?? rule.personRole ?? null }, { onConflict: "user_id,merchant_key" });
      if (merchantError) throw merchantError;
      for (const transaction of merchantTransactions) {
        transaction.category_id = categoryId;
        transaction.category = rule.categoryName ? categoryFor(rule.categoryName) : null;
        transaction.merchant_name = merchantName;
        transaction.merchant_key = merchantKey;
        if (rule.transactionLabel) transaction.transaction_label = rule.transactionLabel;
        if (rule.countryCode) transaction.merchant_country = rule.countryCode;
        if (rule.beneficiaryScope) transaction.beneficiary_scope = rule.beneficiaryScope;
        if (rule.reimbursementStatus) transaction.reimbursement_status = rule.reimbursementStatus;
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
  }));
}

async function applySpecificCategoryRefinements(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], categoryIds: Map<string, string>) {
  const refinements = [
    { categoryName: "Hotels", pattern: /hotel|hostel|booking(?:\.com|\.[a-z])?|lodging|accommodation/i, fromCategories: new Set(["Travel", "Hotels"]) },
    { categoryName: "Car rental", pattern: /car rental|alquiler de auto|\benterprise\b|rent[ -]?a[ -]?car/i, fromCategories: new Set(["Travel", "Transport", "Car rental"]) },
    { categoryName: "Car repairs", pattern: /car repair|reparaci[oó]n.*(?:auto|carro)|mec[aá]nic|neum[aá]tic|la casa del hyundai|centro llantero del sur/i, fromCategories: new Set(["Transport", "Car repairs"]) },
    { categoryName: "Fuel & gas", pattern: /fuel|\bgas\b|gasolin|combustible|servicentro|gas station|lumicentro|terpel|racetrac|shell\s+oil/i, fromCategories: new Set(["Transport", "Fuel & gas"]) },
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

  const papayaKidsCategoryId = categoryIds.get("Papaya Kids");
  const chineseCurrencyCompanyExpenses = transactions.filter((transaction) => {
    const originalCurrency = transaction.original_currency?.toUpperCase();
    return transaction.account_owner?.role === "partner"
      && transaction.status === "posted"
      && Number(transaction.amount) < 0
      && (transaction.currency.toUpperCase() === "CNY" || originalCurrency === "CNY");
  });
  if (papayaKidsCategoryId && chineseCurrencyCompanyExpenses.length) {
    for (let index = 0; index < chineseCurrencyCompanyExpenses.length; index += 500) {
      const { error } = await supabase.from("transactions").update({
        category_id: papayaKidsCategoryId,
        kind: "expense",
        excluded_from_totals: false,
        beneficiary_scope: "personal",
        transaction_label: "Papaya Kids · company expense",
      }).eq("user_id", userId).in("id", chineseCurrencyCompanyExpenses.slice(index, index + 500).map((transaction) => transaction.id));
      if (error) throw error;
    }
    for (const transaction of chineseCurrencyCompanyExpenses) {
      transaction.category_id = papayaKidsCategoryId;
      transaction.category = categoryFor("Papaya Kids");
      transaction.kind = "expense";
      transaction.excluded_from_totals = false;
      transaction.beneficiary_scope = "personal";
      transaction.transaction_label = "Papaya Kids · company expense";
    }
  }

  const partnerPaypal = transactions.filter((transaction) => transaction.account_owner?.role === "partner" && transaction.status === "posted" && Number(transaction.amount) < 0 && /\bpaypal\b/i.test(cleanDescription(transaction.description)));
  if (papayaKidsCategoryId && partnerPaypal.length) {
    for (let index = 0; index < partnerPaypal.length; index += 500) {
      const { error } = await supabase.from("transactions").update({ category_id: papayaKidsCategoryId, kind: "expense", excluded_from_totals: false, beneficiary_scope: "personal", transaction_label: "Papaya Kids · PayPal" }).eq("user_id", userId).in("id", partnerPaypal.slice(index, index + 500).map((transaction) => transaction.id));
      if (error) throw error;
    }
    for (const transaction of partnerPaypal) {
      transaction.category_id = papayaKidsCategoryId;
      transaction.category = categoryFor("Papaya Kids");
      transaction.kind = "expense";
      transaction.excluded_from_totals = false;
      transaction.beneficiary_scope = "personal";
      transaction.transaction_label = "Papaya Kids · PayPal";
    }
  }

  const partnerCompanyExpenses = transactions.filter((transaction) => transaction.account_owner?.role === "partner"
    && transaction.status === "posted"
    && Number(transaction.amount) < 0
    && /\bamazon\s+mexico\b|\bamzn\s+mktp\s+ca\*1k38940w3\b|\bhelium10\.com\b|\btiktok\s+ads\b|\bus\s+patent\s+trademark\b|\bgodaddy\b|\bnic\s+argentina\b|\bwww\.nic\.ar\b/i.test(cleanDescription(transaction.description)));
  if (papayaKidsCategoryId && partnerCompanyExpenses.length) {
    for (let index = 0; index < partnerCompanyExpenses.length; index += 500) {
      const { error } = await supabase.from("transactions").update({
        category_id: papayaKidsCategoryId,
        kind: "expense",
        excluded_from_totals: false,
        beneficiary_scope: "personal",
        transaction_label: "Papaya Kids · business purchase",
      }).eq("user_id", userId).in("id", partnerCompanyExpenses.slice(index, index + 500).map((transaction) => transaction.id));
      if (error) throw error;
    }
    for (const transaction of partnerCompanyExpenses) {
      transaction.category_id = papayaKidsCategoryId;
      transaction.category = categoryFor("Papaya Kids");
      transaction.kind = "expense";
      transaction.excluded_from_totals = false;
      transaction.beneficiary_scope = "personal";
      transaction.transaction_label = "Papaya Kids · business purchase";
      const merchantKey = transaction.merchant_key ?? canonicalMerchant(transaction.merchant_name ?? transaction.description);
      const { error } = await supabase.from("merchant_profiles").upsert({
        user_id: userId,
        merchant_key: merchantKey,
        display_name: transaction.merchant_name ?? cleanDescription(transaction.description),
        category_id: papayaKidsCategoryId,
        transaction_label: "Papaya Kids · business purchase",
        notes: "Confirmed or clearly identified Papaya Kids business purchase for Julian.",
      }, { onConflict: "user_id,merchant_key" });
      if (error) throw error;
    }
  }

  const partnerPapayaKids = transactions.filter((transaction) => transaction.account_owner?.role === "partner" && transaction.category?.name === "Papaya Kids");
  for (let index = 0; index < partnerPapayaKids.length; index += 500) {
    const { error } = await supabase.from("transactions").update({
      beneficiary_scope: "personal",
      location_period_id: null,
      travel_origin: null,
      travel_destination: null,
      travel_date: null,
      merchant_country: null,
    }).eq("user_id", userId).in("id", partnerPapayaKids.slice(index, index + 500).map((transaction) => transaction.id));
    if (error) throw error;
  }
  for (const transaction of partnerPapayaKids) {
    transaction.beneficiary_scope = "personal";
    transaction.location_period = null;
    transaction.travel_destination = null;
    transaction.merchant_country = null;
  }

  const therapyRows = transactions.filter((transaction) => /daniel\s+jesica\s+solange/i.test(cleanDescription(transaction.description)));
  const therapyExpenses = therapyRows.filter((transaction) => transaction.status === "posted" && Number(transaction.amount) < 0);
  const therapyZeroRows = therapyRows.filter((transaction) => Number(transaction.amount) === 0);
  for (let index = 0; index < therapyExpenses.length; index += 500) {
    const { error } = await supabase.from("transactions").update({ kind: "expense", excluded_from_totals: false, beneficiary_scope: "personal", transaction_label: "Weekly therapy" }).eq("user_id", userId).in("id", therapyExpenses.slice(index, index + 500).map((transaction) => transaction.id));
    if (error) throw error;
  }
  for (let index = 0; index < therapyZeroRows.length; index += 500) {
    const { error } = await supabase.from("transactions").update({ kind: "unknown", excluded_from_totals: true, beneficiary_scope: "personal", transaction_label: "Statement reference only · no charge" }).eq("user_id", userId).in("id", therapyZeroRows.slice(index, index + 500).map((transaction) => transaction.id));
    if (error) throw error;
  }
  for (const transaction of therapyExpenses) {
    transaction.kind = "expense";
    transaction.excluded_from_totals = false;
    transaction.beneficiary_scope = "personal";
    transaction.transaction_label = "Weekly therapy";
  }
  for (const transaction of therapyZeroRows) {
    transaction.kind = "unknown";
    transaction.excluded_from_totals = true;
    transaction.beneficiary_scope = "personal";
    transaction.transaction_label = "Statement reference only · no charge";
  }

  const mistakenSatuTransfers = transactions.filter((transaction) => transaction.category?.name === "Satu Lagi Villa" && transaction.currency !== "USD" && /julian(?:\s+aaron)?\s+stivelman/i.test(cleanDescription(transaction.description)));
  for (let index = 0; index < mistakenSatuTransfers.length; index += 500) {
    const { error } = await supabase.from("transactions").update({ category_id: null, kind: "unknown", excluded_from_totals: true, transaction_label: "Transfer with Julian · not Satu Lagi" }).eq("user_id", userId).in("id", mistakenSatuTransfers.slice(index, index + 500).map((transaction) => transaction.id));
    if (error) throw error;
  }
  for (const transaction of mistakenSatuTransfers) {
    transaction.category_id = null;
    transaction.category = null;
    transaction.kind = "unknown";
    transaction.excluded_from_totals = true;
    transaction.transaction_label = "Transfer with Julian · not Satu Lagi";
  }
}

async function applyHouseholdRules(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[]) {
  const sharedTravelAndCar = new Set(["Flights", "Diving & activities", "Hotels", "Car", "Car rental", "Car repairs", "Fuel & gas", "Parking", "Tolls & highways"]);
  const sharedAsiaCategories = new Set(["Dining out", "Flights", "Entertainment"]);
  const asiaCountryCodes = new Set(["BN", "BT", "CN", "HK", "ID", "IN", "JP", "KH", "KR", "LA", "LK", "MO", "MV", "MY", "NP", "PH", "SG", "TH", "TW", "VN"]);
  const asiaCurrencies = new Set(["BND", "CNY", "HKD", "IDR", "INR", "JPY", "KRW", "LKR", "MOP", "MYR", "PHP", "SGD", "THB", "TWD", "VND"]);
  const sharedIds: string[] = [];
  const personalSoloTripIds: string[] = [];
  const alwaysPersonalCategories = new Set(["Alternative therapy", "Dentist", "Dermatology", "Health insurance", "Papaya Kids", "Private health", "Therapy", "Workshops & classes"]);

  for (const transaction of transactions) {
    if (transaction.status !== "posted" || transaction.excluded_from_totals || !["expense", "refund"].includes(transaction.kind)) continue;
    const categoryName = transaction.category?.name ?? null;
    const country = transaction.location_period?.location.country_code ?? transaction.merchant_country ?? null;
    const originalCurrency = transaction.original_currency?.toUpperCase() ?? transaction.currency.toUpperCase();
    const travelDestination = transaction.travel_destination?.toUpperCase() ?? null;
    const isCanadaTravel = country === "CA" || travelDestination === "CA" || originalCurrency === "CAD";
    const isJulianBrazilTrip = transaction.account_owner?.role === "partner" && (country === "BR" || travelDestination === "BR" || originalCurrency === "BRL");
    const isSoloTrip = isCanadaTravel || isJulianBrazilTrip || alwaysPersonalCategories.has(categoryName ?? "");
    const isTravelOrCar = sharedTravelAndCar.has(categoryName ?? "");
    const isMexico = (country === "MX" || originalCurrency === "MXN") && ["Dining out", "Groceries", "Housing", "Hotels"].includes(categoryName ?? "");
    const isUsHotel = country === "US" && categoryName === "Hotels";
    const locationName = transaction.location_period?.location.name?.toLocaleLowerCase() ?? "";
    const isCostaRicaRestaurant = country === "CR" && categoryName === "Dining out";
    const isMiamiRestaurant = transaction.account_owner?.role === "self" && locationName.includes("miami") && categoryName === "Dining out";
    const isSharedAsiaExpense = sharedAsiaCategories.has(categoryName ?? "") && (asiaCountryCodes.has(country ?? "") || asiaCurrencies.has(transaction.original_currency?.toUpperCase() ?? transaction.currency.toUpperCase()));
    const isYouTube = /youtube\s*\(via apple\)|apple\.com(?:\/|\s+)bill/i.test(`${transaction.merchant_name ?? ""} ${transaction.description}`) && Math.abs(Number(transaction.amount)) === 9.49;

    if (isSoloTrip) personalSoloTripIds.push(transaction.id);
    else if (isTravelOrCar || isMexico || isUsHotel || isCostaRicaRestaurant || isMiamiRestaurant || isSharedAsiaExpense || isYouTube) sharedIds.push(transaction.id);
  }

  for (let index = 0; index < sharedIds.length; index += 500) {
    const ids = sharedIds.slice(index, index + 500);
    const { error } = await supabase.from("transactions").update({ beneficiary_scope: "shared" }).eq("user_id", userId).in("id", ids);
    if (error) throw error;
  }
  for (let index = 0; index < personalSoloTripIds.length; index += 500) {
    const ids = personalSoloTripIds.slice(index, index + 500);
    const { error } = await supabase.from("transactions").update({ beneficiary_scope: "personal" }).eq("user_id", userId).in("id", ids);
    if (error) throw error;
  }
  const sharedSet = new Set(sharedIds);
  const personalSet = new Set(personalSoloTripIds);
  for (const transaction of transactions) {
    if (sharedSet.has(transaction.id)) transaction.beneficiary_scope = "shared";
    if (personalSet.has(transaction.id)) transaction.beneficiary_scope = "personal";
  }
}

async function applyConfirmedFundingAttributions(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[]) {
  const { data: people, error: peopleError } = await supabase.from("people").select("id,display_name,role").eq("user_id", userId).in("role", ["self", "partner"]);
  if (peopleError) throw peopleError;
  const luciana = (people ?? []).find((person) => person.role === "self");
  const julian = (people ?? []).find((person) => person.role === "partner");
  if (!luciana || !julian) return;

  const lucianaFunding = transactions.filter((transaction) => {
    if (transaction.account_owner?.role !== "self" || transaction.kind !== "transfer" || transaction.status !== "posted" || transaction.reimbursement_status === "settled") return false;
    const holder = typeof transaction.metadata?.withdrawAccountHolderName === "string" ? transaction.metadata.withdrawAccountHolderName : "";
    return /julian(?:\s+aaron)?\s+stivelman/i.test(`${holder} ${transaction.description}`);
  });
  const attributedIds = new Set<string>();

  for (const funding of lucianaFunding) {
    const fundingDate = new Date(funding.occurred_at).getTime();
    const fundingAmount = Math.abs(Number(funding.amount));
    const tolerance = Math.max(25, fundingAmount * 0.03);
    const candidate = transactions
      .filter((transaction) => {
        if (attributedIds.has(transaction.id) || transaction.account_owner?.role !== "partner" || transaction.status !== "posted" || Number(transaction.amount) >= 0) return false;
        if (!["expense", "fee", "tax", "investment_purchase"].includes(transaction.kind)) return false;
        const elapsedDays = (new Date(transaction.occurred_at).getTime() - fundingDate) / 86_400_000;
        return elapsedDays >= 0 && elapsedDays <= 10 && Math.abs(Math.abs(Number(transaction.amount)) - fundingAmount) <= tolerance;
      })
      .sort((left, right) => Math.abs(Math.abs(Number(left.amount)) - fundingAmount) - Math.abs(Math.abs(Number(right.amount)) - fundingAmount))[0];
    if (!candidate) continue;
    attributedIds.add(candidate.id);
    const metadata = {
      ...(candidate.metadata ?? {}),
      fundingSourceTransactionId: funding.id,
      attributionNote: "Paid by Luciana through Julian's Wise account after a direct Deel transfer.",
    };
    const { error } = await supabase.from("transactions").update({ paid_by_id: luciana.id, metadata }).eq("user_id", userId).eq("id", candidate.id);
    if (error) throw error;
    candidate.metadata = metadata;
  }

  const satuLagiRows = transactions.filter((transaction) => /baltodano\s+gomez\s+martin/i.test(`${transaction.description} ${transaction.merchant_name ?? ""}`));
  const lucianaLegalRows = transactions.filter((transaction) => /gutierrez\s+gonzalez\s+kaily\s+vanessa/i.test(`${transaction.description} ${transaction.merchant_name ?? ""}`) && Math.abs(Number(transaction.amount)) < 300);
  const julianLegalRows = transactions.filter((transaction) => /gutierrez\s+gonzalez\s+kaily\s+vanessa/i.test(`${transaction.description} ${transaction.merchant_name ?? ""}`) && Math.abs(Number(transaction.amount)) >= 300);
  await applyPayerAttribution(supabase, userId, satuLagiRows, luciana.id, "Funded by Luciana via Deel → Julian Wise; Satu Lagi land purchase, excluded from monthly living expenses.");
  await applyPayerAttribution(supabase, userId, lucianaLegalRows, luciana.id, "Paid by Luciana through Julian's Wise account; Satu Lagi legal cost, excluded from monthly living expenses.");
  await applyPayerAttribution(supabase, userId, julianLegalRows, julian.id, "Paid by Julian; Satu Lagi legal cost, excluded from monthly living expenses.");
}

async function applyPayerAttribution(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[], paidById: string, attributionNote: string) {
  for (const transaction of transactions) {
    const metadata = { ...(transaction.metadata ?? {}), attributionNote };
    const { error } = await supabase.from("transactions").update({ paid_by_id: paidById, metadata }).eq("user_id", userId).eq("id", transaction.id);
    if (error) throw error;
    transaction.metadata = metadata;
  }
}

async function dismissUnnecessaryQuestions(supabase: SupabaseClient, userId: string, transactions: WorkspaceTransaction[]) {
  const { data, error } = await supabase.from("questions").select("id,question_type,transaction_id,supporting_transaction_ids").eq("user_id", userId).eq("status", "open").in("question_type", ["classification", "import_warning"]);
  if (error) throw error;
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const ids = (data ?? []).filter((question) => {
    const transactionIds = [...new Set([question.transaction_id, ...(question.supporting_transaction_ids ?? [])].filter((id): id is string => typeof id === "string"))];
    const related = transactionIds.map((id) => byId.get(id)).filter((transaction): transaction is WorkspaceTransaction => Boolean(transaction));
    if (!related.length) return true;
    return related.every((transaction) => transaction.status !== "posted" || transaction.excluded_from_totals || transaction.kind === "transfer" || Boolean(transaction.category_id));
  }).map((question) => question.id);

  for (let index = 0; index < ids.length; index += 500) {
    const { error: updateError } = await supabase.from("questions").update({ status: "dismissed", resolution: { automatic: true, reason: "The linked transaction is now classified, excluded, failed, reversed, or an internal movement." }, resolved_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids.slice(index, index + 500));
    if (updateError) throw updateError;
  }
  return ids.length;
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
  "Private health": { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#2f7f78" },
  Parking: { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#65766f" },
  Pharmacy: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#6f9d84" },
  Therapy: { life_area: "Health", is_essential: true, is_extraordinary: false, color: "#568b82" },
  Transport: { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#496f5d" },
  "Tolls & highways": { life_area: "Mobility", is_essential: true, is_extraordinary: false, color: "#7a7542" },
  Visas: { life_area: "Travel", is_essential: false, is_extraordinary: true, color: "#58729c" },
  "Satu Lagi Villa": { life_area: "Assets", is_essential: false, is_extraordinary: true, color: "#8a6545" },
  "Work tests": { life_area: "Work", is_essential: false, is_extraordinary: false, color: "#6f7782" },
  "Workshops & classes": { life_area: "Growth", is_essential: false, is_extraordinary: false, color: "#9a6b52" },
  "Papaya Kids": { life_area: "Business", is_essential: false, is_extraordinary: false, color: "#b06d32" },
  "Loan on card · cash returned": { life_area: "Financial", is_essential: false, is_extraordinary: true, color: "#8b7656" },
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
    const { data, error } = await supabase.from("transactions").select("id,fingerprint,occurred_at,description,transaction_label,amount,currency,original_currency,kind,status,excluded_from_totals,fee_amount,category_id,merchant_name,merchant_key,merchant_country,travel_destination,beneficiary_scope,reimbursement_status,metadata,category:categories(name,life_area,is_essential,is_extraordinary,color),account_owner:people!transactions_account_owner_id_fkey(id,display_name,role),location_period:location_periods(id,starts_on,ends_on,status,period_type,trip_purpose,confidence,explanation,evidence,location:locations(id,name,country_code,country_name,default_currency))").eq("user_id", userId).order("occurred_at").range(from, from + 999);
    if (error) throw error;
    transactions.push(...(data ?? []).map((row) => ({ ...row, category: first(row.category), account: null } as unknown as WorkspaceTransaction)));
    if (!data || data.length < 1000) break;
  }
  return transactions;
}

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }
export { canonicalMerchant };
