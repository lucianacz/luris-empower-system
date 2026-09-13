import { describe, expect, it } from "vitest";
import { createTransaction } from "@/lib/import/adapters/helpers";
import { buildTransferChains } from "./chains";
import { matchTransfers, type TransferCandidate } from "./matcher";

function candidate(id: string, accountId: string, overrides: Partial<TransferCandidate>): TransferCandidate {
  return {
    ...createTransaction({ provider: "test", sourceId: id, occurredAt: "2026-08-01T00:00:00.000Z", description: id, amount: "0", currency: "USD", kind: "transfer" }),
    id,
    accountId,
    ...overrides,
  };
}

describe("transfer reconstruction", () => {
  it("supports one-to-many allocations without counting transfers as spending", () => {
    const transactions = [
      candidate("out", "deel", { amount: "-100" }),
      candidate("in-1", "arq", { amount: "60", occurredAt: "2026-08-02T00:00:00.000Z" }),
      candidate("in-2", "cash", { amount: "40", occurredAt: "2026-08-03T00:00:00.000Z" }),
    ];
    const matches = matchTransfers(transactions);
    expect(matches).toHaveLength(2);
    expect(matches.reduce((sum, match) => sum + Number(match.sourceAmount), 0)).toBe(100);
    expect(transactions.every((transaction) => transaction.excludedFromTotals)).toBe(true);
  });

  it("joins Deel to ARQ to Brubank into one cross-currency chain", () => {
    const transactions = [
      candidate("deel-out", "deel", { amount: "-100", originalAmount: "90000", originalCurrency: "ARS" }),
      candidate("arq-in", "arq", { amount: "90000", currency: "ARS", occurredAt: "2026-08-02T00:00:00.000Z" }),
      candidate("arq-out", "arq", { amount: "-60000", currency: "ARS", occurredAt: "2026-08-04T00:00:00.000Z" }),
      candidate("brubank-in", "brubank", { amount: "60000", currency: "ARS", occurredAt: "2026-08-05T00:00:00.000Z" }),
    ];
    const matches = matchTransfers(transactions);
    const chains = buildTransferChains(matches);
    expect(matches.map((match) => [match.sourceTransactionId, match.targetTransactionId])).toEqual([
      ["deel-out", "arq-in"],
      ["arq-out", "brubank-in"],
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].accountPath).toEqual(["deel", "arq", "brubank"]);
  });
});
