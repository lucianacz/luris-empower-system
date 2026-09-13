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
