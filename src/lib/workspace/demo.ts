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
  occurred_at: string;
  description: string;
  amount: string;
  currency: string;
  kind: string;
  status: string;
  excluded_from_totals: boolean;
  fee_amount: string;
  category_id: string | null;
  category: { name: string; life_area: string; is_essential: boolean; color: string | null } | null;
  account: { name: string; institution: string } | null;
  expense_splits?: Array<{ id: string; split_kind: string; label: string; percentage: string | null; amount: string | null }>;
}

export interface WorkspaceQuestion {
  id: string;
  prompt: string;
  question_type: string;
  created_at: string;
  transaction_id: string | null;
  context: Record<string, unknown>;
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

export interface WorkspaceData {
  mode: "demo" | "signed-out" | "live";
  totals: WorkspaceTotal[];
  accounts: WorkspaceAccount[];
  transactions: WorkspaceTransaction[];
  questions: WorkspaceQuestion[];
  transferChains: WorkspaceTransferChain[];
  imports: Array<{ id: string; account_id?: string | null; file_name: string; status: string; row_count: number; imported_count: number; duplicate_count: number; unresolved_count: number; coverage_start?: string | null; coverage_end?: string | null; confirmed_at: string | null; created_at: string }>;
  categories: WorkspaceCategory[];
  spending: SpendingCurrencySummary[];
  investments: WorkspaceInvestment[];
}

export const demoWorkspace: WorkspaceData = {
  mode: "demo" as const,
  totals: [
    { currency: "USD", income: 6000, spending: 11824.42, internalMovement: 4397.75, fees: 25.75 },
  ],
  accounts: [
    { id: "demo-deel", institution: "deel", name: "Deel USD account", currency: "USD", last_imported_at: "2026-08-29T00:00:00.000Z", last_transaction_at: "2026-08-29T00:00:00.000Z", coverage_start: "2026-01-01", coverage_end: "2026-08-29", coverage_gaps: [], overlapping_periods: 7 },
    { id: "demo-arq", institution: "arq", name: "ARQ ARS wallet", currency: "ARS", last_imported_at: "2026-08-31T00:00:00.000Z", last_transaction_at: "2026-08-31T00:00:00.000Z", coverage_start: "2025-01-01", coverage_end: "2026-08-31", coverage_gaps: [], overlapping_periods: 0 },
    { id: "demo-brubank", institution: "brubank", name: "Brubank ARS savings", currency: "ARS", last_imported_at: "2026-08-31T00:00:00.000Z", last_transaction_at: "2026-08-31T00:00:00.000Z", coverage_start: "2025-01-01", coverage_end: "2026-08-31", coverage_gaps: [], overlapping_periods: 0 },
  ],
  transactions: [
    { id: "demo-1", occurred_at: "2026-08-29T00:00:00.000Z", description: "Example client payment", amount: "6000", currency: "USD", kind: "income", status: "posted", excluded_from_totals: false, fee_amount: "0", category_id: null, category: null, account: { name: "Deel USD account", institution: "deel" } },
    { id: "demo-2", occurred_at: "2026-08-22T00:00:00.000Z", description: "Withdrawal to ARQ", amount: "-1300", currency: "USD", kind: "transfer", status: "posted", excluded_from_totals: true, fee_amount: "9.75", category_id: null, category: null, account: { name: "Deel USD account", institution: "deel" } },
    { id: "demo-3", occurred_at: "2026-08-20T00:00:00.000Z", description: "Example grocery market", amount: "-84.2", currency: "USD", kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", category_id: "demo-groceries", category: { name: "Groceries", life_area: "Food", is_essential: true, color: "#52796f" }, account: { name: "Deel USD account", institution: "deel" } },
  ],
  questions: [
    { id: "demo-q1", prompt: "Is this incoming ARQ movement a transfer or income?", question_type: "classification", created_at: "2026-08-31T00:00:00.000Z", transaction_id: "demo-4", context: {} },
    { id: "demo-q2", prompt: "How was this cash withdrawal used?", question_type: "cash_withdrawal", created_at: "2026-08-17T00:00:00.000Z", transaction_id: "demo-5", context: {} },
  ],
  transferChains: [
    { id: "demo-chain-1", status: "suggested", confidence: 0.96, source_amount: "1290.25", source_currency: "USD", fee_amount: "9.75", notes: "Deel → ARQ → Brubank", member_count: 4, members: [] },
  ],
  imports: [],
  categories: [{ id: "demo-groceries", name: "Groceries", kind: "expense", color: "#52796f", icon: null, parent_id: null, life_area: "Food", is_essential: true }],
  spending: [{ currency: "USD", total: 11824.42, averagePerMonth: 1970.74, personal: 9824.42, household: 2000, essential: 8230, flexible: 3594.42, uncategorized: 1174.42, uncategorizedCount: 20, months: [{ month: "2026-03", amount: 1640 }, { month: "2026-04", amount: 1812 }, { month: "2026-05", amount: 1728 }, { month: "2026-06", amount: 2054 }, { month: "2026-07", amount: 2406 }, { month: "2026-08", amount: 2184.42 }], categories: [{ name: "Housing", lifeArea: "Home", color: "#7a6c5d", amount: 4680, essential: true }, { name: "Groceries", lifeArea: "Food", color: "#52796f", amount: 2500, essential: true }, { name: "Dining out", lifeArea: "Food", color: "#d37a3d", amount: 1300, essential: false }, { name: "Uncategorized", lifeArea: "Needs review", color: "#a9a39a", amount: 1174.42, essential: false }, { name: "Transport", lifeArea: "Mobility", color: "#496f5d", amount: 1050, essential: true }, { name: "Travel", lifeArea: "Travel", color: "#4d7298", amount: 700, essential: false }, { name: "Subscriptions & software", lifeArea: "Digital", color: "#6c63a8", amount: 420, essential: false }] }],
  investments: [],
};
