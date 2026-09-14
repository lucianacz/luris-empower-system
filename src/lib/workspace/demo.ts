export interface WorkspaceTotal {
  currency: string;
  income: number;
  spending: number;
  internalMovement: number;
  fees: number;
}

export interface WorkspaceAccount {
  id: string;
  institution: string;
  name: string;
  currency: string;
  last_imported_at: string | null;
  last_transaction_at: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  coverage_gaps: Array<{ start: string; end: string; days: number }>;
  overlapping_periods: number;
}

export interface WorkspaceTransaction {
  id: string;
  fingerprint?: string;
  import_batch_id?: string | null;
  created_at?: string;
  occurred_at: string;
  posted_at?: string | null;
  description: string;
  amount: string;
  currency: string;
  original_amount?: string | null;
  original_currency?: string | null;
  kind: string;
  status: string;
  excluded_from_totals: boolean;
  fee_amount: string;
  fee_currency?: string | null;
  category_id: string | null;
  category: { name: string; life_area: string; is_essential: boolean; is_extraordinary?: boolean; color: string | null; parent?: { name: string } | null } | null;
  account: { name: string; institution: string; owner?: { id: string; display_name: string } | null } | null;
  account_owner?: { id: string; display_name: string; role: string } | null;
  paid_by?: { id: string; display_name: string; role: string } | null;
  metadata?: Record<string, unknown>;
  merchant_name?: string | null;
  merchant_key?: string | null;
  merchant_country?: string | null;
  merchant_city?: string | null;
  travel_origin?: string | null;
  travel_destination?: string | null;
  travel_date?: string | null;
  beneficiary_scope?: "personal" | "shared" | "partner" | "other";
  reimbursement_status?: "none" | "expected" | "partial" | "settled" | "uncertain";
  reporting_value?: { reporting_amount: string; reporting_currency: string; rate_to_reporting: string; source: string; is_estimated: boolean; exchange_rate?: { methodology: string; rate_date: string } | null } | null;
  location_period?: WorkspaceLocationPeriod | null;
  expense_splits?: Array<{ id: string; split_kind: string; label: string; percentage: string | null; amount: string | null; beneficiary_person_id?: string | null }>;
  expense_allocations?: Array<{ id: string; service_month: string; amount: string; currency: string; reporting_amount: string | null; reporting_currency: string; is_estimated: boolean }>;
}

export interface WorkspaceQuestion {
  id: string;
  prompt: string;
  question_type: string;
  created_at: string;
  transaction_id: string | null;
  context: Record<string, unknown>;
  priority?: number;
  supporting_transaction_ids?: string[];
  group_key?: string | null;
}

export interface WorkspaceLocationPeriod {
  id: string;
  starts_on: string;
  ends_on: string | null;
  status: "suggested" | "confirmed" | "rejected";
  period_type: "location" | "stay" | "temporary_stay" | "home_base";
  trip_purpose: string | null;
  confidence: number;
  explanation: string;
  evidence: Record<string, unknown>;
  location: { id: string; name: string; country_code: string | null; country_name: string | null; default_currency: string | null };
}

export interface WorkspaceRecurringObligation {
  id: string;
  provider_name: string;
  merchant_key: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annual" | "uncertain";
  status: "active" | "inactive" | "uncertain";
  country_code: string | null;
  expected_amount: string | null;
  currency: string | null;
  next_expected_on: string | null;
  category: { name: string; parent?: { name: string } | null } | null;
  transaction_ids: string[];
}

export interface WorkspaceInsight {
  key: string;
  title: string;
  body: string;
  priority: number;
  transactionIds: string[];
}

export interface WorkspaceDataQuality {
  score: number;
  uncategorized: number;
  missingFx: number;
  unansweredQuestions: number;
  uncertainLocations: number;
  recurringUnidentified: number;
  uncertainCoverage: number;
}

export interface TransferMember {
  sequence: number;
  allocated_amount: string | null;
  allocated_currency: string | null;
  transaction: WorkspaceTransaction | null;
}

export interface WorkspaceTransferChain {
  id: string;
  status: string;
  confidence: number;
  source_amount: string | null;
  source_currency: string | null;
  fee_amount: string;
  notes: string | null;
  member_count: number;
  members: TransferMember[];
}

export interface WorkspaceCategory {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
  life_area: string;
  is_essential: boolean;
  is_extraordinary?: boolean;
}

export interface SpendingCurrencySummary {
  currency: string;
  total: number;
  averagePerMonth: number;
  personal: number;
  household: number;
  essential: number;
  flexible: number;
  uncategorized: number;
  uncategorizedCount: number;
  months: Array<{ month: string; amount: number }>;
  categories: Array<{ name: string; lifeArea: string; color: string; amount: number; essential: boolean }>;
}

export interface WorkspaceInvestment {
  id: string;
  quantity: string;
  cost_basis: string | null;
  current_value: string | null;
  realized_profit_loss: string;
  unrealized_profit_loss: string | null;
  currency: string;
  valuation_date: string;
  asset: { symbol: string | null; name: string; asset_type: string } | null;
  account: { name: string } | null;
}

export interface WorkspaceInvestmentTransaction {
  id: string;
  occurred_at: string;
  transaction_type: string;
  gross_amount: string;
  fee_amount: string;
  currency: string;
  asset: { symbol: string | null; name: string } | null;
  account: { name: string } | null;
}

export interface WorkspacePortfolioSnapshot {
  id: string;
  valuation_date: string;
  cash_value: string;
  positions_value: string;
  total_value: string;
  contributions: string;
  withdrawals: string;
  dividends: string;
  interest: string;
  fees: string;
  taxes: string;
  realized_profit_loss: string;
  unrealized_profit_loss: string;
  currency: string;
  account: { name: string } | null;
}

export interface WorkspacePerson { id: string; display_name: string; role: "self" | "partner" | "provider" | "other"; notes: string | null }

export interface WorkspaceData {
  mode: "demo" | "signed-out" | "live";
  asOfDate: string;
  totals: WorkspaceTotal[];
  accounts: WorkspaceAccount[];
  transactions: WorkspaceTransaction[];
  questions: WorkspaceQuestion[];
  transferChains: WorkspaceTransferChain[];
  imports: Array<{ id: string; account_id?: string | null; institution?: string | null; file_name: string; status: string; row_count: number; imported_count: number; duplicate_count: number; unresolved_count: number; coverage_start?: string | null; coverage_end?: string | null; confirmed_at: string | null; created_at: string }>;
  categories: WorkspaceCategory[];
  spending: SpendingCurrencySummary[];
  investments: WorkspaceInvestment[];
  investmentTransactions: WorkspaceInvestmentTransaction[];
  portfolioSnapshots: WorkspacePortfolioSnapshot[];
  people: WorkspacePerson[];
  locationPeriods: WorkspaceLocationPeriod[];
  recurringObligations: WorkspaceRecurringObligation[];
  insights: WorkspaceInsight[];
  dataQuality: WorkspaceDataQuality;
  suggestedQuestions: Array<{ key: string; type: string; prompt: string; explanation: string; priority: number; transactionIds: string[]; merchantKey: string }>;
  exchangeRatePreference: string | null;
}

export function createEmptyWorkspace(mode: WorkspaceData["mode"] = "signed-out", asOfDate = new Date().toISOString().slice(0, 10)): WorkspaceData {
  return {
    mode,
    asOfDate,
    totals: [],
    accounts: [],
    transactions: [],
    questions: [],
    transferChains: [],
    imports: [],
    categories: [],
    spending: [],
    investments: [],
    investmentTransactions: [],
    portfolioSnapshots: [],
    people: [],
    locationPeriods: [],
    recurringObligations: [],
    insights: [],
    dataQuality: { score: 0, uncategorized: 0, missingFx: 0, unansweredQuestions: 0, uncertainLocations: 0, recurringUnidentified: 0, uncertainCoverage: 0 },
    suggestedQuestions: [],
    exchangeRatePreference: null,
  };
}

const demoCategories: WorkspaceCategory[] = [
  { id: "demo-housing", name: "Housing", kind: "expense", color: "#7a6c5d", icon: null, parent_id: null, life_area: "Home", is_essential: true },
  { id: "demo-groceries", name: "Groceries", kind: "expense", color: "#52796f", icon: null, parent_id: null, life_area: "Food", is_essential: true },
  { id: "demo-dining", name: "Dining out", kind: "expense", color: "#d37a3d", icon: null, parent_id: null, life_area: "Food", is_essential: false },
  { id: "demo-transport", name: "Transport", kind: "expense", color: "#496f5d", icon: null, parent_id: null, life_area: "Mobility", is_essential: true },
  { id: "demo-travel", name: "Travel", kind: "expense", color: "#4d7298", icon: null, parent_id: null, life_area: "Travel", is_essential: false, is_extraordinary: true },
  { id: "demo-flights", name: "Flights", kind: "expense", color: "#416788", icon: null, parent_id: "demo-travel", life_area: "Travel", is_essential: false, is_extraordinary: true },
  { id: "demo-subscriptions", name: "Subscriptions & software", kind: "expense", color: "#6c63a8", icon: null, parent_id: null, life_area: "Digital", is_essential: false },
  { id: "demo-health", name: "Health", kind: "expense", color: "#3d7c6f", icon: null, parent_id: null, life_area: "Health", is_essential: true },
  { id: "demo-insurance", name: "Health insurance", kind: "expense", color: "#326a60", icon: null, parent_id: "demo-health", life_area: "Health", is_essential: true },
];

const demoLocations: WorkspaceLocationPeriod[] = [
  { id: "demo-mexico", starts_on: "2026-03-01", ends_on: "2026-04-30", status: "confirmed", period_type: "temporary_stay", trip_purpose: null, confidence: 1, explanation: "Manually confirmed location period.", evidence: {}, location: { id: "demo-location-mx", name: "Mexico", country_code: "MX", country_name: "Mexico", default_currency: "MXN" } },
  { id: "demo-costa-rica", starts_on: "2026-05-01", ends_on: null, status: "confirmed", period_type: "home_base", trip_purpose: null, confidence: 1, explanation: "Manually confirmed home base.", evidence: {}, location: { id: "demo-location-cr", name: "Costa Rica", country_code: "CR", country_name: "Costa Rica", default_currency: "CRC" } },
];

const demoPlan = [
  { month: "2026-03", housing: 780, groceries: 350, dining: 170, transport: 140, travel: 0, subscriptions: 70, insurance: 0, uncategorized: 130 },
  { month: "2026-04", housing: 780, groceries: 380, dining: 190, transport: 160, travel: 50, subscriptions: 70, insurance: 120, uncategorized: 62 },
  { month: "2026-05", housing: 780, groceries: 400, dining: 210, transport: 170, travel: 0, subscriptions: 70, insurance: 80, uncategorized: 18 },
  { month: "2026-06", housing: 780, groceries: 420, dining: 220, transport: 180, travel: 250, subscriptions: 70, insurance: 120, uncategorized: 14 },
  { month: "2026-07", housing: 780, groceries: 450, dining: 240, transport: 190, travel: 200, subscriptions: 70, insurance: 140, uncategorized: 336 },
  { month: "2026-08", housing: 780, groceries: 500, dining: 270, transport: 210, travel: 200, subscriptions: 70, insurance: 140, uncategorized: 4.67 },
];

const categoryForDemo = (key: string) => demoCategories.find((category) => category.id === `demo-${key}`) ?? null;
const demoExpenseTransactions: WorkspaceTransaction[] = demoPlan.flatMap((row) => Object.entries(row).flatMap(([key, amount], index) => {
  if (key === "month" || typeof amount !== "number" || amount === 0) return [];
  const location = row.month <= "2026-04" ? demoLocations[0] : demoLocations[1];
  const categoryKey = key === "insurance" ? "insurance" : key === "uncategorized" ? null : key;
  const category = categoryKey ? categoryForDemo(categoryKey) : null;
  const isFlight = key === "travel" && row.month === "2026-06";
  const effectiveCategory = isFlight ? categoryForDemo("flights") : category;
  const description = key === "insurance" ? "Hospital Alemán" : isFlight ? "Example airline ticket" : key === "subscriptions" ? "Example annual software plan" : key === "uncategorized" ? `Unidentified payment ${row.month}` : `Example ${key} provider`;
  const localRate = location.location.country_code === "MX" ? 18 : 520;
  return [{ id: `demo-${row.month}-${key}`, occurred_at: `${row.month}-${String(Math.min(4 + index * 3, 26)).padStart(2, "0")}T00:00:00.000Z`, posted_at: null, description, amount: String(-amount), currency: "USD", original_amount: String(amount * localRate), original_currency: location.location.default_currency, kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", fee_currency: null, category_id: effectiveCategory?.id ?? null, category: effectiveCategory ? { name: effectiveCategory.name, life_area: effectiveCategory.life_area, is_essential: effectiveCategory.is_essential, is_extraordinary: effectiveCategory.is_extraordinary, color: effectiveCategory.color } : null, account: { name: "Example card", institution: "deel" }, metadata: { merchantCountry: location.location.country_code }, merchant_name: description, merchant_key: description.toLocaleLowerCase(), merchant_country: location.location.country_code, merchant_city: null, beneficiary_scope: index % 7 === 0 ? "shared" : "personal", reimbursement_status: "none", location_period: location, expense_splits: [] }];
}));

const demoInsuranceIds = demoExpenseTransactions.filter((transaction) => transaction.merchant_key === "hospital alemán").map((transaction) => transaction.id);

export const demoWorkspace: WorkspaceData = {
  mode: "demo" as const,
  asOfDate: "2026-09-13",
  totals: [
    { currency: "USD", income: 6000, spending: 11824.42, internalMovement: 4397.75, fees: 9.75 },
  ],
  accounts: [
    { id: "demo-deel", institution: "deel", name: "Deel USD account", currency: "USD", last_imported_at: "2026-08-29T00:00:00.000Z", last_transaction_at: "2026-08-29T00:00:00.000Z", coverage_start: "2026-01-01", coverage_end: "2026-08-29", coverage_gaps: [], overlapping_periods: 7 },
    { id: "demo-arq", institution: "arq", name: "ARQ ARS wallet", currency: "ARS", last_imported_at: "2026-08-31T00:00:00.000Z", last_transaction_at: "2026-08-31T00:00:00.000Z", coverage_start: "2025-01-01", coverage_end: "2026-08-31", coverage_gaps: [], overlapping_periods: 0 },
    { id: "demo-brubank", institution: "brubank", name: "Brubank ARS savings", currency: "ARS", last_imported_at: "2026-08-31T00:00:00.000Z", last_transaction_at: "2026-08-31T00:00:00.000Z", coverage_start: "2025-01-01", coverage_end: "2026-08-31", coverage_gaps: [], overlapping_periods: 0 },
  ],
  transactions: [
    { id: "demo-1", occurred_at: "2026-08-29T00:00:00.000Z", description: "Example client payment", amount: "6000", currency: "USD", kind: "income", status: "posted", excluded_from_totals: false, fee_amount: "0", category_id: null, category: null, account: { name: "Deel USD account", institution: "deel" } },
    { id: "demo-2", occurred_at: "2026-08-22T00:00:00.000Z", description: "Withdrawal to ARQ", amount: "-1300", currency: "USD", kind: "transfer", status: "posted", excluded_from_totals: true, fee_amount: "9.75", category_id: null, category: null, account: { name: "Deel USD account", institution: "deel" } },
    ...demoExpenseTransactions,
  ],
  questions: [
    { id: "demo-q1", prompt: "Is this incoming ARQ movement a transfer or income?", question_type: "classification", created_at: "2026-08-31T00:00:00.000Z", transaction_id: "demo-4", context: {} },
    { id: "demo-q2", prompt: "How was this cash withdrawal used?", question_type: "cash_withdrawal", created_at: "2026-08-17T00:00:00.000Z", transaction_id: "demo-5", context: {} },
  ],
  transferChains: [
    { id: "demo-chain-1", status: "suggested", confidence: 0.96, source_amount: "1290.25", source_currency: "USD", fee_amount: "9.75", notes: "Deel → ARQ → Brubank", member_count: 4, members: [] },
  ],
  imports: [],
  categories: demoCategories,
  spending: [{ currency: "USD", total: 11824.42, averagePerMonth: 1970.74, personal: 11524.42, household: 300, essential: 8830, flexible: 2994.42, uncategorized: 564.67, uncategorizedCount: 6, months: [{ month: "2026-03", amount: 1640 }, { month: "2026-04", amount: 1812 }, { month: "2026-05", amount: 1728 }, { month: "2026-06", amount: 2054 }, { month: "2026-07", amount: 2406 }, { month: "2026-08", amount: 2184.42 }], categories: [{ name: "Housing", lifeArea: "Home", color: "#7a6c5d", amount: 4680, essential: true }, { name: "Groceries", lifeArea: "Food", color: "#52796f", amount: 2500, essential: true }, { name: "Dining out", lifeArea: "Food", color: "#d37a3d", amount: 1300, essential: false }, { name: "Transport", lifeArea: "Mobility", color: "#496f5d", amount: 1050, essential: true }, { name: "Travel", lifeArea: "Travel", color: "#4d7298", amount: 700, essential: false }, { name: "Health insurance", lifeArea: "Health", color: "#326a60", amount: 600, essential: true }, { name: "Uncategorized", lifeArea: "Needs review", color: "#a9a39a", amount: 564.67, essential: false }, { name: "Subscriptions & software", lifeArea: "Digital", color: "#6c63a8", amount: 420, essential: false }, { name: "Bank fees", lifeArea: "Financial", color: "#9c6644", amount: 9.75, essential: false }] }],
  investments: [],
  investmentTransactions: [],
  portfolioSnapshots: [],
  people: [],
  locationPeriods: demoLocations,
  recurringObligations: [{ id: "demo-recurring-insurance", provider_name: "Hospital Alemán", merchant_key: "hospital alemán", frequency: "monthly", status: "active", country_code: "AR", expected_amount: "120", currency: "USD", next_expected_on: "2026-09-05", category: { name: "Health insurance", parent: { name: "Health" } }, transaction_ids: demoInsuranceIds }],
  insights: [{ key: "demo-uncategorized", title: "Six payments still need a category", body: "Open the supporting transactions and teach Empower what they represent.", priority: 90, transactionIds: demoExpenseTransactions.filter((transaction) => !transaction.category_id).map((transaction) => transaction.id) }],
  dataQuality: { score: 82, uncategorized: 6, missingFx: 0, unansweredQuestions: 2, uncertainLocations: 0, recurringUnidentified: 0, uncertainCoverage: 0 },
  suggestedQuestions: [],
  exchangeRatePreference: null,
};
