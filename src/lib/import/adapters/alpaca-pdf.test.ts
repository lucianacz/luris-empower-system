import { describe, expect, it } from "vitest";
import { parseAlpacaStatement } from "./alpaca-pdf";

describe("AlpacaPdfAdapter", () => {
  it("extracts positions, cash movements, trades, and year-to-date totals", () => {
    const statement = parseAlpacaStatement([
      "Account No: 123454321 Monthly Statement Period: AUGUST - 2026",
      "Addition $125.00 $700.00",
      "Subtraction $ -- $25.00",
      "Cost and Fees $ -- $ --",
      "Ending Value $0.01 $0.01",
      "Total Market Value $900.01",
      "Dividend $ -- $2.50",
      "Interest** $ -- $ --",
      "Net $ -- $4.00",
      "EXMPL EXAMPLE COMPANY COMMON STOCK 0.500000000 $100.00 $50.00 $104.00 -$2.00 $52.00",
      "TEST EXAMPLE INDEX FDS SAMPLE ETF SHS 1.250000000 $400.00 $500.00 $360.00 $50.00 $450.00",
      "08/24/2026 Trade Entry buy EXMPL 0.250000000 $100.00 -$25.00 $ --",
      "08/24/2026 Journal Entry(Cash) funding:00000000-0000-4000-8000-000000000000 $25.00 123454321",
    ]);

    expect(statement).not.toBeNull();
    expect(statement?.accountLabel).toBe("Alpaca brokerage · •••4321");
    expect(statement?.periodEnd).toBe("2026-08-31");
    expect(statement?.positions).toHaveLength(2);
    expect(statement?.positions[1]).toMatchObject({ symbol: "TEST", assetType: "ETF", currentValue: 500, costBasis: 450 });
    expect(statement?.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionType: "purchase", symbol: "EXMPL", grossAmount: 25 }),
      expect.objectContaining({ transactionType: "deposit", symbol: null, grossAmount: 25 }),
    ]));
    expect(statement?.yearToDate).toMatchObject({ contributions: 700, withdrawals: 25, dividends: 2.5, realizedProfitLoss: 4 });
  });
});
