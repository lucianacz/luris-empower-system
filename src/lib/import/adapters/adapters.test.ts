import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { ArqPdfAdapter } from "./arq-pdf";
import { BrubankPdfAdapter } from "./brubank-pdf";
import { DeelCsvAdapter } from "./deel-csv";
import { PayoneerCsvAdapter } from "./payoneer-csv";

const fixture = (name: string) => readFile(fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url)), "utf8");

describe("provider adapters", () => {
  it("normalizes Deel balance income, transfers, fees, and failed rows", async () => {
    const parsed = parseCsv(await fixture("deel-balance.csv"));
    const adapter = new DeelCsvAdapter();
    const input = { fileName: "Deel Transactions.csv", format: "csv" as const, headers: parsed.headers, csvRows: parsed.rows };
    expect(adapter.detect(input)?.variant).toBe("balance");
    const transactions = adapter.parse(input);
    expect(transactions).toHaveLength(4);
    expect(transactions[0]).toMatchObject({ kind: "income", amount: "6000", excludedFromTotals: false });
    expect(transactions[1]).toMatchObject({ kind: "transfer", amount: "-1300", feeAmount: "9.75", excludedFromTotals: true });
    expect(transactions[2]).toMatchObject({ status: "failed", excludedFromTotals: true });
    expect(transactions[3]).toMatchObject({ kind: "transfer", amount: "-500", feeAmount: "0", excludedFromTotals: true });
  });

  it("uses signed account amounts for Deel card activity", async () => {
    const parsed = parseCsv(await fixture("deel-card.csv"));
    const adapter = new DeelCsvAdapter();
    const input = { fileName: "Card Transactions.csv", format: "csv" as const, headers: parsed.headers, csvRows: parsed.rows };
    expect(adapter.detect(input)?.variant).toBe("card");
    const transactions = adapter.parse(input);
    expect(transactions.map((transaction) => transaction.kind)).toEqual(["expense", "refund", "expense"]);
    expect(transactions[0].feeAmount).toBe("0.3");
    expect(transactions[2].status).toBe("failed");
  });

  it("recognizes Payoneer report semantics and keeps cash unresolved", async () => {
    const parsed = parseCsv(await fixture("payoneer.csv"));
    const adapter = new PayoneerCsvAdapter();
    const input = { fileName: "Report.csv", format: "csv" as const, headers: parsed.headers, csvRows: parsed.rows };
    expect(adapter.detect(input)?.provider).toBe("payoneer");
    const transactions = adapter.parse(input);
    expect(transactions.map((transaction) => transaction.kind)).toEqual(["expense", "income", "cash_withdrawal", "fee"]);
    expect(transactions[2].excludedFromTotals).toBe(true);
    expect(transactions[3].status).toBe("failed");
  });

  it("parses ARQ statement rows without treating wallet movements as income", async () => {
    const lines = (await fixture("arq-pdf-lines.txt")).split("\n").filter(Boolean);
    const adapter = new ArqPdfAdapter();
    const input = { fileName: "Estado de cuenta ARQ - 2026-08.pdf", format: "pdf" as const, pdfLines: lines };
    const transactions = adapter.parse(input);
    expect(transactions).toHaveLength(4);
    expect(transactions[0]).toMatchObject({ kind: "transfer", amount: "120000", excludedFromTotals: true });
    expect(transactions[2]).toMatchObject({ kind: "expense", amount: "-12345.67", excludedFromTotals: false });
    expect(transactions[3]).toMatchObject({ kind: "unknown", excludedFromTotals: true });
  });

  it("parses Brubank debit and credit columns", async () => {
    const lines = (await fixture("brubank-pdf-lines.txt")).split("\n").filter(Boolean);
    const adapter = new BrubankPdfAdapter();
    const input = { fileName: "Brubank Statement.pdf", format: "pdf" as const, pdfLines: lines };
    const transactions = adapter.parse(input);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ amount: "-21991.6", currency: "ARS", kind: "expense" });
    expect(transactions[1]).toMatchObject({ amount: "71280", kind: "unknown", excludedFromTotals: true });
  });
});
