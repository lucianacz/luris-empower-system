import type { NormalizedTransaction } from "./types";

export interface ExistingTransactionKey {
  sourceId: string | null;
  fingerprint: string;
}

export function partitionDuplicates(incoming: NormalizedTransaction[], existing: ExistingTransactionKey[]) {
  const sourceIds = new Set(existing.map((item) => item.sourceId).filter(Boolean));
  const fingerprints = new Set(existing.map((item) => item.fingerprint));
  const accepted: NormalizedTransaction[] = [];
  const duplicates: NormalizedTransaction[] = [];

  for (const transaction of incoming) {
    const duplicate = (transaction.sourceId && sourceIds.has(transaction.sourceId)) || fingerprints.has(transaction.fingerprint);
    if (duplicate) duplicates.push(transaction);
    else {
      accepted.push(transaction);
      if (transaction.sourceId) sourceIds.add(transaction.sourceId);
      fingerprints.add(transaction.fingerprint);
    }
  }
  return { accepted, duplicates };
}
