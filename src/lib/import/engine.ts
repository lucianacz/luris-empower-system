import { AlpacaPdfAdapter } from "./adapters/alpaca-pdf";
import { ArqCsvAdapter } from "./adapters/arq-csv";
import { ArqPdfAdapter } from "./adapters/arq-pdf";
import { BrubankCsvAdapter } from "./adapters/brubank-csv";
import { BrubankPdfAdapter } from "./adapters/brubank-pdf";
import { DeelCsvAdapter } from "./adapters/deel-csv";
import { GenericCsvAdapter } from "./adapters/generic-csv";
import { PayoneerCsvAdapter } from "./adapters/payoneer-csv";
import { parseCsv } from "./csv";
import { extractPdfLines } from "./pdf";
import { parseXlsx } from "./xlsx";
import type { AdapterInput, ColumnMapping, DetectionResult, ImportAdapter, ImportPreview, Provider, SourceFormat } from "./types";

const adapters: ImportAdapter[] = [
  new DeelCsvAdapter(),
  new PayoneerCsvAdapter(),
  new ArqCsvAdapter(),
  new BrubankCsvAdapter(),
  new ArqPdfAdapter(),
  new BrubankPdfAdapter(),
  new AlpacaPdfAdapter(),
  new GenericCsvAdapter(),
];

export interface PreviewFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export async function checksum(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function previewFile(file: PreviewFile, options: { provider?: Provider; mapping?: ColumnMapping } = {}): Promise<ImportPreview> {
  const format = detectFormat(file.name, file.mimeType);
  const fileChecksum = await checksum(file.bytes);

  const warnings: string[] = [];
  const input: AdapterInput = { fileName: file.name, format, mapping: options.mapping };
  if (format === "csv") {
    const decoded = new TextDecoder("utf-8").decode(file.bytes);
    const parsed = parseCsv(decoded);
    input.csvRows = parsed.rows;
    input.headers = parsed.headers;
    warnings.push(...parsed.errors.slice(0, 10));
  } else if (format === "xlsx") {
    const parsed = parseXlsx(file.bytes);
    input.csvRows = parsed.rows;
    input.headers = parsed.headers;
    input.format = "csv";
  } else {
    input.pdfLines = await extractPdfLines(file.bytes);
  }

  const candidates = adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(input) }))
    .filter((candidate): candidate is { adapter: ImportAdapter; detection: DetectionResult } => candidate.detection !== null)
    .sort((left, right) => right.detection.confidence - left.detection.confidence);

  const chosen = options.provider
    ? candidates.find((candidate) => candidate.adapter.provider === options.provider)
      ?? adapters.map((adapter) => ({ adapter, detection: adapter.provider === options.provider ? ({ provider: options.provider, confidence: 0.5, reasons: ["Institution selected manually"], format } as DetectionResult) : null })).find((candidate) => candidate.detection)
    : candidates[0];

  if (!chosen?.detection) throw new Error("No compatible adapter could read this file.");
  const generic = chosen.adapter instanceof GenericCsvAdapter ? chosen.adapter : null;
  const suggestedMapping = generic?.suggestMapping(input.headers ?? []) ?? {};
  const mapping = { ...suggestedMapping, ...(options.mapping ?? {}) };
  input.mapping = mapping;
  const requiresMapping = chosen.adapter.provider === "generic" && (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit));
  const transactions = requiresMapping ? [] : chosen.adapter.parse(input);
  const seen = new Set<string>();
  for (const transaction of transactions) {
    if (seen.has(transaction.fingerprint)) transaction.warnings.push("Possible duplicate within this file.");
    seen.add(transaction.fingerprint);
  }

  if (chosen.adapter.provider === "alpaca") warnings.push("Investment statement detected. It is staged for the investment module and excluded from spending imports.");
  if (!transactions.length && !requiresMapping && chosen.adapter.provider !== "alpaca") warnings.push("No transaction rows could be normalized from this file.");
  const dates = transactions.map((transaction) => transaction.occurredAt).sort();
  const unresolvedRows = transactions.filter((transaction) => transaction.kind === "unknown").length;
  const warningRows = transactions.filter((transaction) => transaction.warnings.length > 0).length;
  const inferredPeriod = inferStatementPeriod(file.name, chosen.detection.provider);
  const currencies = [...new Set(transactions.map((transaction) => transaction.currency))].sort();
  if (!currencies.length && ["arq", "brubank"].includes(chosen.detection.provider)) currencies.push("ARS");
  if (!currencies.length && ["deel", "payoneer", "alpaca"].includes(chosen.detection.provider)) currencies.push("USD");

  return {
    fileName: file.name,
    checksum: fileChecksum,
    detection: { ...chosen.detection, format },
    headers: input.headers ?? [],
    suggestedMapping,
    requiresMapping,
    transactions,
    warnings,
    summary: {
      totalRows: input.csvRows?.length ?? transactions.length,
      readyRows: transactions.length - unresolvedRows,
      warningRows,
      unresolvedRows,
      failedRows: transactions.filter((transaction) => transaction.status === "failed").length,
      currencies,
      dateFrom: inferredPeriod?.start ?? dates[0] ?? null,
      dateTo: inferredPeriod?.end ?? dates.at(-1) ?? null,
      accountLabel: accountLabel(chosen.detection, currencies),
    },
  };
}

function inferStatementPeriod(fileName: string, provider: Provider): { start: string; end: string } | null {
  if (provider === "arq") {
    const match = fileName.match(/(20\d{2})-(0[1-9]|1[0-2])/);
    if (match) return monthPeriod(Number(match[1]), Number(match[2]));
  }
  if (provider === "brubank") {
    const range = fileName.match(/jan\s+to\s+aug\s+(20\d{2})/i);
    if (range) return { start: `${range[1]}-01-01T00:00:00.000Z`, end: `${range[1]}-08-31T23:59:59.999Z` };
    const year = fileName.match(/statement\s+(20\d{2})/i);
    if (year) return { start: `${year[1]}-01-01T00:00:00.000Z`, end: `${year[1]}-12-31T23:59:59.999Z` };
  }
  return null;
}

function monthPeriod(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1) - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function detectFormat(fileName: string, mimeType: string): SourceFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".xlsx") || /spreadsheetml/.test(mimeType)) return "xlsx";
  return "csv";
}

function providerLabel(provider: Provider): string {
  if (provider === "arq") return "ARQ";
  if (provider === "alpaca") return "Alpaca";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function accountLabel(detection: DetectionResult, currencies: string[]): string {
  if (detection.provider === "deel" && detection.variant === "card") return "Deel card";
  if (detection.provider === "deel" && detection.variant === "balance") return "Deel balance";
  return `${providerLabel(detection.provider)} ${currencies.join(" / ") || "account"}`;
}

export function getAdapters(): readonly ImportAdapter[] {
  return adapters;
}
