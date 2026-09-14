export type DatePreset = "current_month" | "previous_month" | "ytd" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

export function rangeForPreset(preset: Exclude<DatePreset, "custom">, today: string): DateRange {
  const current = parseDate(today);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  if (preset === "current_month") return { from: isoDate(new Date(Date.UTC(year, month, 1))), to: today };
  if (preset === "previous_month") {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { from: isoDate(start), to: isoDate(end) };
  }
  return { from: `${year}-01-01`, to: today };
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
