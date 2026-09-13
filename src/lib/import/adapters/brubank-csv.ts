import { GenericCsvAdapter } from "./generic-csv";
import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction } from "../types";

export class BrubankCsvAdapter implements ImportAdapter {
  readonly provider = "brubank" as const;
  readonly name = "BrubankCsvAdapter";
  private readonly generic = new GenericCsvAdapter();

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "csv") return null;
    const headers = new Set((input.headers ?? []).map((header) => header.toLowerCase()));
    if (!(headers.has("#ref") && headers.has("descripción") && headers.has("saldo"))) return null;
    return { provider: this.provider, confidence: 0.94, reasons: ["Matched Brubank movement columns"], format: "csv" };
  }

  parse(input: AdapterInput): NormalizedTransaction[] {
    return this.generic.parse({
      ...input,
      mapping: input.mapping ?? {
        date: "Fecha",
        description: "Descripción",
        debit: "Débito",
        credit: "Crédito",
        externalId: "#Ref",
        currency: "Moneda",
      },
    });
  }
}
