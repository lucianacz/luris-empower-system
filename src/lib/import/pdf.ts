import type { TextItem } from "pdfjs-dist/types/src/display/api";

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

export async function extractPdfLines(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false });
  const document = await loadingTask.promise;
  const lines: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item): item is TextItem => "str" in item && Boolean(item.str.trim()))
        .map<PositionedText>((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
        .sort((left, right) => Math.abs(right.y - left.y) > 2 ? right.y - left.y : left.x - right.x);

      const grouped: Array<{ y: number; items: PositionedText[] }> = [];
      for (const item of items) {
        const line = grouped.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
        if (line) line.items.push(item);
        else grouped.push({ y: item.y, items: [item] });
      }

      grouped
        .sort((left, right) => right.y - left.y)
        .forEach((line) => {
          const text = line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
          if (text) lines.push(text);
        });
    }
  } finally {
    document.cleanup();
    await loadingTask.destroy();
  }

  return lines;
}
