import type { AdapterInput, DetectionResult, ImportAdapter, InvestmentStatementPreview, NormalizedTransaction } from "../types";

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

export function parseAlpacaStatement(lines: string[]): InvestmentStatementPreview | null {
  const header = lines.find((line) => /Account No:.*Monthly Statement Period:/i.test(line));
  const headerMatch = header?.match(/Account No:\s*(\d+).*Monthly Statement Period:\s*([A-Z]+)\s*-\s*(20\d{2})/i);
  if (!headerMatch) return null;
  const month = monthNumber(headerMatch[2]);
  if (!month) return null;
  const periodStart = `${headerMatch[3]}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(Number(headerMatch[3]), month, 0)).toISOString().slice(0, 10);
  const positions = lines.flatMap((line) => {
    const match = line.match(/^([A-Z][A-Z.]{0,9})\s+(.+?)\s+([0-9.]+)\s+\$([0-9,.]+)\s+\$([0-9,.]+)\s+\$([0-9,.]+)\s+(-?\$[0-9,.]+)\s+\$([0-9,.]+)$/);
    if (!match || match[1] === "USD") return [];
    return [{
      symbol: match[1],
      name: match[2],
      assetType: /\bETF\b|\bUNIT\b|INDEX FDS/i.test(match[2]) ? "ETF" : "Stock",
      quantity: numberOf(match[3]),
      marketPrice: numberOf(match[4]),
      currentValue: numberOf(match[5]),
      costBasis: numberOf(match[8]),
      unrealizedProfitLoss: signedMoneyOf(match[7]),
    }];
  });
  const totalMarketValue = amountAfter(lines, /^Total Market Value\s+/i, 0);
  const cashAvailable = amountAfter(lines, /^Ending Value\s+/i, 0, "last");
  const transactions: InvestmentStatementPreview["transactions"] = [];
  for (const line of lines) {
    const trade = line.match(/^(\d{2}\/\d{2}\/20\d{2})\s+Trade Entry\s+(buy|sell)\s+([A-Z.]+)\s+([0-9.]+)\s+\$([0-9,.]+)\s+(-?\$[0-9,.]+)\s+(?:\$\s*--|(-?\$[0-9,.]+))$/i);
    if (trade) {
      transactions.push({ occurredAt: isoDate(trade[1]), transactionType: trade[2].toLowerCase() === "buy" ? "purchase" : "sale", symbol: trade[3], quantity: numberOf(trade[4]), unitPrice: numberOf(trade[5]), grossAmount: Math.abs(signedMoneyOf(trade[6])), feeAmount: trade[7] ? Math.abs(signedMoneyOf(trade[7])) : 0, description: `${trade[2].toLowerCase()} ${trade[3]}` });
      continue;
    }
    const cash = line.match(/^(\d{2}\/\d{2}\/20\d{2})\s+Journal Entry\(Cash\)\s+(.+?)\s+(-?\$[0-9,.]+)\s+\d+$/i);
    if (cash) transactions.push({ occurredAt: isoDate(cash[1]), transactionType: signedMoneyOf(cash[3]) >= 0 ? "deposit" : "withdrawal", symbol: null, quantity: null, unitPrice: null, grossAmount: Math.abs(signedMoneyOf(cash[3])), feeAmount: 0, description: cash[2] });
  }
  return {
    accountLabel: `Alpaca brokerage · •••${headerMatch[1].slice(-4)}`,
    periodStart,
    periodEnd,
    currency: "USD",
    cashAvailable,
    totalMarketValue,
    positions,
    transactions,
    yearToDate: {
      contributions: amountAfter(lines, /^Addition\s+/i, 0, "last"),
      withdrawals: amountAfter(lines, /^Subtraction\s+/i, 0, "last"),
      dividends: amountAfter(lines, /^Dividend\s+/i, 0, "last"),
      interest: amountAfter(lines, /^Interest\*\*\s+/i, 0, "last"),
      fees: amountAfter(lines, /^Cost and Fees\s+/i, 0, "last"),
      taxes: 0,
      realizedProfitLoss: amountAfter(lines, /^Net\s+/i, 0, "last"),
    },
  };
}

function monthNumber(value: string) { return ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"].indexOf(value.toUpperCase()) + 1; }
function numberOf(value: string) { return Number(value.replaceAll(",", "")); }
function signedMoneyOf(value: string) { return numberOf(value.replace("$", "")); }
function isoDate(value: string) { const [month, day, year] = value.split("/"); return `${year}-${month}-${day}T12:00:00.000Z`; }
function amountAfter(lines: string[], pattern: RegExp, fallback: number, position: "first" | "last" = "first") {
  const line = lines.find((candidate) => pattern.test(candidate));
  const values = line?.match(/-?\$[0-9,.]+|\$\s*--/g) ?? [];
  const raw = position === "last" ? values.at(-1) : values[0];
  return raw && !raw.includes("--") ? Math.abs(signedMoneyOf(raw.replace(/\s+/g, ""))) : fallback;
}
