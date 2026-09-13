import type { AdapterInput, DetectionResult, ImportAdapter, NormalizedTransaction } from "../types";

export class AlpacaPdfAdapter implements ImportAdapter {
  readonly provider = "alpaca" as const;
  readonly name = "AlpacaPdfAdapter";

  detect(input: AdapterInput): DetectionResult | null {
    if (input.format !== "pdf") return null;
    const text = (input.pdfLines ?? []).join(" ");
    if (!/Alpaca/i.test(text) || !/Monthly Statement/i.test(text)) return null;
    return { provider: this.provider, confidence: 0.99, reasons: ["Matched Alpaca investment statement"], format: "pdf", variant: "brokerage-statement" };
  }

  parse(): NormalizedTransaction[] {
    return [];
  }
}
