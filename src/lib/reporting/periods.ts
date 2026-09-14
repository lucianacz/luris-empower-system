export type DatePreset = "current_month" | "custom_month" | "ytd" | "last_year" | "all_records" | "custom";

export const SYSTEM_START_DATE = "2025-01-01";

export interface DateRange {
  from: string;
  to: string;
}

export function rangeForPreset(preset: Exclude<DatePreset, "custom" | "custom_month">, today: string): DateRange {
  const current = parseDate(today);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  if (preset === "current_month") return { from: isoDate(new Date(Date.UTC(year, month, 1))), to: today };
  if (preset === "last_year") return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  if (preset === "all_records") return { from: SYSTEM_START_DATE, to: today };
  return { from: `${year}-01-01`, to: today };
}

export function rangeForMonth(month: string, today: string): DateRange {
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: lastDay > today ? today : lastDay };
}

export function throughLastCompletedMonth(range: DateRange, today: string): DateRange | null {
  const normalized = normalizeRange(range);
  const currentMonthStart = parseDate(`${today.slice(0, 7)}-01`);
  currentMonthStart.setUTCDate(0);
  const lastCompletedDate = isoDate(currentMonthStart);
  if (normalized.from > lastCompletedDate) return null;
  return { from: normalized.from, to: normalized.to < lastCompletedDate ? normalized.to : lastCompletedDate };
}

export function normalizeRange(range: DateRange): DateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

export function monthKeysInRange(range: DateRange): string[] {
  const normalized = normalizeRange(range);
  const start = parseDate(`${normalized.from.slice(0, 7)}-01`);
  const end = parseDate(`${normalized.to.slice(0, 7)}-01`);
  const months: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) months.push(isoDate(cursor).slice(0, 7));
  return months;
}

export function completedMonthKeys(range: DateRange, today: string): string[] {
  const normalized = normalizeRange(range);
  const currentMonth = today.slice(0, 7);
  return monthKeysInRange(normalized).filter((month) => {
    if (month >= currentMonth) return false;
    const monthStart = `${month}-01`;
    const monthEnd = isoDate(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    return monthStart >= normalized.from && monthEnd <= normalized.to;
  });
}

export function rangeLabel(range: DateRange) {
  const normalized = normalizeRange(range);
  return `${normalized.from} to ${normalized.to}`;
}

export function previousComparableRange(range: DateRange): DateRange {
  const normalized = normalizeRange(range);
  const from = parseDate(normalized.from);
  const to = parseDate(normalized.to);
  const inclusiveDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - inclusiveDays + 1);
  return { from: isoDate(previousFrom), to: isoDate(previousTo) };
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
