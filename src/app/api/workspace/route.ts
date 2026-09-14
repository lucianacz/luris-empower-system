import Decimal from "decimal.js";
import { findCoverageGaps } from "@/lib/accounts/coverage";
import { createEmptyWorkspace } from "@/lib/workspace/demo";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildSpendingSummary } from "@/lib/spending/summary";
import { analyzeRecurring } from "@/lib/intelligence/recurring";
import { inferLocationSuggestions } from "@/lib/locations/inference";
import { deduplicateTransactionRows } from "@/lib/import/runtime-duplicates";
import { cleanDescription } from "@/lib/import/normalize";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { currentFinanceDate } from "@/lib/dates/current-date";

export async function GET() {
  if (!hasSupabaseEnv()) return Response.json(createEmptyWorkspace("signed-out"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(createEmptyWorkspace("signed-out"));

  const [accounts, questions, chains, imports, categories, investments, investmentTransactions, portfolioSnapshots, people, propertyProjects, propertyExpenses, savingsGoals, balanceSnapshots, planningProfiles, locationPeriods, locationHints, recurringObligations, profile] = await Promise.all([
    supabase.from("financial_accounts").select("id,institution,name,currency,last_imported_at,last_transaction_at,coverage_start,coverage_end,owner_person_id,owner:people!financial_accounts_owner_person_id_fkey(id,display_name,role)").eq("user_id", user.id).order("name"),
    supabase.from("questions").select("id,prompt,question_type,created_at,transaction_id,context,priority,supporting_transaction_ids,group_key").eq("user_id", user.id).eq("status", "open").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    supabase.from("transfer_chains").select("id,status,confidence,source_amount,source_currency,fee_amount,notes,transfer_chain_members(sequence,allocated_amount,allocated_currency,transaction:transactions(id,occurred_at,description,amount,currency,kind,status,excluded_from_totals,fee_amount,category_id,account:financial_accounts(name,institution)))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("import_batches").select("id,account_id,institution,file_name,status,row_count,imported_count,duplicate_count,unresolved_count,coverage_start,coverage_end,confirmed_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(250),
    supabase.from("categories").select("id,name,kind,color,icon,parent_id,life_area,is_essential,is_extraordinary").eq("user_id", user.id).eq("is_archived", false).order("name"),
    supabase.from("investment_positions").select("id,quantity,cost_basis,current_value,realized_profit_loss,unrealized_profit_loss,currency,valuation_date,asset:investment_assets(symbol,name,asset_type),account:investment_accounts(name,owner_person_id,owner:people!investment_accounts_owner_person_id_fkey(id,display_name,role))").eq("user_id", user.id).order("valuation_date", { ascending: false }),
    supabase.from("investment_transactions").select("id,occurred_at,transaction_type,gross_amount,fee_amount,currency,asset:investment_assets(symbol,name),account:investment_accounts(name,owner_person_id,owner:people!investment_accounts_owner_person_id_fkey(id,display_name,role))").eq("user_id", user.id).order("occurred_at", { ascending: false }).limit(500),
    supabase.from("portfolio_snapshots").select("id,valuation_date,cash_value,positions_value,total_value,contributions,withdrawals,dividends,interest,fees,taxes,realized_profit_loss,unrealized_profit_loss,currency,account:investment_accounts(name,owner_person_id,owner:people!investment_accounts_owner_person_id_fkey(id,display_name,role))").eq("user_id", user.id).order("valuation_date", { ascending: false }).limit(120),
    supabase.from("people").select("id,display_name,role,notes").eq("user_id", user.id).order("role").order("display_name"),
    supabase.from("property_projects").select("id,name,display_name,location_name,currency,status,notes").eq("user_id", user.id).order("created_at"),
    supabase.from("property_expenses").select("id,project_id,transaction_id,description,transaction_label,expense_type,amount,principal_amount,fee_amount,currency,paid_on,payment_method,source_type,notes,paid_by:people!property_expenses_paid_by_id_fkey(id,display_name,role)").eq("user_id", user.id).order("paid_on", { ascending: false, nullsFirst: false }),
    supabase.from("savings_goals").select("id,owner_person_id,name,scope,target_amount,saved_amount,currency,target_date,status,notes,owner:people!savings_goals_owner_person_id_fkey(id,display_name,role)").eq("user_id", user.id).order("status").order("target_date", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("account_balance_snapshots").select("id,owner_person_id,institution,amount,currency,balance_date,notes,owner:people!account_balance_snapshots_owner_person_id_fkey(id,display_name,role)").eq("user_id", user.id).order("balance_date", { ascending: false }),
    supabase.from("planning_profiles").select("id,person_id,expected_monthly_income,income_currency,income_day,safety_months,income_is_variable,notes,person:people!planning_profiles_person_id_fkey(id,display_name,role)").eq("user_id", user.id),
    supabase.from("location_periods").select("id,starts_on,ends_on,status,period_type,trip_purpose,confidence,explanation,evidence,person_id,person:people!location_periods_person_id_fkey(id,display_name,role),location:locations(id,name,country_code,country_name,default_currency)").eq("user_id", user.id).order("starts_on"),
    supabase.from("location_currency_hints").select("currency,weight,location:locations(country_code,country_name,name)").eq("user_id", user.id),
    supabase.from("recurring_obligations").select("id,owner_person_id,provider_name,merchant_key,frequency,status,country_code,expected_amount,currency,next_expected_on,owner:people!recurring_obligations_owner_person_id_fkey(id,display_name,role),category:categories(name),recurring_obligation_transactions(transaction_id)").eq("user_id", user.id).order("provider_name"),
    supabase.from("profiles").select("ars_exchange_rate_method").eq("id", user.id).maybeSingle(),
  ]);
  const errors = [accounts.error, questions.error, chains.error, imports.error, categories.error, investments.error, investmentTransactions.error, portfolioSnapshots.error, people.error, propertyProjects.error, propertyExpenses.error, savingsGoals.error, balanceSnapshots.error, planningProfiles.error, locationPeriods.error, locationHints.error, recurringObligations.error, profile.error].filter(Boolean);
  if (errors.length) return Response.json({ error: errors[0]?.message ?? "Workspace data could not be loaded." }, { status: 422 });
  const transactions = await loadTransactions(supabase, user.id);
  const duplicateCountByBatch = transactions.reduce((counts, transaction) => {
    if (transaction.metadata?.isDuplicate === true && transaction.import_batch_id) counts.set(transaction.import_batch_id, (counts.get(transaction.import_batch_id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const asOfDate = currentFinanceDate();
  const normalizedLocationPeriods = (locationPeriods.data ?? []).map(normalizeLocationPeriod);
  const intelligence = analyzeRecurring(transactions, asOfDate);
  const learnedHints = (locationHints.data ?? []).flatMap((hint) => {
    const location = firstRelation(hint.location);
    if (!location?.country_code) return [];
    return [{ currency: hint.currency, countryCode: location.country_code, countryName: location.country_name || location.name, weight: Number(hint.weight) }];
  });
  const locationSuggestions = inferLocationSuggestions(transactions, normalizedLocationPeriods, learnedHints);
  const uncategorized = transactions.filter((transaction) => transaction.status === "posted" && !transaction.excluded_from_totals && transaction.kind === "expense" && !transaction.category_id).length;
  const missingFx = transactions.filter((transaction) => transaction.status === "posted" && !transaction.excluded_from_totals && transaction.kind === "expense" && transaction.currency !== "USD" && !transaction.reporting_value).length;
  const uncertainCoverage = intelligence.patterns.reduce((count, pattern) => count + pattern.missingMonths.length + pattern.doubledTransactionIds.length, 0);
  const issueCount = uncategorized + missingFx + (questions.data?.length ?? 0) + locationSuggestions.length + intelligence.patterns.filter((pattern) => !pattern.categoryName).length + uncertainCoverage;

  const totals = calculateTotals(transactions);
  return Response.json({
    mode: "live",
    asOfDate,
    totals,
    accounts: (accounts.data ?? []).map((account) => {
      const periods = (imports.data ?? []).filter((batch) => batch.account_id === account.id && batch.status === "confirmed" && batch.coverage_start && batch.coverage_end).map((batch) => ({ start: batch.coverage_start as string, end: batch.coverage_end as string }));
      return { ...account, owner: firstRelation(account.owner), coverage_gaps: findCoverageGaps(periods), overlapping_periods: countOverlaps(periods) };
    }),
    transactions,
    spending: buildSpendingSummary(transactions),
    questions: questions.data ?? [],
    transferChains: (chains.data ?? []).map((chain) => {
      const members = [...(chain.transfer_chain_members ?? [])].sort((left, right) => left.sequence - right.sequence);
      return { ...chain, members, member_count: members.length, transfer_chain_members: undefined };
    }),
    imports: (imports.data ?? []).map((batch) => ({ ...batch, duplicate_count: Number(batch.duplicate_count) + (duplicateCountByBatch.get(batch.id) ?? 0) })),
    categories: categories.data ?? [],
    investments: (investments.data ?? []).map((position) => ({ ...position, asset: firstRelation(position.asset), account: firstRelation(position.account) })),
    investmentTransactions: (investmentTransactions.data ?? []).map((transaction) => ({ ...transaction, asset: firstRelation(transaction.asset), account: firstRelation(transaction.account) })),
    portfolioSnapshots: (portfolioSnapshots.data ?? []).map((snapshot) => ({ ...snapshot, account: firstRelation(snapshot.account) })),
    people: people.data ?? [],
    propertyProjects: propertyProjects.data ?? [],
    propertyExpenses: (propertyExpenses.data ?? []).map((expense) => ({ ...expense, paid_by: firstRelation(expense.paid_by) })),
    savingsGoals: (savingsGoals.data ?? []).map((goal) => ({ ...goal, owner: firstRelation(goal.owner) })),
    balanceSnapshots: (balanceSnapshots.data ?? []).map((snapshot) => ({ ...snapshot, owner: firstRelation(snapshot.owner) })),
    planningProfiles: (planningProfiles.data ?? []).map((planningProfile) => ({ ...planningProfile, person: firstRelation(planningProfile.person) })),
    locationPeriods: [...normalizedLocationPeriods, ...locationSuggestions.map((suggestion) => ({ id: `suggested:${suggestion.key}`, starts_on: suggestion.startsOn, ends_on: suggestion.endsOn, status: "suggested" as const, period_type: "stay" as const, trip_purpose: null, confidence: suggestion.confidence, explanation: suggestion.explanation, evidence: { ...suggestion.evidence, transactionIds: suggestion.transactionIds }, location: { id: `suggested-location:${suggestion.countryCode}`, name: suggestion.countryName, country_code: suggestion.countryCode, country_name: suggestion.countryName, default_currency: null } }))],
    recurringObligations: (recurringObligations.data ?? []).map((obligation) => ({ ...obligation, owner: firstRelation(obligation.owner), category: firstRelation(obligation.category), transaction_ids: (obligation.recurring_obligation_transactions ?? []).map((item) => item.transaction_id), recurring_obligation_transactions: undefined })),
    suggestedQuestions: intelligence.questions,
    insights: intelligence.insights,
    dataQuality: { score: Math.max(0, Math.round(100 - Math.min(100, issueCount / Math.max(transactions.length, 1) * 100))), uncategorized, missingFx, unansweredQuestions: questions.data?.length ?? 0, uncertainLocations: locationSuggestions.length, recurringUnidentified: intelligence.patterns.filter((pattern) => !pattern.categoryName).length, uncertainCoverage },
    exchangeRatePreference: profile.data?.ars_exchange_rate_method ?? null,
  });
}

async function loadTransactions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const pageSize = 1000;
  const selection = "id,fingerprint,import_batch_id,created_at,occurred_at,posted_at,description,transaction_label,amount,currency,original_amount,original_currency,kind,status,excluded_from_totals,fee_amount,fee_currency,category_id,metadata,merchant_name,merchant_key,merchant_country,merchant_city,travel_origin,travel_destination,travel_date,beneficiary_scope,reimbursement_status,category:categories(name,life_area,is_essential,is_extraordinary,color),account:financial_accounts(name,institution),account_owner:people!transactions_account_owner_id_fkey(id,display_name,role),paid_by:people!transactions_paid_by_id_fkey(id,display_name,role),reporting_value:transaction_reporting_values(reporting_amount,reporting_currency,rate_to_reporting,source,is_estimated,exchange_rate:exchange_rates(methodology,rate_date)),location_period:location_periods(id,starts_on,ends_on,status,period_type,trip_purpose,confidence,explanation,evidence,location:locations(id,name,country_code,country_name,default_currency)),expense_splits(id,split_kind,label,percentage,amount,beneficiary_person_id),expense_allocations:expense_period_allocations(id,service_month,amount,currency,reporting_amount,reporting_currency,is_estimated)";
  const firstPage = await supabase.from("transactions").select(selection, { count: "exact" }).eq("user_id", userId).order("occurred_at", { ascending: false }).range(0, pageSize - 1);
  if (firstPage.error) throw firstPage.error;
  const total = firstPage.count ?? firstPage.data?.length ?? 0;
  const remainingPages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / pageSize) - 1) }, (_, index) => {
    const from = (index + 1) * pageSize;
    return supabase.from("transactions").select(selection).eq("user_id", userId).order("occurred_at", { ascending: false }).range(from, from + pageSize - 1);
  }));
  const pageError = remainingPages.find((page) => page.error)?.error;
  if (pageError) throw pageError;
  const transactions = [firstPage, ...remainingPages].flatMap((page) => (page.data ?? []).map((transaction) => normalizeTransaction(transaction as Record<string, unknown>)));
  return deduplicateTransactionRows(transactions);
}

function normalizeTransaction(value: Record<string, unknown>): WorkspaceTransaction {
  const reportingValue = firstRelation(value.reporting_value as Record<string, unknown> | Record<string, unknown>[] | null);
  const locationPeriod = firstRelation(value.location_period as Record<string, unknown> | Record<string, unknown>[] | null);
  const description = cleanDescription(String(value.description ?? ""));
  const merchantName = value.merchant_name ? cleanDescription(String(value.merchant_name)) : null;
  return { ...value, description, merchant_name: merchantName, category: firstRelation(value.category), account: firstRelation(value.account), account_owner: firstRelation(value.account_owner), paid_by: firstRelation(value.paid_by), reporting_value: normalizeReportingValue(reportingValue), location_period: locationPeriod ? normalizeLocationPeriod(locationPeriod) : null } as unknown as WorkspaceTransaction;
}

function normalizeReportingValue(value: Record<string, unknown> | null) {
  if (!value) return null;
  return { ...value, exchange_rate: firstRelation(value.exchange_rate) };
}

function normalizeLocationPeriod(value: Record<string, unknown>) {
  return { ...value, location: firstRelation(value.location), person: firstRelation(value.person) } as unknown as import("@/lib/workspace/demo").WorkspaceLocationPeriod;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
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

function calculateTotals(transactions: Array<{ amount: string | number; currency: string; kind: string; status: string; excluded_from_totals: boolean; fee_amount: string | number; metadata?: Record<string, unknown> }>) {
  const totals = new Map<string, { currency: string; income: Decimal; spending: Decimal; internalMovement: Decimal; fees: Decimal }>();
  for (const transaction of transactions) {
    if (transaction.status !== "posted") continue;
    if (transaction.metadata?.isDuplicate === true) continue;
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
