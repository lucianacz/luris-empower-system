import Decimal from "decimal.js";
import type { TransactionKind, TransactionStatus } from "./types";

const monthNumbers: Record<string, number> = {
  jan: 0,
  january: 0,
  ene: 0,
  enero: 0,
  feb: 1,
  february: 1,
  febrero: 1,
  mar: 2,
  march: 2,
  marzo: 2,
  apr: 3,
  april: 3,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  june: 5,
  junio: 5,
  jul: 6,
  july: 6,
  julio: 6,
  aug: 7,
  august: 7,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  september: 8,
  septiembre: 8,
  oct: 9,
  october: 9,
  octubre: 9,
  nov: 10,
  november: 10,
  noviembre: 10,
  dec: 11,
  december: 11,
  dic: 11,
  diciembre: 11,
};

export function parseAmount(value: string | number | null | undefined, locale: "auto" | "dot" | "comma" = "auto"): Decimal {
  if (typeof value === "number") return new Decimal(value);
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "$ --" || raw === "--") return new Decimal(0);
  const negativeByParens = /^\(.*\)$/.test(raw);
  let cleaned = raw.replace(/[()\s$€£A-Z]/gi, "").replace(/[^0-9.,+\-]/g, "");

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const digitsAfterComma = cleaned.includes(",") ? cleaned.length - cleaned.lastIndexOf(",") - 1 : 0;
  const commaIsDecimal = locale === "comma" || (
    locale === "auto" && cleaned.includes(",") && (
      (cleaned.includes(".") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf("."))
      || (!cleaned.includes(".") && commaCount === 1 && digitsAfterComma !== 3)
    )
  );
  if (commaIsDecimal) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  if (!cleaned || cleaned === "+" || cleaned === "-") return new Decimal(0);
  const parsed = new Decimal(cleaned);
  return negativeByParens ? parsed.abs().negated() : parsed;
}

export function decimalString(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(8).toFixed();
}

export function parseDate(value: string, yearHint?: number): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const native = new Date(raw);
  if (!Number.isNaN(native.getTime()) && (/T|^\d{4}-|\b20\d{2}\b/.test(raw))) {
    return native.toISOString();
  }

  let match = raw.match(/^(\d{1,2})[-/]([0-1]?\d)[-/](\d{2}|\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return new Date(Date.UTC(year, month, day)).toISOString();
  }

  match = raw.match(/^([A-Za-zÁÉÍÓÚáéíóú]{3,12})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (match) {
    const month = monthNumbers[match[1].toLowerCase()];
    const year = Number(match[3] ?? yearHint);
    if (month !== undefined && year) return new Date(Date.UTC(year, month, Number(match[2]))).toISOString();
  }

  match = raw.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,12}),?\s+(\d{4})$/);
  if (match) {
    const month = monthNumbers[match[2].toLowerCase()];
    if (month !== undefined) return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString();
  }

  return null;
}

export function normalizeStatus(value: string): TransactionStatus {
  const status = value.toLowerCase();
  if (/fail|declin|cancel|rechaz/.test(status)) return "failed";
  if (/pending|pendiente|process/.test(status)) return "pending";
  if (/revers|refund.*complete/.test(status)) return "reversed";
  return "posted";
}

export function shouldExclude(kind: TransactionKind, status: TransactionStatus): boolean {
  return status !== "posted" || ["transfer", "cash_withdrawal", "investment_purchase", "investment_sale", "unknown"].includes(kind);
}

export function stableFingerprint(parts: Array<string | number | null | undefined>): string {
  const input = parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function cleanDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "Untitled transaction";
}
