export const providers = ["deel", "arq", "brubank", "payoneer", "alpaca", "generic"] as const;

export type Provider = (typeof providers)[number];
export type SourceFormat = "csv" | "pdf" | "xlsx";
export type TransactionStatus = "posted" | "pending" | "failed" | "reversed";
export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "fee"
  | "tax"
  | "refund"
  | "cash_withdrawal"
  | "investment_purchase"
  | "investment_sale"
  | "investment_income"
  | "unknown";

export type ColumnRole =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "currency"
  | "status"
  | "externalId"
  | "type";

export type ColumnMapping = Partial<Record<ColumnRole, string>>;

export interface NormalizedTransaction {
  sourceId: string | null;
  occurredAt: string;
  postedAt: string | null;
  description: string;
  amount: string;
  currency: string;
  originalAmount: string | null;
  originalCurrency: string | null;
  feeAmount: string;
  feeCurrency: string | null;
  status: TransactionStatus;
  kind: TransactionKind;
  excludedFromTotals: boolean;
  fingerprint: string;
  metadata: Record<string, string | number | boolean | null>;
  warnings: string[];
}

export interface DetectionResult {
  provider: Provider;
  confidence: number;
  reasons: string[];
  format: SourceFormat;
  variant?: string;
}

export interface ImportSummary {
  totalRows: number;
  readyRows: number;
  warningRows: number;
  unresolvedRows: number;
  failedRows: number;
  currencies: string[];
  dateFrom: string | null;
  dateTo: string | null;
  accountLabel: string;
}

export interface ImportPreview {
  fileName: string;
  checksum: string;
  detection: DetectionResult;
  headers: string[];
  suggestedMapping: ColumnMapping;
  requiresMapping: boolean;
  transactions: NormalizedTransaction[];
  warnings: string[];
  summary: ImportSummary;
  investmentStatement?: InvestmentStatementPreview;
}

export interface InvestmentStatementPreview {
  accountLabel: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  cashAvailable: number;
  totalMarketValue: number;
  positions: Array<{ symbol: string; name: string; assetType: string; quantity: number; marketPrice: number; currentValue: number; costBasis: number; unrealizedProfitLoss: number }>;
  transactions: Array<{ occurredAt: string; transactionType: "purchase" | "sale" | "deposit" | "withdrawal" | "dividend" | "interest" | "fee" | "tax" | "correction"; symbol: string | null; quantity: number | null; unitPrice: number | null; grossAmount: number; feeAmount: number; description: string }>;
  yearToDate: { contributions: number; withdrawals: number; dividends: number; interest: number; fees: number; taxes: number; realizedProfitLoss: number };
}

export interface AdapterInput {
  fileName: string;
  format: SourceFormat;
  csvRows?: Record<string, string>[];
  headers?: string[];
  pdfLines?: string[];
  mapping?: ColumnMapping;
}

export interface ImportAdapter {
  readonly provider: Provider;
  readonly name: string;
  detect(input: AdapterInput): DetectionResult | null;
  parse(input: AdapterInput): NormalizedTransaction[];
  suggestMapping?(headers: string[]): ColumnMapping;
}
