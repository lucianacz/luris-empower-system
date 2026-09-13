import { parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const movementLine = /^(\d{2}-\d{2}-\d{2})\s+(\d{5,})\s+(.+?)\s+\$?\s*([\d.]+,\d{2}|-)\s+\$?\s*([\d.]+,\d{2}|-)\s+\$?\s*([\d.]+,\d{2})$/;

export class BrubankPdfAdapter implements ImportAdapter {
  readonly provider = "brubank" as const;
  readonly name = "BrubankPdfAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "pdf") return null;
    const text = (input.pdfLines ?? []).join(" ");
    if (!/brubank/i.test(text) || !/Movimientos/i.test(text) || !/#Ref/i.test(text)) return null;
    return { provider: this.provider, confidence: 0.99, reasons: ["Matched Brubank savings statement layout"], format: "pdf", variant: "account-statement" };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    return (input.pdfLines ?? []).flatMap((line) => {
      const match = line.match(movementLine);
      if (!match) return [];
      const occurredAt = parseDate(match[1]);
      if (!occurredAt) return [];
      const description = match[3].trim();
      const debit = parseAmount(match[4], "comma");
      const credit = parseAmount(match[5], "comma");
      const amount = credit.minus(debit);
      const transferDescription = /transferencia\s+(?:a|de)\b/i.test(description);
      const kind: TransactionKind = transferDescription ? "unknown" : amount.isPositive() ? "unknown" : "expense";
      const warnings: string[] = [];
      if (kind === "unknown") warnings.push(amount.isPositive() ? "Incoming Brubank movement needs confirmation before it counts as income." : "Outgoing transfer needs confirmation before it counts as spending.");

      return [createTransaction({
        provider: "brubank",
        sourceId: match[2],
        occurredAt,
        description,
        amount,
        currency: "ARS",
        kind,
        metadata: { runningBalance: parseAmount(match[6], "comma").toFixed() },
        warnings,
      })];
    });
  }
}
