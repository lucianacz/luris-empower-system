export interface CoveragePeriod {
  start: string;
  end: string;
}

export interface CoverageGap {
  start: string;
  end: string;
  days: number;
}

export function findCoverageGaps(periods: CoveragePeriod[], toleranceDays = 2): CoverageGap[] {
  const sorted = periods
    .map((period) => ({ start: new Date(period.start), end: new Date(period.end) }))
    .filter((period) => !Number.isNaN(period.start.getTime()) && !Number.isNaN(period.end.getTime()))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const gaps: CoverageGap[] = [];
  let coverageEnd = sorted[0]?.end;
  for (const period of sorted.slice(1)) {
    if (!coverageEnd) break;
    const gapDays = Math.floor((period.start.getTime() - coverageEnd.getTime()) / 86_400_000) - 1;
    if (gapDays > toleranceDays) {
      const start = new Date(coverageEnd.getTime() + 86_400_000);
      const end = new Date(period.start.getTime() - 86_400_000);
      gaps.push({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: gapDays });
    }
    if (period.end > coverageEnd) coverageEnd = period.end;
  }
  return gaps;
}
