"use client";

import { AlertTriangle, ArrowUpRight, CalendarDays, CircleDollarSign, MapPin, ReceiptText, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { OpenTransactions } from "@/components/finance-ui-types";
import { buildSpendingReport, type SpendingGroup, type TraceableAmount } from "@/lib/reporting/report";
import { rangeForPreset, rangeLabel, type DatePreset, type DateRange } from "@/lib/reporting/periods";
import type { WorkspaceData, WorkspaceTransaction } from "@/lib/workspace/demo";

export function ReportingWorkspace({ workspace, loading, openTransactions, openQuestions, openLocations }: { workspace: WorkspaceData; loading: boolean; openTransactions: OpenTransactions; openQuestions: () => void; openLocations: () => void }) {
  const today = workspace.asOfDate;
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("ytd", today));
  const [basis, setBasis] = useState<"cash" | "normalized">("cash");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const report = useMemo(() => buildSpendingReport(workspace.transactions, range, today), [range, today, workspace.transactions]);
  const selectedCategory = report.categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedTotal = basis === "cash" ? report.total : report.normalizedTotal;
  const maxMonth = Math.max(1, ...report.monthly.map((month) => basis === "cash" ? month.amount : month.normalizedAmount));
  const maxCategory = Math.max(1, ...report.categories.map((category) => category.amount));

  const selectPreset = (value: Exclude<DatePreset, "custom">) => { setPreset(value); setRange(rangeForPreset(value, today)); };
  const open = (title: string, amount: TraceableAmount) => openTransactions({ title, transactionIds: amount.transactionIds, range: report.range });
  return <section className="mt-6 space-y-5">
    <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_16px_44px_rgba(37,45,42,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--paper)] p-1" aria-label="Reporting period">
          {([['current_month', 'Current month'], ['previous_month', 'Previous month'], ['ytd', 'Year to date']] as const).map(([value, label]) => <button key={value} onClick={() => selectPreset(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === value ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>{label}</button>)}
          <button onClick={() => setPreset("custom")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "custom" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Custom</button>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><CircleDollarSign aria-hidden="true" className="size-4 text-[var(--forest)]" />Reporting currency: <strong className="text-[var(--ink)]">USD</strong></div>
      </div>
      {preset === "custom" ? <div className="mt-4 flex flex-wrap gap-3"><DateField label="From" value={range.from} onChange={(from) => setRange((current) => ({ ...current, from }))} /><DateField label="To" value={range.to} max={today} onChange={(to) => setRange((current) => ({ ...current, to }))} /></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm"><p><strong>{rangeLabel(report.range)}</strong><span className="ml-2 text-[var(--muted)]">{report.transactionCount} included transactions</span></p><div className="flex rounded-xl border border-[var(--line)] p-1" aria-label="Reporting basis"><button onClick={() => setBasis("cash")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${basis === "cash" ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "text-[var(--muted)]"}`}>Actual cash flow</button><button onClick={() => setBasis("normalized")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${basis === "normalized" ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "text-[var(--muted)]"}`}>Monthly normalized cost</button></div></div>
    </div>

    {workspace.mode !== "live" ? <div className="rounded-xl border border-[#e3bf9f] bg-[#fbefe4] px-4 py-3 text-sm text-[#74411f]"><strong>Example data.</strong> The visible USD 11,824.42 is now fully backed by the example transactions below. Connect Supabase to replace it with imported data.</div> : null}
    {report.missingFxTransactionIds.length ? <button onClick={() => openTransactions({ title: "Transactions missing a USD conversion", transactionIds: report.missingFxTransactionIds, range: report.range })} className="flex w-full items-start gap-3 rounded-xl border border-[#e3bf9f] bg-[#fbefe4] px-4 py-3 text-left text-sm text-[#74411f]"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span><strong>{report.missingFxTransactionIds.length} transactions are excluded from the USD total.</strong> No historical exchange rate has been confirmed for them. Open the exact transactions.</span></button> : null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricButton label={basis === "cash" ? "Cash spending" : "Monthly normalized cost"} value={loading ? "Loading…" : money(selectedTotal.amount)} note={`${rangeLabel(report.range)} · ${selectedTotal.transactionIds.length} transactions`} icon={ArrowUpRight} tone="amber" onClick={() => open(basis === "cash" ? "Cash spending" : "Monthly normalized cost", selectedTotal)} />
      <MetricButton label="Average per completed month" value={money(report.completedAverage.amount)} note={`${report.completedAverage.monthCount} complete month${report.completedAverage.monthCount === 1 ? "" : "s"}; current month excluded`} icon={CalendarDays} tone="green" onClick={() => open("Transactions in completed months", report.completedAverage)} />
      <MetricButton label="Current partial month" value={money(report.currentPartial.amount)} note={`${formatMonth(report.currentPartial.month)} through ${today} · ${report.currentPartial.transactionIds.length} transactions`} icon={ReceiptText} tone="plain" onClick={() => open("Current partial month", report.currentPartial)} />
      <MetricButton label="Data quality" value={`${workspace.dataQuality.score}%`} note={`${workspace.dataQuality.uncategorized + workspace.dataQuality.unansweredQuestions + report.missingFxTransactionIds.length} items need review`} icon={Sparkles} tone="plain" onClick={openQuestions} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><Heading title="Monthly breakdown" subtitle={basis === "cash" ? "When money left your accounts" : "Which service month the cost belongs to"} /><div className="mt-6 flex h-56 items-end gap-2" aria-label="Monthly spending chart">{report.monthly.map((month) => { const amount = basis === "cash" ? month.amount : month.normalizedAmount; const ids = basis === "cash" ? month.transactionIds : month.normalizedTransactionIds; return <button key={month.month} onClick={() => openTransactions({ title: `${formatMonth(month.month)} ${basis === "cash" ? "cash spending" : "normalized cost"}`, transactionIds: ids, range: report.range })} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" aria-label={`Open ${formatMonth(month.month)} transactions`}><span className="hidden text-[10px] font-semibold text-[var(--muted)] sm:block">{compactMoney(amount)}</span><span className={`w-full rounded-t-lg transition group-hover:opacity-75 ${month.isCurrentPartial ? "bg-[var(--amber)]" : "bg-[var(--forest)]"}`} style={{ height: `${Math.max(4, amount / maxMonth * 160)}px` }} /><span className="text-[10px] uppercase text-[var(--muted)]">{month.month.slice(5)}{month.isCurrentPartial ? "*" : ""}</span></button>; })}</div><p className="mt-3 text-xs text-[var(--muted)]">* Current month is partial and is never used in the completed-month average.</p></article>
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><Heading title="Spending by category" subtitle="Choose a colored category to see merchants and transactions below" /><div className="mt-4 flex flex-wrap gap-2">{report.categories.slice(0, 14).map((category) => <button key={"tab-" + category.id} onClick={() => setSelectedCategoryId(category.id)} aria-pressed={selectedCategoryId === category.id} className="rounded-full border px-3 py-1.5 text-xs font-semibold transition" style={{ borderColor: category.color, backgroundColor: selectedCategoryId === category.id ? category.color : category.color + "18", color: selectedCategoryId === category.id ? "#fff" : category.color }}>{category.name}</button>)}</div><div className="mt-6 space-y-3">{report.categories.slice(0, 10).map((category) => <button key={category.id} onClick={() => setSelectedCategoryId(category.id)} className="block w-full text-left"><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span><span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: category.color }} />{category.name}<span className="ml-2 text-xs text-[var(--muted)]">{category.detail}</span></span><strong className="font-mono text-xs">{money(category.amount)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.abs(category.amount) / maxCategory * 100)}%`, backgroundColor: category.color }} /></div></button>)}</div></article>
    </div>

    {selectedCategory ? <CategoryDetail category={selectedCategory} workspace={workspace} range={report.range} openTransactions={openTransactions} close={() => setSelectedCategoryId(null)} /> : null}

    <div className="grid gap-5 lg:grid-cols-3">
      <SplitCard title="Life expenses" left={{ label: "Essential", ...report.essential }} right={{ label: "Flexible", ...report.flexible }} range={report.range} openTransactions={openTransactions} />
      <SplitCard title="Personal and shared" left={{ label: "Personal", ...report.personal }} right={{ label: "Household", ...report.household }} range={report.range} openTransactions={openTransactions} />
      <button onClick={() => open("Flights and extraordinary costs", report.extraordinary)} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left"><p className="text-sm font-semibold">Flights and extraordinary costs</p><p className="mt-3 text-2xl font-semibold">{money(report.extraordinary.amount)}</p><p className="mt-1 text-xs text-[var(--muted)]">Excluded from normal location averages · {report.extraordinary.transactionIds.length} transactions</p></button>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start justify-between gap-3"><Heading title="Spending by confirmed location" subtitle="Full-month averages exclude partial months and extraordinary travel" /><button onClick={openLocations} className="text-xs font-semibold text-[var(--forest)]">Manage stays</button></div><div className="mt-4 space-y-3">{report.locations.map((location) => <LocationComparison key={location.id} group={location} workspace={workspace} range={report.range} today={today} openTransactions={openTransactions} />)}</div></article>
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><Heading title="Insights" subtitle="Every observation opens its supporting transactions" /><div className="mt-4 space-y-2">{workspace.insights.slice(0, 5).map((insight) => <button key={insight.key} onClick={() => openTransactions({ title: insight.title, transactionIds: insight.transactionIds, range: report.range })} className="block w-full rounded-xl border border-[var(--line)] p-3 text-left"><strong className="text-sm">{insight.title}</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{insight.body}</span></button>)}{!workspace.insights.length ? <p className="rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">Insights will appear as repeat patterns and unusual expenses become clear.</p> : null}</div></article>
    </div>

    <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><Heading title="Top merchants and providers" subtitle="Visits, average per visit, location, and exact transactions" /><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{report.merchants.slice(0, 12).map((merchant) => <button key={merchant.id} onClick={() => openTransactions({ title: merchant.name, transactionIds: merchant.transactionIds, range: report.range })} className="rounded-xl bg-[var(--paper)] p-3 text-left"><span className="block truncate text-sm font-semibold">{merchant.name}</span><span className="mt-1 block text-xs text-[var(--muted)]">{merchant.visits} visit{merchant.visits === 1 ? "" : "s"} · {money(merchant.averagePerVisit)} average</span><span className="mt-2 block font-mono text-sm">{money(merchant.amount)}</span></button>)}</div></article>
  </section>;
}

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-[var(--muted)]">{label}<input type="date" value={value} max={max} onChange={(event) => onChange(event.target.value)} className="ml-2 h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" /></label>; }
function Heading({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p></div>; }
function CategoryDetail({ category, workspace, range, openTransactions, close }: { category: SpendingGroup; workspace: WorkspaceData; range: DateRange; openTransactions: OpenTransactions; close: () => void }) {
  const rows = workspace.transactions.filter((transaction) => category.transactionIds.includes(transaction.id)).sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
  const merchants = categoryMerchants(rows);
  return <article className="overflow-hidden rounded-[22px] border bg-[var(--surface)]" style={{ borderColor: category.color }}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: category.color }}>{category.name}</p><h2 className="mt-1 text-xl font-semibold">{money(category.amount)} across {category.transactionIds.length} transactions</h2><p className="mt-1 text-sm text-[var(--muted)]">Merchant totals first, followed by every underlying transaction.</p></div><div className="flex gap-2"><button onClick={() => openTransactions({ title: category.name + " spending", transactionIds: category.transactionIds, range })} className="rounded-xl px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: category.color }}>Open all in Transactions</button><button onClick={close} aria-label={"Close " + category.name + " detail"} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold">Close</button></div></div>
    <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-4">{merchants.map((merchant) => <button key={merchant.key} onClick={() => openTransactions({ title: category.name + " · " + merchant.name, transactionIds: merchant.transactionIds, range })} className="rounded-xl bg-[var(--paper)] p-3 text-left"><strong className="block truncate text-sm">{merchant.name}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{merchant.visits} visit{merchant.visits === 1 ? "" : "s"} · {money(merchant.average)}</span><span className="mt-2 block font-mono text-sm">{money(merchant.amount)}</span></button>)}</div>
    <div className="overflow-x-auto border-t border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--paper)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Merchant</th><th className="px-4 py-3">Original</th><th className="px-4 py-3">USD</th><th className="px-4 py-3">Location</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((transaction) => <tr key={transaction.id}><td className="whitespace-nowrap px-4 py-3">{transaction.occurred_at.slice(0, 10)}</td><td className="px-4 py-3"><strong className="block">{transaction.merchant_name || transaction.description}</strong><span className="text-xs text-[var(--muted)]">{transaction.account?.name}</span></td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{originalMoney(transaction)}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{usdValue(transaction) == null ? "Rate needed" : money(usdValue(transaction) ?? 0)}</td><td className="px-4 py-3 text-xs">{transaction.location_period?.location.country_name || transaction.merchant_country || "Not confirmed"}</td></tr>)}</tbody></table></div>
  </article>;
}

function categoryMerchants(rows: WorkspaceTransaction[]) {
  const groups = new Map<string, { key: string; name: string; amount: number; transactionIds: string[]; dates: Set<string> }>();
  for (const transaction of rows) {
    const key = transaction.merchant_key || transaction.merchant_name || transaction.description;
    const group = groups.get(key) ?? { key, name: transaction.merchant_name || transaction.description, amount: 0, transactionIds: [], dates: new Set<string>() };
    group.amount += usdValue(transaction) ?? 0;
    group.transactionIds.push(transaction.id);
    group.dates.add(transaction.occurred_at.slice(0, 10));
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, visits: group.dates.size, average: group.dates.size ? group.amount / group.dates.size : 0 })).sort((left, right) => right.amount - left.amount);
}

function usdValue(transaction: WorkspaceTransaction) {
  if (transaction.status !== "posted" || transaction.metadata?.isDuplicate === true) return 0;
  const fee = Math.abs(Number(transaction.fee_amount || 0));
  if (transaction.excluded_from_totals && fee > 0 && transaction.currency === "USD") return fee;
  if (transaction.excluded_from_totals) return 0;
  if (!["expense", "fee", "tax", "refund"].includes(transaction.kind)) return 0;
  const direction = transaction.kind === "refund" ? -1 : 1;
  if (transaction.currency === "USD") return Math.abs(Number(transaction.amount)) * direction;
  return transaction.reporting_value ? Math.abs(Number(transaction.reporting_value.reporting_amount)) * direction : null;
}
function originalMoney(transaction: WorkspaceTransaction) { const amount = transaction.original_amount ?? transaction.amount; const currency = transaction.original_currency ?? transaction.currency; try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount)); } catch { return currency + " " + Number(amount).toLocaleString(); } }
function MetricButton({ label, value, note, icon: Icon, tone, onClick }: { label: string; value: string; note: string; icon: typeof ArrowUpRight; tone: "green" | "amber" | "plain"; onClick: () => void }) { const color = tone === "green" ? "bg-[var(--forest-soft)] text-[var(--forest)]" : tone === "amber" ? "bg-[var(--amber-soft)] text-[var(--amber)]" : "bg-[var(--paper-deep)] text-[var(--muted)]"; return <button onClick={onClick} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left shadow-[0_12px_34px_rgba(37,45,42,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--forest)]"><span className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-[var(--muted)]">{label}</span><span className={`grid size-8 place-items-center rounded-xl ${color}`}><Icon aria-hidden="true" className="size-4" /></span></span><strong className="mt-4 block text-2xl tracking-[-0.04em]">{value}</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{note}</span></button>; }
function SplitCard({ title, left, right, range, openTransactions }: { title: string; left: TraceableAmount & { label: string }; right: TraceableAmount & { label: string }; range: DateRange; openTransactions: OpenTransactions }) { return <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 grid grid-cols-2 gap-3">{[left, right].map((item) => <button key={item.label} onClick={() => openTransactions({ title: item.label, transactionIds: item.transactionIds, range })} className="rounded-xl bg-[var(--paper)] p-3 text-left"><span className="text-xs text-[var(--muted)]">{item.label}</span><strong className="mt-1 block text-sm">{money(item.amount)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{item.transactionIds.length} transactions</span></button>)}</div></article>; }
function LocationComparison({ group, workspace, range, today, openTransactions }: { group: SpendingGroup; workspace: WorkspaceData; range: DateRange; today: string; openTransactions: OpenTransactions }) {
  const period = workspace.locationPeriods.find((item) => item.id === group.id);
  const from = later(range.from, period?.starts_on ?? range.from);
  const to = earlier(range.to, period?.ends_on ?? range.to);
  const rows = workspace.transactions.filter((transaction) => group.transactionIds.includes(transaction.id));
  const detail = buildSpendingReport(rows, { from, to }, today);
  const complete = detail.monthly.filter((month) => isFullMonth(month.month, from, to, today));
  const completeAmount = complete.reduce((sum, month) => sum + month.amount, 0);
  const completeIds = [...new Set(complete.flatMap((month) => month.transactionIds))];
  const partial = detail.monthly.filter((month) => !isFullMonth(month.month, from, to, today));
  const partialAmount = partial.reduce((sum, month) => sum + month.amount, 0);
  const partialIds = [...new Set(partial.flatMap((month) => month.transactionIds))];
  const normal = { amount: detail.total.amount - detail.extraordinary.amount, transactionIds: detail.total.transactionIds.filter((id) => !detail.extraordinary.transactionIds.includes(id)) };
  return <div className="rounded-xl bg-[var(--paper)] p-3"><button onClick={() => openTransactions({ title: `${group.name} spending`, transactionIds: group.transactionIds, range })} className="flex w-full items-center gap-3 text-left"><MapPin aria-hidden="true" className="size-4 shrink-0 text-[var(--forest)]" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{group.name}</strong><span className="text-[10px] text-[var(--muted)]">{from} to {to} · {group.transactionIds.length} transactions · {detail.originalCurrencies.map((item) => item.currency).join(", ") || "USD"}</span></span><strong className="font-mono text-sm">{money(group.amount)}</strong></button><div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3 text-left sm:grid-cols-4"><LocationMetric label="Normal living cost" value={normal.amount} count={normal.transactionIds.length} onClick={() => openTransactions({ title: `${group.name} normal living cost`, transactionIds: normal.transactionIds, range })} /><LocationMetric label="Avg. full month" value={complete.length ? completeAmount / complete.length : 0} count={completeIds.length} note={`${complete.length} full month${complete.length === 1 ? "" : "s"}`} onClick={() => openTransactions({ title: `${group.name} full months`, transactionIds: completeIds, range })} /><LocationMetric label="Partial months" value={partialAmount} count={partialIds.length} onClick={() => openTransactions({ title: `${group.name} partial months`, transactionIds: partialIds, range })} /><LocationMetric label="Flights / extraordinary" value={detail.extraordinary.amount} count={detail.extraordinary.transactionIds.length} onClick={() => openTransactions({ title: `${group.name} extraordinary costs`, transactionIds: detail.extraordinary.transactionIds, range })} /></div><div className="mt-2 flex flex-wrap gap-1">{detail.categories.slice(0, 6).map((category) => <button key={category.id} onClick={() => openTransactions({ title: `${group.name} · ${category.name}`, transactionIds: category.transactionIds, range })} className="rounded-full border border-[var(--line)] bg-white px-2 py-1 text-[10px] font-semibold">{category.name} {money(category.amount)}</button>)}</div></div>;
}
function LocationMetric({ label, value, count, note, onClick }: { label: string; value: number; count: number; note?: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-lg bg-white p-2 text-left"><span className="block text-[10px] text-[var(--muted)]">{label}</span><strong className="mt-1 block text-xs">{money(value)}</strong><span className="text-[9px] text-[var(--muted)]">{note ?? `${count} transaction${count === 1 ? "" : "s"}`}</span></button>; }
function isFullMonth(month: string, from: string, to: string, today: string) { const first = `${month}-01`; const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10); return from <= first && to >= last && last < today; }
function later(left: string, right: string) { return left > right ? left : right; }
function earlier(left: string, right: string) { return left < right ? left : right; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function compactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}$${trimDecimal(absolute / 1_000_000)}M`;
  if (absolute >= 1_000) return `${sign}$${trimDecimal(absolute / 1_000)}K`;
  return `${sign}$${Math.round(absolute)}`;
}
function trimDecimal(value: number) { return value.toFixed(1).replace(/\.0$/, ""); }
function formatMonth(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }); }
