import type { NormalizedTransaction } from "./types";

export interface ExistingTransactionKey {
  sourceId: string | null;
  fingerprint: string;
}

export function partitionDuplicates(incoming: NormalizedTransaction[], existing: ExistingTransactionKey[]) {
  const fingerprints = new Set(existing.map((item) => item.fingerprint));
  const accepted: NormalizedTransaction[] = [];
  const duplicates: NormalizedTransaction[] = [];

  for (const transaction of incoming) {
    // Some providers reuse one source ID for an original payment and its later
    // reversal. The full fingerprint keeps that audit pair while still making
    // overlapping exports idempotent.
    const duplicate = fingerprints.has(transaction.fingerprint);
    if (duplicate) duplicates.push(transaction);
    else {
      accepted.push(transaction);
      fingerprints.add(transaction.fingerprint);
    }
  }
  return { accepted, duplicates };
}
