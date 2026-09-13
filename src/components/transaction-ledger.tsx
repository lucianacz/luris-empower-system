"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FinanceMutate, TransactionSelection } from "@/components/finance-ui-types";
import type { WorkspaceData, WorkspaceTransaction } from "@/lib/workspace/demo";

export function TransactionLedger({ workspace, mutate, selection, clearSelection }: { workspace: WorkspaceData; mutate: FinanceMutate; selection: TransactionSelection | null; clearSelection: () => void }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("all");
  const selectedIds = useMemo(() => selection ? new Set(selection.transactionIds) : null, [selection]);
  const rows = useMemo(() => workspace.transactions.filter((transaction) => {
    if (selectedIds && !selectedIds.has(transaction.id)) return false;
    if (kind !== "all" && transaction.kind !== kind) return false;
    if (category === "uncategorized" && transaction.category_id) return false;
    if (category !== "all" && category !== "uncategorized" && transaction.category_id !== category) return false;
    return (transaction.description + " " + (transaction.merchant_name ?? "") + " " + (transaction.account?.name ?? "")).toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }), [category, kind, search, selectedIds, workspace.transactions]);
  const live = workspace.mode === "live";

  const saveCategory = async (transactionId: string, categoryId: string) => {
    try {
      await mutate("/api/transactions/" + transactionId, "PATCH", { categoryId: categoryId || null, applyToSimilar: true });
    } catch (error) {
      window.alert(messageOf(error));
    }
  };
  const saveSplit = async (transactionId: string, shared: boolean) => {
    const splits = shared
      ? [{ kind: "personal", label: "My share", percentage: 0.5 }, { kind: "household_member", label: "Household share", percentage: 0.5 }]
      : [{ kind: "personal", label: "Personal", percentage: 1 }];
    try {
      await mutate("/api/transactions/" + transactionId + "/splits", "PUT", { splits });
    } catch (error) {
      window.alert(messageOf(error));
    }
  };

  return <section className="mt-7 space-y-4">
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Transaction evidence</p>
          <h2 className="mt-1 text-lg font-semibold">{selection?.title ?? "All imported transactions"}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{selection ? selection.range.from + " to " + selection.range.to + " · exact transaction IDs from the selected total" : "No reporting filter is active. Every previously imported transaction is available."}</p>
        </div>
        {selection ? <button onClick={clearSelection} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold"><X aria-hidden="true" className="size-3.5" />Show all transactions</button> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_210px_auto]">
        <label className="relative"><span className="sr-only">Search transactions</span><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, description, or account" className="h-10 w-full rounded-xl border border-[var(--line)] bg-white pl-9 pr-3 text-sm" /></label>
        <FilterSelect label="Treatment" value={kind} onChange={setKind} options={[["all", "All treatments"], ["expense", "Expense"], ["refund", "Refund"], ["fee", "Fee"], ["tax", "Tax"], ["cash_withdrawal", "Cash withdrawal"], ["transfer", "Transfer"], ["income", "Income"], ["unknown", "Needs review"]]} />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={[["all", "All categories"], ["uncategorized", "Uncategorized"], ...workspace.categories.map((item) => [item.id, item.name] as [string, string])]} />
        <span className="self-center text-right text-sm text-[var(--muted)]">{rows.length} of {workspace.transactions.length}</span>
      </div>
    </div>

    <div className="overflow-x-auto rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
      <table className="w-full min-w-[1280px] text-left text-sm">
        <thead className="bg-[var(--paper)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Payment date</th><th className="px-4 py-3">Merchant or description</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Original amount</th><th className="px-4 py-3">USD reporting value</th><th className="px-4 py-3">Service month</th><th className="px-4 py-3">Personal/shared</th></tr></thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} workspace={workspace} live={live} saveCategory={saveCategory} saveSplit={saveSplit} />)}
          {!rows.length ? <tr><td colSpan={8} className="p-8 text-center text-sm text-[var(--muted)]">No transactions match this evidence filter.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </section>;
}

function TransactionRow({ transaction, workspace, live, saveCategory, saveSplit }: { transaction: WorkspaceTransaction; workspace: WorkspaceData; live: boolean; saveCategory: (id: string, categoryId: string) => Promise<void>; saveSplit: (id: string, shared: boolean) => Promise<void> }) {
  const duplicate = transaction.metadata?.isDuplicate === true;
  const crossedOut = Number(transaction.amount) === 0 || ["failed", "reversed"].includes(transaction.status);
  const reportingAmount = duplicate || crossedOut ? null : transaction.currency === "USD" ? Number(transaction.amount) : transaction.reporting_value ? Number(transaction.reporting_value.reporting_amount) : null;
  const originalAmount = transaction.original_amount != null && transaction.original_currency ? { amount: transaction.original_amount, currency: transaction.original_currency } : { amount: transaction.amount, currency: transaction.currency };
  const source = duplicate ? "Duplicate statement row · excluded from totals" : crossedOut ? "Rejected, reversed, or zero · excluded from totals" : transaction.currency === "USD" ? "USD account amount" : transaction.reporting_value ? transaction.reporting_value.source + (transaction.reporting_value.is_estimated ? " · estimated" : "") : "Historical rate required";
  const allocations = transaction.expense_allocations ?? [];
  const crossedClass = crossedOut ? " line-through" : "";

  return <tr className={crossedOut ? "align-top bg-[#faf7f3] opacity-60" : "align-top"}>
    <td className="whitespace-nowrap px-4 py-3"><strong className={"block font-medium" + crossedClass}>{date(transaction.occurred_at)}</strong><span className="mt-1 block font-mono text-[10px] text-[var(--muted)]">{transaction.id.slice(0, 12)}</span></td>
    <td className="max-w-[260px] px-4 py-3">
      <p className={"truncate font-medium" + crossedClass} title={transaction.description}>{transaction.merchant_name || transaction.description}</p>
      <p className="mt-1 truncate text-xs text-[var(--muted)]">{transaction.account?.name ?? "Unknown account"} · {transaction.kind.replaceAll("_", " ")}</p>
      {crossedOut ? <span className="mt-1 inline-block rounded-full bg-[#f7e3df] px-2 py-0.5 text-[10px] font-semibold text-[var(--danger)]">{transaction.status === "failed" ? "Rejected" : transaction.status === "reversed" ? "Reversed" : "Zero amount"}</span> : null}
      {duplicate ? <span className="mt-1 ml-1 inline-block rounded-full bg-[var(--paper-deep)] px-2 py-0.5 text-[10px]">Duplicate copy</span> : null}
      {transaction.reimbursement_status && transaction.reimbursement_status !== "none" ? <span className="mt-1 ml-1 inline-block rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[10px]">Reimbursement {transaction.reimbursement_status}</span> : null}
    </td>
    <td className="px-4 py-3"><select aria-label={"Category for " + transaction.description} disabled={!live} value={transaction.category_id ?? ""} onChange={(event) => void saveCategory(transaction.id, event.target.value)} className="h-9 max-w-44 rounded-lg border border-[var(--line)] bg-white px-2 text-xs"><option value="">Uncategorized</option>{workspace.categories.filter((item) => item.kind === "expense").map((item) => <option key={item.id} value={item.id}>{item.parent_id ? "↳ " : ""}{item.name}</option>)}</select></td>
    <td className="px-4 py-3"><span className="block text-xs font-medium">{transaction.location_period?.location.country_name || transaction.merchant_country || "Not confirmed"}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{transaction.merchant_city || transaction.location_period?.period_type.replaceAll("_", " ") || "No location period"}</span></td>
    <td className={"whitespace-nowrap px-4 py-3 font-mono text-xs" + crossedClass}>{money(originalAmount.amount, originalAmount.currency)}</td>
    <td className="px-4 py-3"><span className={"block whitespace-nowrap font-mono text-xs" + crossedClass}>{reportingAmount == null ? "Not included" : money(reportingAmount, "USD")}</span><span className="mt-1 block max-w-48 text-[10px] leading-4 text-[var(--muted)]">{source}{transaction.reporting_value ? " · rate " + transaction.reporting_value.rate_to_reporting : ""}</span></td>
    <td className="px-4 py-3">{allocations.length ? allocations.map((allocation) => <span key={allocation.id} className="mb-1 block whitespace-nowrap text-xs">{allocation.service_month.slice(0, 7)} · {money(allocation.amount, allocation.currency)}{allocation.is_estimated ? " est." : ""}</span>) : <span className="text-xs text-[var(--muted)]">Same as payment month</span>}</td>
    <td className="px-4 py-3"><div className="flex gap-1"><button disabled={!live} onClick={() => void saveSplit(transaction.id, false)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] disabled:opacity-45">Personal</button><button disabled={!live} onClick={() => void saveSplit(transaction.id, true)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] disabled:opacity-45">50/50</button></div></td>
  </tr>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]> }) {
  return <label className="sr-only">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function date(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function money(value: string | number, currency: string) { try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); } catch { return currency + " " + Number(value).toLocaleString(); } }
function messageOf(error: unknown) { return error instanceof Error ? error.message : "The change could not be saved."; }
