import { parseAmount, parseDate } from "../normalize";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const transactionLine = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+([+\-])\s*([\d.,]+)\s+([A-Z]{3,5})\s+(.+)$/i;
const digitalTransactionLine = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+([+\-])\s*([\d.,]+)\s+(USDc|USD|ARS|MXN|CRC|N\/A)\s+(?:([+\-])\s*([\d.,]+)|N\/A)\s+(.+)$/i;
const monthStart = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}\b/i;

export class ArqPdfAdapter implements ImportAdapter {
  readonly provider = "arq" as const;
  readonly name = "ArqPdfAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "pdf") return null;
    const text = (input.pdfLines ?? []).join(" ");
    if (!/Detalle de Transacciones/i.test(text)) return null;
    if (/D[oó]lares digitales Estado de Cuenta/i.test(text)) return { provider: this.provider, confidence: 0.99, reasons: ["Matched ARQ digital-dollar statement layout"], format: "pdf", variant: "usd-statement" };
    if (!/ARS Estado de Cuenta/i.test(text)) return null;
    return { provider: this.provider, confidence: 0.98, reasons: ["Matched ARQ/GARPA peso statement layout"], format: "pdf", variant: "ars-statement" };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    const lines = input.pdfLines ?? [];
    const year = Number(lines.join(" ").match(/(?:Fecha de inicio|Fecha de fin|Period|Duraci[oó]n)[^\d]*(?:\d{1,2}\s+)?[A-Za-z]+\s+(20\d{2})/i)?.[1] ?? input.fileName.match(/20\d{2}/)?.[0]);
    if (this.detect(input)?.variant === "usd-statement") return parseDigitalDollarTransactions(lines, year);
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

function parseDigitalDollarTransactions(lines: string[], year: number): NormalizedTransaction[] {
  return normalizeDigitalLines(lines).flatMap(({ line, index }) => {
    const match = line.match(digitalTransactionLine);
    if (!match) return [];
    const occurredAt = parseDate(`${match[1]} ${match[2]}`, year);
    if (!occurredAt) return [];
    const sourceType = match[3].trim();
    const amount = parseAmount(`${match[4]}${match[5]}`, "auto");
    const localCurrency = match[6].toUpperCase().replace("USDC", "USD");
    const localAmount = match[7] && match[8] ? parseAmount(`${match[7]}${match[8]}`, "auto") : null;
    const description = match[9].trim();
    const lowerType = sourceType.toLocaleLowerCase();
    let kind: TransactionKind = "unknown";
    const warnings: string[] = [];

    if (/comisi[oó]n/.test(lowerType)) kind = "fee";
    else if (/recarga a inversiones|cuenta remunerada/.test(lowerType)) kind = "investment_purchase";
    else if (/liquidaci[oó]n cr[eé]dito/.test(lowerType)) kind = "transfer";
    else if (/compra usdc/.test(lowerType) || /venta usdc por ars/.test(lowerType)) kind = "transfer";
    else if (/venta usdc/.test(lowerType)) kind = /luciana\s+czikk|de una cuenta tuya/i.test(description) ? "transfer" : "expense";
    else warnings.push("ARQ digital-dollar transaction type needs review.");

    const exchangeRateToUsd = localAmount && !localAmount.isZero() && localCurrency !== "USD" && localCurrency !== "N/A"
      ? amount.abs().dividedBy(localAmount.abs()).toDecimalPlaces(12).toFixed()
      : null;

    return [createTransaction({
      provider: "arq",
      sourceId: `arq-usd-${occurredAt.slice(0, 10)}-${index}`,
      occurredAt,
      description,
      amount,
      currency: "USD",
      originalAmount: localAmount && localCurrency !== "USD" && localCurrency !== "N/A" ? localAmount : null,
      originalCurrency: localAmount && localCurrency !== "USD" && localCurrency !== "N/A" ? localCurrency : null,
      kind,
      metadata: {
        sourceType,
        localEquivalentAmount: localAmount?.toFixed() ?? null,
        localEquivalentCurrency: localCurrency === "N/A" ? null : localCurrency,
        exchangeRateToUsd,
        exchangeRateSource: exchangeRateToUsd ? "ARQ personal conversion" : null,
      },
      warnings,
    })];
  });
}

function normalizeDigitalLines(lines: string[]) {
  return lines.flatMap((rawLine, index) => {
    if (!monthStart.test(rawLine)) return [];
    let line = rawLine;
    const datePrefix = line.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2})\s+(.+)$/i);
    if (!datePrefix) return [];

    if (/^[+\-]\s*[\d.,]+\s+/i.test(datePrefix[2])) {
      const before = lines[index - 1]?.trim() ?? "";
      const after = lines[index + 1]?.trim() ?? "";
      const wrappedType = /venta usdc por/i.test(before) && /^ARS$/i.test(after)
        ? `${before} ${after}`
        : /recarga a inversiones o/i.test(before) && /^cuenta remunerada$/i.test(after)
          ? `${before} ${after}`
          : before;
      line = `${datePrefix[1]} ${wrappedType} ${datePrefix[2]}`;
    }

    if (!digitalTransactionLine.test(line)) {
      const after = lines[index + 1]?.trim() ?? "";
      if (after && !monthStart.test(after) && !/^(?:ARS|Cuenta Remunerada|Si necesita ayuda|P[aá]gina)/i.test(after)) line = `${line} ${after}`;
    }
    return [{ line, index }];
  });
}
