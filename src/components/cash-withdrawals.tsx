"use client";

import { Banknote, CalendarDays } from "lucide-react";
import { useMemo } from "react";
import type { OpenTransactions } from "@/components/finance-ui-types";
import type { WorkspaceData } from "@/lib/workspace/demo";

export function CashWithdrawals({ workspace, openTransactions }: { workspace: WorkspaceData; openTransactions: OpenTransactions }) {
  const rows = useMemo(() => workspace.transactions.filter((transaction) => transaction.kind === "cash_withdrawal" && transaction.status === "posted" && Number(transaction.amount) !== 0 && transaction.metadata?.isDuplicate !== true), [workspace.transactions]);
  const range = { from: rows.at(-1)?.occurred_at.slice(0, 10) ?? `${workspace.asOfDate.slice(0, 4)}-01-01`, to: workspace.asOfDate };
  const totals = group(rows, (transaction) => transaction.currency).map(([currency, transactions]) => ({ currency, transactions, amount: transactions.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) }));
  const months = group(rows, (transaction) => transaction.occurred_at.slice(0, 7)).map(([month, transactions]) => ({ month, transactions, amount: transactions.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) })).sort((left, right) => right.month.localeCompare(left.month));
  const lastWithdrawal = [...rows].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0];
  const isActive = lastWithdrawal ? daysBetween(lastWithdrawal.occurred_at.slice(0, 10), workspace.asOfDate) <= 90 : false;

  return <section className="mt-7 space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="grid size-9 place-items-center rounded-xl bg-[#f3ead6] text-[#8a5a20]"><Banknote aria-hidden="true" className="size-4" /></span><p className="mt-4 text-sm text-[var(--muted)]">Cash withdrawn</p><div className="mt-2 space-y-1">{totals.map((total) => <button key={total.currency} onClick={() => openTransactions({ title: `${total.currency} cash withdrawals`, transactionIds: total.transactions.map((transaction) => transaction.id), range })} className="block font-mono text-2xl font-semibold">{money(total.amount, total.currency)}</button>)}{!totals.length ? <strong className="block text-2xl">—</strong> : null}</div></article>
      <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="grid size-9 place-items-center rounded-xl bg-[var(--forest-soft)] text-[var(--forest)]"><CalendarDays aria-hidden="true" className="size-4" /></span><p className="mt-4 text-sm text-[var(--muted)]">Last withdrawal</p><strong className="mt-2 block text-xl">{lastWithdrawal ? date(lastWithdrawal.occurred_at) : "None found"}</strong></article>
      <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted)]">Current status</p><strong className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm ${isActive ? "bg-[var(--amber-soft)] text-[#8a4b21]" : "bg-[var(--forest-soft)] text-[var(--forest)]"}`}>{isActive ? "Recent activity" : "Inactive"}</strong><p className="mt-3 text-xs leading-5 text-[var(--muted)]">Withdrawals stay outside card-spending totals because their final use is not known.</p></article>
    </div>

    <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Withdrawals by month</h2><p className="mt-1 text-sm text-[var(--muted)]">Open any month to see the exact imported transactions.</p><div className="mt-4 space-y-2">{months.map((month) => <button key={month.month} onClick={() => openTransactions({ title: `Cash withdrawals · ${formatMonth(month.month)}`, transactionIds: month.transactions.map((transaction) => transaction.id), range: { from: `${month.month}-01`, to: monthEnd(month.month) } })} className="flex w-full items-center justify-between rounded-xl bg-[var(--paper)] px-4 py-3 text-left"><span><strong className="block text-sm">{formatMonth(month.month)}</strong><span className="text-xs text-[var(--muted)]">{month.transactions.length} withdrawal{month.transactions.length === 1 ? "" : "s"}</span></span><strong className="font-mono text-sm">{sameCurrency(month.transactions) ? money(month.amount, month.transactions[0].currency) : "Multiple currencies"}</strong></button>)}{!months.length ? <p className="rounded-xl bg-[var(--paper)] p-5 text-sm text-[var(--muted)]">No cash withdrawals were found in the imported history.</p> : null}</div></article>
  </section>;
}

function group<T>(rows: T[], key: (row: T) => string) { const groups = new Map<string, T[]>(); for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]); return [...groups.entries()]; }
function sameCurrency(rows: Array<{ currency: string }>) { return new Set(rows.map((row) => row.currency)).size === 1; }
function date(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function formatMonth(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); }
function monthEnd(value: string) { return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10); }
function daysBetween(left: string, right: string) { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000); }
function money(value: number, currency: string) { try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); } catch { return `${currency} ${value.toLocaleString()}`; } }
