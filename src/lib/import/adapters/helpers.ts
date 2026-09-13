import Decimal from "decimal.js";
import {
  cleanDescription,
  decimalString,
  shouldExclude,
  stableFingerprint,
} from "../normalize";
import type { NormalizedTransaction, TransactionKind, TransactionStatus } from "../types";

interface TransactionInput {
  provider: string;
  sourceId?: string | null;
  occurredAt: string;
  postedAt?: string | null;
  description: string;
  amount: Decimal.Value;
  currency: string;
  originalAmount?: Decimal.Value | null;
  originalCurrency?: string | null;
  feeAmount?: Decimal.Value;
  feeCurrency?: string | null;
  status?: TransactionStatus;
  kind: TransactionKind;
  excludedFromTotals?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  warnings?: string[];
}

export function createTransaction(input: TransactionInput): NormalizedTransaction {
  const description = cleanDescription(input.description);
  const amount = decimalString(input.amount);
  const feeAmount = decimalString(input.feeAmount ?? 0);
  const status = input.status ?? "posted";
  const currency = input.currency.trim().toUpperCase() || "USD";
  const sourceId = input.sourceId?.trim() || null;

  return {
    sourceId,
    occurredAt: input.occurredAt,
    postedAt: input.postedAt ?? null,
    description,
    amount,
    currency,
    originalAmount: input.originalAmount == null ? null : decimalString(input.originalAmount),
    originalCurrency: input.originalCurrency?.trim().toUpperCase() || null,
    feeAmount,
    feeCurrency: input.feeCurrency?.trim().toUpperCase() || null,
    status,
    kind: input.kind,
    excludedFromTotals: input.excludedFromTotals ?? shouldExclude(input.kind, status),
    fingerprint: stableFingerprint([
      input.provider,
      sourceId,
      input.occurredAt.slice(0, 10),
      description,
      amount,
      currency,
    ]),
    metadata: input.metadata ?? {},
    warnings: input.warnings ?? [],
  };
}
