import type { DateRange } from "@/lib/reporting/periods";

export interface TransactionSelection {
  title: string;
  transactionIds: string[];
  range: DateRange;
}

export type OpenTransactions = (selection: TransactionSelection) => void;
export type FinanceMutate = (url: string, method: "PATCH" | "PUT" | "DELETE" | "POST", body?: unknown) => Promise<void>;
