import Decimal from "decimal.js";
import { normalizeStatus, parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const headers = ["ID", "Status", "Direction", "Created on", "Source name", "Source amount (after fees)", "Target name", "Target amount (after fees)"];
const ownedParty = /\b(?:julian(?:\s+aaron)?\s+stivelman|luciana(?:\s+aaron)?\s+czikk|account holder|deel,?\s+inc\.?|dolarapp|arq|wise)\b/i;

export class WiseCsvAdapter implements ImportAdapter {
  readonly provider = "wise" as const;
  readonly name = "WiseCsvAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const available = new Set(input.headers ?? []);
    const score = headers.filter((header) => available.has(header)).length / headers.length;
    if (score < 0.75) return null;
    return {
      provider: this.provider,
      confidence: Math.min(0.99, 0.62 + score * 0.37),
      reasons: ["Matched Wise transfer-history columns"],
      format: "csv",
      variant: "transfer-history",
    };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    return (input.csvRows ?? []).flatMap((row) => {
      const occurredAt = parseDate(row["Finished on"] || row["Created on"]);
      if (!occurredAt) return [];
      const status = normalizeStatus(row.Status);
      const direction = row.Direction.trim().toUpperCase();
      const sourceAmount = parseAmount(row["Source amount (after fees)"]).abs();
      const targetAmount = parseAmount(row["Target amount (after fees)"]).abs();
      const sourceFee = parseAmount(row["Source fee amount"]).abs();
      const targetFee = parseAmount(row["Target fee amount"]).abs();
      const fee = sourceFee.plus(targetFee);
      const sourceCurrency = row["Source currency"] || row["Source fee currency"] || "USD";
      const targetCurrency = row["Target currency"] || row["Target fee currency"] || sourceCurrency;
      const sourceName = row["Source name"]?.trim() || "Unknown source";
      const targetName = row["Target name"]?.trim() || "Unknown recipient";
      const ownMovement = ownedParty.test(sourceName) && ownedParty.test(targetName);
      let kind: TransactionKind;
      let amount: Decimal;
      let description: string;
      const warnings: string[] = [];

      if (direction === "OUT") {
        amount = sourceAmount.plus(fee).negated();
        description = targetName;
        kind = ownMovement ? "transfer" : "expense";
      } else {
        amount = targetAmount;
        description = sourceName;
        kind = ownMovement ? "transfer" : "unknown";
        if (!ownMovement) warnings.push("Incoming Wise transfer needs confirmation before it counts as income.");
      }

      if (status !== "posted") warnings.length = 0;

      return [createTransaction({
        provider: "wise",
        sourceId: row.ID,
        occurredAt,
        postedAt: parseDate(row["Finished on"]),
        description,
        amount,
        currency: direction === "OUT" ? sourceCurrency : targetCurrency,
        originalAmount: direction === "OUT" && targetCurrency !== sourceCurrency ? targetAmount.negated() : null,
        originalCurrency: direction === "OUT" && targetCurrency !== sourceCurrency ? targetCurrency : null,
        feeAmount: fee,
        feeCurrency: row["Source fee currency"] || row["Target fee currency"] || sourceCurrency,
        status,
        kind,
        metadata: {
          direction,
          sourceName,
          targetName,
          exchangeRate: row["Exchange rate"] || null,
          reference: row.Reference || null,
          category: row.Category || null,
          note: row.Note || null,
          createdBy: row["Created by"] || null,
        },
        warnings,
      })];
    });
  }
}
