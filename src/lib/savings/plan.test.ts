import { describe, expect, it } from "vitest";
import { savingMonthsRemaining, savingsProgress, splitByIncome } from "./plan";

describe("savings plan", () => {
  it("excludes the open month and includes the target month", () => {
    expect(savingMonthsRemaining("2026-09-14", "2027-03-31")).toBe(6);
  });

  it("calculates remaining money and a monthly target", () => {
    expect(savingsProgress(15000, 3000, "2027-03-31", "2026-09-14")).toMatchObject({ remaining: 12000, savingMonths: 6, monthlyRequired: 2000, progress: 0.2 });
  });

  it("does not invent a monthly target without a date", () => {
    expect(savingsProgress(6000, 0, null, "2026-09-14").monthlyRequired).toBeNull();
  });

  it("can split a shared monthly target using completed-income shares", () => {
    expect(splitByIncome(2500, [{ role: "self", name: "Luciana", incomeShare: 0.8 }, { role: "partner", name: "Julian", incomeShare: 0.2 }])).toEqual([
      { role: "self", name: "Luciana", incomeShare: 0.8, amount: 2000 },
      { role: "partner", name: "Julian", incomeShare: 0.2, amount: 500 },
    ]);
  });
});
