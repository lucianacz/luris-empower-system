import { GenericCsvAdapter } from "./generic-csv";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction } from "../types";

export class ArqCsvAdapter implements ImportAdapter {
  readonly provider = "arq" as const;
  readonly name = "ArqCsvAdapter";
  private readonly generic = new GenericCsvAdapter();

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const headers = new Set((input.headers ?? []).map((header) => header.toLowerCase()));
    const content = (input.csvRows ?? []).slice(0, 30).map((row) => Object.values(row).join(" ")).join(" ");
    if (!(headers.has("fecha") && headers.has("monto") && /dolarapp|arq|garpa/i.test(content))) return null;
    return { provider: this.provider, confidence: 0.9, reasons: ["Matched ARQ transaction fields"], format: "csv" };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    return this.generic.parse({ ...input, mapping: input.mapping ?? this.generic.suggestMapping(input.headers ?? []) });
  }
}
