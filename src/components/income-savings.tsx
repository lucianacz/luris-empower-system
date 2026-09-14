"use client";

import { ArrowDownRight, CalendarDays, CircleDollarSign, PiggyBank, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { OpenTransactions } from "@/components/finance-ui-types";
import { buildSpendingReport } from "@/lib/reporting/report";
import { rangeForPreset, rangeLabel, type DatePreset, type DateRange } from "@/lib/reporting/periods";
import type { WorkspaceData, WorkspaceTransaction } from "@/lib/workspace/demo";

export function IncomeSavings({ workspace, openTransactions }: { workspace: WorkspaceData; openTransactions: OpenTransactions }) {
  const today = workspace.asOfDate;
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("ytd", today));
  const rows = useMemo(() => workspace.transactions.filter((transaction) => isIncome(transaction) && inRange(transaction.occurred_at, range)), [range, workspace.transactions]);
  const spending = useMemo(() => buildSpendingReport(workspace.transactions, range, today), [range, today, workspace.transactions]);
  const totalIncome = rows.reduce((sum, transaction) => sum + (usdIncome(transaction) ?? 0), 0);
  const missingFx = rows.filter((transaction) => usdIncome(transaction) == null);
  const estimatedSavings = totalIncome - spending.total.amount;
  const savingsRate = totalIncome > 0 ? estimatedSavings / totalIncome : 0;
  const completedMonths = monthsBetween(range.from, range.to).filter((month) => month < today.slice(0, 7));
  const investmentContributions = workspace.investmentTransactions.filter((transaction) => transaction.transaction_type === "deposit" && inRange(transaction.occurred_at, range) && transaction.currency === "USD").reduce((sum, transaction) => sum + Number(transaction.gross_amount), 0);
  const payers = groupIncome(rows);

  const selectPreset = (value: Exclude<DatePreset, "custom">) => { setPreset(value); setRange(rangeForPreset(value, today)); };
  return <section className="mt-6 space-y-5">
    <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1 rounded-xl bg-[var(--paper)] p-1">{([['current_month', 'Current month'], ['previous_month', 'Previous month'], ['ytd', 'Year to date']] as const).map(([value, label]) => <button key={value} onClick={() => selectPreset(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === value ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>{label}</button>)}<button onClick={() => setPreset("custom")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "custom" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Custom</button></div><span className="text-xs font-semibold text-[var(--muted)]">Reporting currency: <strong className="text-[var(--ink)]">USD</strong></span></div>{preset === "custom" ? <div className="mt-4 flex flex-wrap gap-3"><DateField label="From" value={range.from} max={today} onChange={(from) => setRange((current) => ({ ...current, from }))} /><DateField label="To" value={range.to} max={today} onChange={(to) => setRange((current) => ({ ...current, to }))} /></div> : null}<p className="mt-4 border-t border-[var(--line)] pt-4 text-sm"><strong>{rangeLabel(range)}</strong><span className="ml-2 text-[var(--muted)]">{rows.length} income transactions</span></p></article>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Income received" value={money(totalIncome)} note={`${rows.length} traceable payments`} icon={CircleDollarSign} onClick={() => openTransactions({ title: "Income received", transactionIds: rows.map((row) => row.id), range })} />
      <Metric label="Living spending" value={money(spending.total.amount)} note={`${spending.total.transactionIds.length} purchases, fees, and taxes`} icon={ArrowDownRight} onClick={() => openTransactions({ title: "Spending used for savings estimate", transactionIds: spending.total.transactionIds, range })} />
      <Metric label="Approx. saved" value={money(estimatedSavings)} note={`${Math.round(savingsRate * 100)}% of known income · transfers excluded`} icon={PiggyBank} onClick={() => openTransactions({ title: "Income and spending behind estimated savings", transactionIds: [...rows.map((row) => row.id), ...spending.total.transactionIds], range })} />
      <Metric label="Avg. income / completed month" value={money(completedMonths.length ? totalIncome / completedMonths.length : totalIncome)} note={`${completedMonths.length} completed month${completedMonths.length === 1 ? "" : "s"}; current partial month separate`} icon={CalendarDays} onClick={() => openTransactions({ title: "Income in selected period", transactionIds: rows.map((row) => row.id), range })} />
    </div>

    {missingFx.length ? <button onClick={() => openTransactions({ title: "Income missing USD conversion", transactionIds: missingFx.map((row) => row.id), range })} className="w-full rounded-xl border border-[#e3bf9f] bg-[#fbefe4] px-4 py-3 text-left text-sm text-[#74411f]"><strong>{missingFx.length} income transactions are not included yet</strong> because no historical USD conversion is available.</button> : null}

    <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Who paid you</h2><p className="mt-1 text-sm text-[var(--muted)]">Every payer opens the exact source transactions.</p><div className="mt-4 space-y-2">{payers.map((payer) => <button key={payer.key} onClick={() => openTransactions({ title: `Income · ${payer.name}`, transactionIds: payer.transactionIds, range })} className="flex w-full items-center justify-between gap-4 rounded-xl bg-[var(--paper)] p-3 text-left"><span><strong className="block text-sm">{payer.name}</strong><span className="text-xs text-[var(--muted)]">{payer.transactionIds.length} payment{payer.transactionIds.length === 1 ? "" : "s"}</span></span><strong className="font-mono text-sm">{money(payer.amount)}</strong></button>)}{!payers.length ? <p className="rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">No income is recorded in this period.</p> : null}</div></article>
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="grid size-10 place-items-center rounded-xl bg-[var(--forest-soft)] text-[var(--forest)]"><TrendingUp aria-hidden="true" className="size-5" /></span><h2 className="mt-4 font-semibold">Where the surplus went</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Approximate savings are income minus genuine spending. Moving money between Deel, ARQ, Brubank, cash, or investments does not reduce savings; only fees do.</p><div className="mt-4 rounded-xl bg-[var(--paper)] p-4"><span className="text-xs text-[var(--muted)]">Known investment contributions in this period</span><strong className="mt-1 block text-xl">{money(investmentContributions)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">Shown as allocation of savings, not counted again as spending.</span></div><p className="mt-3 text-xs leading-5 text-[var(--muted)]">Satu Lagi Villa will appear here after the Deel/Wise statement containing the large 2025 transfers is imported.</p></article>
    </div>
  </section>;
}

function isIncome(transaction: WorkspaceTransaction) { return transaction.status === "posted" && transaction.metadata?.isDuplicate !== true && !transaction.excluded_from_totals && transaction.kind === "income" && Number(transaction.amount) > 0; }
function usdIncome(transaction: WorkspaceTransaction) { if (transaction.currency === "USD") return Number(transaction.amount); return transaction.reporting_value?.reporting_currency === "USD" ? Math.abs(Number(transaction.reporting_value.reporting_amount)) : null; }
function inRange(value: string, range: DateRange) { const date = value.slice(0, 10); return date >= range.from && date <= range.to; }
function groupIncome(rows: WorkspaceTransaction[]) { const groups = new Map<string, { key: string; name: string; amount: number; transactionIds: string[] }>(); for (const row of rows) { const key = row.merchant_key || row.merchant_name || row.description; const group = groups.get(key) ?? { key, name: row.merchant_name || row.description, amount: 0, transactionIds: [] }; group.amount += usdIncome(row) ?? 0; group.transactionIds.push(row.id); groups.set(key, group); } return [...groups.values()].sort((left, right) => right.amount - left.amount); }
function monthsBetween(from: string, to: string) { const months: string[] = []; const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`); while (cursor <= end) { months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); } return months; }
function Metric({ label, value, note, icon: Icon, onClick }: { label: string; value: string; note: string; icon: typeof CircleDollarSign; onClick: () => void }) { return <button onClick={onClick} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left"><span className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-[var(--muted)]">{label}</span><Icon aria-hidden="true" className="size-4 text-[var(--forest)]" /></span><strong className="mt-4 block text-2xl">{value}</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{note}</span></button>; }
function DateField({ label, value, max, onChange }: { label: string; value: string; max: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-[var(--muted)]">{label}<input type="date" value={value} max={max} onChange={(event) => event.target.value && onChange(event.target.value)} className="ml-2 h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm" /></label>; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
