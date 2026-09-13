import { parseAmount, parseDate } from "../normalize";
import type { AdapterInput, ColumnMapping, DetectionResult, ImportAdapter, NormalizedTransaction, TransactionKind } from "../types";
import { createTransaction } from "./helpers";

const aliases: Record<keyof ColumnMapping, RegExp> = {
  date: /^(date|fecha|transaction date|posted at|date requested)$/i,
  description: /^(description|descripci[oó]n|merchant|details?|concepto)$/i,
  amount: /^(amount|monto|importe|transaction amount)$/i,
  debit: /^(debit|d[eé]bito|withdrawal)$/i,
  credit: /^(credit|cr[eé]dito|deposit)$/i,
  currency: /^(currency|moneda|ccy)$/i,
  status: /^(status|estado|transaction status)$/i,
  externalId: /^(id|transaction id|reference|#ref|external id)$/i,
  type: /^(type|tipo|transaction type)$/i,
};

export class GenericCsvAdapter implements ImportAdapter {
  readonly provider = "generic" as const;
  readonly name = "GenericCsvAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const mapping = this.suggestMapping(input.headers ?? []);
    const score = [mapping.date, mapping.description, mapping.amount || mapping.debit || mapping.credit].filter(Boolean).length / 3;
    return {
      provider: this.provider,
      confidence: Math.max(0.2, score * 0.62),
      reasons: score === 1 ? ["Common transaction columns found"] : ["Use column mapping to finish this import"],
      format: "csv",
    };
  }

  suggestMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    for (const [role, matcher] of Object.entries(aliases) as Array<[keyof ColumnMapping, RegExp]>) {
      const header = headers.find((candidate) => matcher.test(candidate.trim()));
      if (header) mapping[role] = header;
    }
    return mapping;
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    const mapping = { ...this.suggestMapping(input.headers ?? []), ...(input.mapping ?? {}) };
    if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) return [];

    return (input.csvRows ?? []).flatMap((row) => {
      const occurredAt = parseDate(row[mapping.date!]);
      if (!occurredAt) return [];
      const amountColumn = mapping.amount;
      const debitColumn = mapping.debit;
      const creditColumn = mapping.credit;
      const amount = amountColumn
        ? parseAmount(row[amountColumn])
        : parseAmount(creditColumn ? row[creditColumn] : "").minus(parseAmount(debitColumn ? row[debitColumn] : ""));
      const rawType = mapping.type ? row[mapping.type].toLowerCase() : "";
      let kind: TransactionKind = amount.isPositive() ? "income" : "expense";
      if (/transfer|withdraw|retiro|deposit/.test(rawType)) kind = "transfer";
      if (/fee|comisi[oó]n/.test(rawType)) kind = "fee";
      if (/refund|reembolso/.test(rawType)) kind = "refund";

      return [createTransaction({
        provider: "generic",
        sourceId: mapping.externalId ? row[mapping.externalId] : null,
        occurredAt,
        description: row[mapping.description!],
        amount,
        currency: mapping.currency ? row[mapping.currency] : "USD",
        status: mapping.status && /pending|pendiente/i.test(row[mapping.status] ?? "") ? "pending" : "posted",
        kind,
        warnings: mapping.currency ? [] : ["Currency was not present; USD was used as a temporary default."],
      })];
    });
  }
}
