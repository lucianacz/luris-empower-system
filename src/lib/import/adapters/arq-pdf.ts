import { parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const transactionLine = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+([+\-])\s*([\d.,]+)\s+([A-Z]{3,5})\s+(.+)$/i;

export class ArqPdfAdapter implements ImportAdapter {
  readonly provider = "arq" as const;
  readonly name = "ArqPdfAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "pdf") return null;
    const text = (input.pdfLines ?? []).join(" ");
    if (!/ARS Estado de Cuenta/i.test(text) || !/Detalle de Transacciones/i.test(text)) return null;
    return { provider: this.provider, confidence: 0.98, reasons: ["Matched ARQ/GARPA statement layout"], format: "pdf", variant: "ars-statement" };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    const lines = input.pdfLines ?? [];
    const year = Number(lines.join(" ").match(/(?:Fecha de inicio|Fecha de fin|Period|Duraci[oó]n)[^\d]*(?:\d{1,2}\s+)?[A-Za-z]+\s+(20\d{2})/i)?.[1] ?? input.fileName.match(/20\d{2}/)?.[0]);
    return lines.flatMap((line, index) => {
      const match = line.match(transactionLine);
      if (!match) return [];
      const occurredAt = parseDate(`${match[1]} ${match[2]}`, year);
      if (!occurredAt) return [];
      const sourceType = match[3].trim();
      const description = match[7].trim();
      const amount = parseAmount(`${match[4]}${match[5]}`, "auto");
      const lowerType = sourceType.toLowerCase();
      const internalDolarApp = /dolarapp mexico/i.test(description);
      let kind: TransactionKind = "unknown";
      const warnings: string[] = [];
      if (/pago con tarjeta|pago qr/.test(lowerType)) kind = "expense";
      else if (/retiro/.test(lowerType)) {
        kind = "transfer";
        warnings.push("Withdrawal will be matched to another owned account or sent to Questions.");
      } else if (internalDolarApp) kind = "transfer";
      else if (/recarga|recibido/.test(lowerType)) {
        kind = "unknown";
        warnings.push("Incoming ARQ movement needs confirmation before it counts as income.");
      }

      return [createTransaction({
        provider: "arq",
        sourceId: `arq-${occurredAt.slice(0, 10)}-${index}`,
        occurredAt,
        description,
        amount,
        currency: match[6],
        kind,
        metadata: { sourceType },
        warnings,
      })];
    });
  }
}
