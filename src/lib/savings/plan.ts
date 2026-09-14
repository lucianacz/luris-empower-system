import Decimal from "decimal.js";

export interface SavingsProgress {
  target: number;
  saved: number;
  remaining: number;
  progress: number;
  savingMonths: number | null;
  monthlyRequired: number | null;
}

export function savingsProgress(targetAmount: string | number, savedAmount: string | number, targetDate: string | null, asOfDate: string): SavingsProgress {
  const target = new Decimal(targetAmount || 0).toDecimalPlaces(2).toNumber();
  const saved = new Decimal(savedAmount || 0).toDecimalPlaces(2).toNumber();
  const remaining = Decimal.max(new Decimal(target).minus(saved), 0).toDecimalPlaces(2).toNumber();
  const savingMonths = targetDate ? savingMonthsRemaining(asOfDate, targetDate) : null;
  const monthlyRequired = savingMonths == null || savingMonths === 0 ? null : new Decimal(remaining).div(savingMonths).toDecimalPlaces(2).toNumber();
  return { target, saved, remaining, progress: target > 0 ? Math.min(1, saved / target) : 0, savingMonths, monthlyRequired };
}

export function savingMonthsRemaining(asOfDate: string, targetDate: string) {
  if (targetDate < asOfDate) return 0;
  const asOfYear = Number(asOfDate.slice(0, 4));
  const asOfMonth = Number(asOfDate.slice(5, 7));
  const targetYear = Number(targetDate.slice(0, 4));
  const targetMonth = Number(targetDate.slice(5, 7));
  const monthDistance = (targetYear - asOfYear) * 12 + targetMonth - asOfMonth;
  return Math.max(1, monthDistance);
}

export function splitByIncome(monthlyAmount: number, shares: Array<{ role: "self" | "partner"; name: string; incomeShare: number }>) {
  return shares.map((share) => ({ ...share, amount: new Decimal(monthlyAmount).mul(share.incomeShare).toDecimalPlaces(2).toNumber() }));
}
