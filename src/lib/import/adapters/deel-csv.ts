import Decimal from "decimal.js";
import { decimalString, normalizeStatus, parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const balanceHeaders = ["ID", "Date Requested", "Transaction Status", "Transaction Type", "Currency", "Transaction Amount"];
const cardHeaders = ["originalCurrency", "originalAmount", "USDAmount", "date", "merchantName", "externalTxId"];

export class DeelCsvAdapter implements ImportAdapter {
  readonly provider = "deel" as const;
  readonly name = "DeelCsvAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const headers = new Set(input.headers ?? []);
    const balanceScore = balanceHeaders.filter((header) => headers.has(header)).length;
    const cardScore = cardHeaders.filter((header) => headers.has(header)).length;
    const score = Math.max(balanceScore / balanceHeaders.length, cardScore / cardHeaders.length);
    if (score < 0.5) return null;
    const variant = cardScore > balanceScore ? "card" : "balance";
    return {
      provider: this.provider,
      confidence: Math.min(0.99, 0.55 + score * 0.44),
      reasons: [`Matched ${variant === "card" ? "Deel card" : "Deel balance"} export columns`],
      format: "csv",
      variant,
    };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    const detection = this.detect(input);
    if (!detection) return [];
    return detection.variant === "card" ? this.parseCard(input.csvRows ?? []) : this.parseBalance(input.csvRows ?? []);
  }

  private parseBalance(rows: Record<string, string>[]): NormalizedTransaction[] {
    return rows.flatMap((row) => {
      const occurredAt = parseDate(row["Date Requested"]);
      if (!occurredAt) return [];
      const status = normalizeStatus(row["Transaction Status"]);
      const sourceType = row["Transaction Type"].toLowerCase();
      const amount = parseAmount(row["Transaction Amount"]);
      const transferred = parseAmount(row["Amount Transferred"]);
      // Deel exports the same provider charge under both singular and plural
      // column names in some reports. Treat them as aliases, then add genuinely
      // separate cross-border and exchange-rate charges.
      const providerFee = Decimal.max(parseAmount(row["Provider Fee"]).abs(), parseAmount(row["Provider Fees"]).abs());
      const itemizedFees = providerFee.plus(parseAmount(row["Cross Border Fees"]).abs()).plus(parseAmount(row["Exchange Rate Fees"]).abs());
      const inferredFee = amount.isNegative() && transferred.greaterThan(0) ? Decimal.max(amount.abs().minus(transferred), 0) : new Decimal(0);
      const fee = Decimal.max(itemizedFees, inferredFee);
      const kind: TransactionKind = sourceType.includes("client_payment") ? "income" : sourceType.includes("withdraw") ? "transfer" : sourceType.includes("fee") ? "fee" : "unknown";
      const method = row["Withdraw Method Custom Name"] || row["Withdraw Method"];
      const accountHolder = row["Withdraw Account Holder Name"]?.trim() || null;
      const warnings = status === "failed" ? ["Failed transaction retained for history and excluded from totals."] : kind === "unknown" ? ["Transaction type needs review."] : [];

      return [createTransaction({
        provider: "deel",
        sourceId: row.ID,
        occurredAt,
        description: kind === "income" ? row.Client || row["Contract Name"] || "Client payment" : method ? `Withdrawal to ${method}${accountHolder ? ` · ${accountHolder}` : ""}` : "Deel balance movement",
        amount,
        currency: row.Currency || "USD",
        originalAmount: transferred.isZero() ? null : transferred,
        originalCurrency: row["Currency Transferred"] || null,
        feeAmount: fee,
        feeCurrency: row.Currency || null,
        status,
        kind,
        metadata: {
          withdrawMethod: row["Withdraw Method"] || null,
          withdrawMethodCustomName: row["Withdraw Method Custom Name"] || null,
          withdrawAccountHolderName: accountHolder,
          client: row.Client || null,
          contractName: row["Contract Name"] || null,
          exchangeRate: row["Exchange Rate"] || null,
          traceId: row["Trace ID"] || null,
        },
        warnings,
      })];
    });
  }

  private parseCard(rows: Record<string, string>[]): NormalizedTransaction[] {
    return rows.flatMap((row) => {
      const occurredAt = parseDate(row.date);
      if (!occurredAt) return [];
      const status = normalizeStatus(row.status);
      const sourceType = row.type.toUpperCase();
      let amount = parseAmount(row.accountAmount);
      const usdAmount = parseAmount(row.USDAmount);
      if (!row.accountAmount && !usdAmount.isZero()) amount = sourceType === "REFUND" || sourceType === "DEPOSIT" ? usdAmount.abs() : usdAmount.abs().negated();
      const kind: TransactionKind = sourceType === "POS_TX" ? "expense" : sourceType === "REFUND" ? "refund" : sourceType === "FEE" ? "fee" : sourceType === "WITHDRAWAL" || sourceType === "DEPOSIT" ? "transfer" : "unknown";
      const fee = parseAmount(row.exchangeFeeAccountAmount).abs();
      const apiMerchant = readApiMerchant(row.apiTransaction);
      const warnings = status === "failed" ? [row.declineReason || "Declined card transaction retained for history."] : kind === "unknown" ? ["Card transaction type needs review."] : [];

      return [createTransaction({
        provider: "deel",
        sourceId: row.externalTxId || row.externalRootTxId,
        occurredAt,
        description: row.merchantName || row.mccLabel || row["MCC Label"] || sourceType,
        amount,
        currency: row.accountCurrency || "USD",
        originalAmount: parseAmount(row.originalAmount),
        originalCurrency: row.originalCurrency,
        feeAmount: fee,
        feeCurrency: row.accountCurrency || null,
        status,
        kind,
        metadata: {
          externalRootTxId: row.externalRootTxId || null,
          merchantCountry: row.merchantCountry || apiMerchant.country,
          merchantCity: apiMerchant.city,
          merchantState: apiMerchant.state,
          mcc: row.mcc || null,
          mccLabel: row.mccLabel || row["MCC Label"] || null,
          last4: row.last4 || null,
          exchangeRate: row.exchangeRate || null,
          usdAmount: decimalString(usdAmount),
        },
        warnings,
      })];
    });
  }
}

function readApiMerchant(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "null") as { data?: { merchant?: { city?: unknown; state?: unknown; country?: unknown } } } | null;
    const merchant = parsed?.data?.merchant;
    return {
      city: typeof merchant?.city === "string" && merchant.city.trim() ? merchant.city.trim() : null,
      state: typeof merchant?.state === "string" && merchant.state.trim() ? merchant.state.trim() : null,
      country: typeof merchant?.country === "string" && merchant.country.trim() ? merchant.country.trim() : null,
    };
  } catch {
    return { city: null, state: null, country: null };
  }
}
