import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: false });

export function parseXlsx(bytes: Uint8Array): { headers: string[]; rows: Record<string, string>[] } {
  const archive = unzipSync(bytes);
  const workbook = xml(archive, "xl/workbook.xml");
  const relationships = xml(archive, "xl/_rels/workbook.xml.rels");
  const firstSheet = asArray(workbook.workbook?.sheets?.sheet)[0];
  if (!firstSheet) throw new Error("The workbook has no worksheets.");
  const relationship = asArray(relationships.Relationships?.Relationship).find((item) => item?.["@_Id"] === firstSheet["@_r:id"]);
  const target = String(relationship?.["@_Target"] ?? "worksheets/sheet1.xml").replace(/^\//, "");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheet = xml(archive, sheetPath);
  const sharedStrings = archive["xl/sharedStrings.xml"] ? parseSharedStrings(xml(archive, "xl/sharedStrings.xml")) : [];
  const dateStyles = archive["xl/styles.xml"] ? parseDateStyles(xml(archive, "xl/styles.xml")) : new Set<number>();
  const grid = asArray(sheet.worksheet?.sheetData?.row).map((row) => {
    const values: string[] = [];
    for (const cell of asArray(row?.c)) {
      const reference = String(cell?.["@_r"] ?? "A1");
      const column = columnIndex(reference);
      values[column] = cellValue(cell, sharedStrings, dateStyles);
    }
    return values;
  }).filter((row) => row.some((value) => String(value ?? "").trim()));
  const headers = (grid[0] ?? []).map((value, index) => String(value || `Column ${index + 1}`).trim());
  const rows = grid.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])));
  return { headers, rows };
}

function xml(archive: Record<string, Uint8Array>, path: string) {
  const data = archive[path];
  if (!data) throw new Error(`Required workbook entry is missing: ${path}`);
  return parser.parse(new TextDecoder().decode(data));
}

function parseSharedStrings(document: Record<string, unknown>): string[] {
  const root = document.sst as { si?: unknown } | undefined;
  return asArray(root?.si).map((item) => readRichText(item));
}

function readRichText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (typeof item.t === "string") return item.t;
  return asArray(item.r).map((run) => readRichText(run)).join("");
}

function parseDateStyles(document: Record<string, unknown>): Set<number> {
  const styleSheet = document.styleSheet as Record<string, unknown> | undefined;
  const customFormats = new Map<number, string>();
  const numFmts = (styleSheet?.numFmts as { numFmt?: unknown } | undefined)?.numFmt;
  for (const format of asArray(numFmts)) {
    const id = Number(format?.["@_numFmtId"]);
    if (Number.isFinite(id)) customFormats.set(id, String(format?.["@_formatCode"] ?? ""));
  }
  const dateStyles = new Set<number>();
  const xfs = (styleSheet?.cellXfs as { xf?: unknown } | undefined)?.xf;
  asArray(xfs).forEach((style, index) => {
    const formatId = Number(style?.["@_numFmtId"] ?? 0);
    const custom = customFormats.get(formatId) ?? "";
    if ((formatId >= 14 && formatId <= 22) || (formatId >= 45 && formatId <= 47) || /[ymdhis]/i.test(custom.replace(/\[[^\]]+\]/g, ""))) dateStyles.add(index);
  });
  return dateStyles;
}

function cellValue(cell: Record<string, unknown>, sharedStrings: string[], dateStyles: Set<number>): string {
  const type = String(cell["@_t"] ?? "");
  if (type === "inlineStr") return readRichText(cell.is);
  const raw = String(cell.v ?? "");
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "true" : "false";
  const style = Number(cell["@_s"] ?? -1);
  if (raw && dateStyles.has(style)) {
    const serial = Number(raw);
    if (Number.isFinite(serial)) return new Date(Math.round((serial - 25569) * 86_400_000)).toISOString();
  }
  return raw;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}
