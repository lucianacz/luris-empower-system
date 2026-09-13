interface FingerprintedRow {
  id: string;
  fingerprint?: string | null;
  created_at?: string;
  excluded_from_totals: boolean;
  metadata?: Record<string, unknown>;
}

export function markDuplicateFingerprints<T extends FingerprintedRow>(rows: T[]): T[] {
  const keepers = new Map<string, string>();
  const sorted = [...rows].sort((left, right) => `${left.created_at ?? ""}:${left.id}`.localeCompare(`${right.created_at ?? ""}:${right.id}`));
  for (const row of sorted) {
    if (row.fingerprint && !keepers.has(row.fingerprint)) keepers.set(row.fingerprint, row.id);
  }

  return rows.map((row) => {
    const keeperId = row.fingerprint ? keepers.get(row.fingerprint) : null;
    if (!keeperId || keeperId === row.id) return row;
    return {
      ...row,
      excluded_from_totals: true,
      metadata: {
        ...(row.metadata ?? {}),
        isDuplicate: true,
        duplicateOfTransactionId: keeperId,
        duplicateReason: "Repeated provider fingerprint across overlapping statement exports",
      },
    };
  });
}

export function uniqueByFingerprint<T extends { fingerprint?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.fingerprint) return true;
    if (seen.has(row.fingerprint)) return false;
    seen.add(row.fingerprint);
    return true;
  });
}

export function isRuntimeDuplicate(row: { metadata?: Record<string, unknown> }): boolean {
  return row.metadata?.isDuplicate === true;
}
