import Papa from "papaparse";

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  const headers = (result.meta.fields ?? []).map((header) => header.trim()).filter(Boolean);
  return {
    headers,
    rows: result.data.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? "").trim()]))),
    errors: result.errors.map((error) => `Row ${error.row ?? "?"}: ${error.message}`),
  };
}
