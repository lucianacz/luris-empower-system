import { normalizeStatus, parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const headers = ["Date", "Description", "Amount", "Currency", "Status", "Transaction ID"];

export class PayoneerCsvAdapter implements ImportAdapter {
  readonly provider = "payoneer" as const;
  readonly name = "PayoneerCsvAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const present = new Set((input.headers ?? []).map((header) => header.trim()));
    const headerScore = headers.filter((header) => present.has(header)).length / headers.length;
    const descriptions = (input.csvRows ?? []).slice(0, 40).map((row) => row.Description || "").join(" ");
    const contentScore = /Card charge|ATM withdrawal|Payment from|Maintenance fee/i.test(descriptions) ? 0.3 : 0;
    if (headerScore < 0.66 || contentScore === 0) return null;
    return {
      provider: this.provider,
      confidence: Math.min(0.96, 0.55 + headerScore * 0.2 + contentScore),
      reasons: ["Matched Payoneer report columns and transaction descriptions"],
      format: "csv",
      variant: "activity-report",
    };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    return (input.csvRows ?? []).flatMap((row) => {
      const occurredAt = parseDate(row.Date);
      if (!occurredAt) return [];
      const description = row.Description || "Payoneer transaction";
      const lower = description.toLowerCase();
      const status = normalizeStatus(row.Status);
      let kind: TransactionKind = "unknown";
      const warnings: string[] = [];
      if (lower.startsWith("payment from")) kind = "income";
      else if (lower.startsWith("card charge")) kind = "expense";
      else if (/annual account fee|maintenance fee/.test(lower)) kind = "fee";
      else if (lower.startsWith("atm")) {
        kind = "cash_withdrawal";
      } else warnings.push("Payoneer transaction needs classification.");

      return [createTransaction({
        provider: "payoneer",
        sourceId: row["Transaction ID"] || row["Transaction ID  "] || null,
        occurredAt,
        description,
        amount: parseAmount(row.Amount),
        currency: row.Currency || "USD",
        status,
        kind,
        warnings,
      })];
    });
  }
}
