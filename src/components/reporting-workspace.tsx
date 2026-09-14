"use client";

import { AlertTriangle, ArrowLeftRight, CircleDollarSign, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import type { OpenTransactions } from "@/components/finance-ui-types";
import type { MoneyView } from "@/components/empower-dashboard";
import { isLocationIndependentCategory } from "@/lib/locations/attribution";
import { compareSpendingCategories, percentageChange, type SpendingCategoryComparison } from "@/lib/reporting/comparison";
import { categoryExplorerPresets, categoryIdsForPreset, summarizeCategorySelection } from "@/lib/reporting/category-explorer";
import { buildSpendingReport, type SpendingGroup, type SpendingReport, type TraceableAmount } from "@/lib/reporting/report";
import { previousComparableRange, rangeForMonth, rangeForPreset, rangeLabel, type DatePreset, type DateRange } from "@/lib/reporting/periods";
import type { WorkspaceData, WorkspaceTransaction } from "@/lib/workspace/demo";

export function ReportingWorkspace({ workspace, moneyView, openTransactions, openLocations }: { workspace: WorkspaceData; moneyView: MoneyView; openTransactions: OpenTransactions; openLocations: () => void }) {
  const today = workspace.asOfDate;
  const availableMonths = useMemo(() => [...new Set(workspace.transactions.map((transaction) => transaction.occurred_at.slice(0, 7)))].sort().reverse(), [workspace.transactions]);
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("ytd", today));
  const [customMonth, setCustomMonth] = useState(today.slice(0, 7));
  const [scope, setScope] = useState<"all" | "personal" | "shared">("all");
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonRange, setComparisonRange] = useState<DateRange>(() => previousComparableRange(rangeForPreset("ytd", today)));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [explorerCategoryIds, setExplorerCategoryIds] = useState<string[]>([]);
  const reportingTransactions = useMemo(() => moneyView === "shared" || scope === "all" ? workspace.transactions : workspace.transactions.filter((transaction) => (transaction.beneficiary_scope ?? "personal") === scope), [moneyView, scope, workspace.transactions]);
  const report = useMemo(() => buildSpendingReport(reportingTransactions, range, today), [range, reportingTransactions, today]);
  const profileReport = useMemo(() => buildSpendingReport(workspace.transactions, range, today), [range, today, workspace.transactions]);
  const lucianaPaidReport = useMemo(() => buildSpendingReport(workspace.transactions.filter((transaction) => (transaction.paid_by?.role ?? transaction.account_owner?.role) === "self"), range, today), [range, today, workspace.transactions]);
  const julianPaidReport = useMemo(() => buildSpendingReport(workspace.transactions.filter((transaction) => (transaction.paid_by?.role ?? transaction.account_owner?.role) === "partner"), range, today), [range, today, workspace.transactions]);
  const incomeReceived = useMemo(() => incomeInRange(workspace.transactions, range), [range, workspace.transactions]);
  const sharedFlights = profileReport.categories.find((category) => category.name === "Flights") ?? { amount: 0, transactionIds: [] };
  const comparisonReport = useMemo(() => buildSpendingReport(reportingTransactions, comparisonRange, today), [comparisonRange, reportingTransactions, today]);
  const categoryComparison = useMemo(() => compareSpendingCategories(report, comparisonReport), [comparisonReport, report]);
  const categoryTabs = report.categories.filter((category) => category.transactionIds.length > 0 && category.amount !== 0);
  const selectedCategory = categoryTabs.find((category) => category.id === selectedCategoryId) ?? null;
  const explorerSummary = useMemo(() => summarizeCategorySelection(categoryTabs, explorerCategoryIds), [categoryTabs, explorerCategoryIds]);
  const explorerCategoryNames = categoryTabs.filter((category) => explorerCategoryIds.includes(category.id)).map((category) => category.name);
  const maxMonth = Math.max(1, ...report.monthly.map((month) => month.amount));
  const maxCategory = Math.max(1, ...report.categories.map((category) => category.amount));
  const workTripRows = useMemo(() => {
    const workCountries = new Set(workspace.locationPeriods.filter((period) => period.status === "confirmed" && period.trip_purpose?.toLocaleLowerCase().includes("work")).map((period) => period.location.country_code).filter(Boolean));
    return reportingTransactions.filter((transaction) => !isLocationIndependentCategory(transaction.category?.name) && (transaction.location_period?.status === "confirmed" && transaction.location_period.trip_purpose?.toLocaleLowerCase().includes("work") || Boolean(transaction.travel_destination && workCountries.has(transaction.travel_destination))));
  }, [reportingTransactions, workspace.locationPeriods]);
  const workTrips = useMemo(() => buildSpendingReport(workTripRows, range, today), [range, today, workTripRows]);

  const updatePrimaryRange = (next: DateRange) => {
    setRange(next);
    setComparisonRange(previousComparableRange(next));
  };
  const selectPreset = (value: Exclude<DatePreset, "custom" | "custom_month">) => { setPreset(value); updatePrimaryRange(rangeForPreset(value, today)); };
  const selectCustomMonth = (month: string) => {
    setCustomMonth(month);
    setPreset("custom_month");
    updatePrimaryRange(rangeForMonth(month, today));
    setSelectedCategoryId(null);
  };
  const selectMonth = (month: string) => {
    selectCustomMonth(month);
  };
  const updateComparisonPrimary = (next: DateRange) => {
    setPreset("custom");
    setRange(next);
  };
  const swapComparisonRanges = () => {
    setRange(comparisonRange);
    setComparisonRange(range);
    setPreset("custom");
  };
  const selectCategoryPreset = (key: string) => setExplorerCategoryIds(categoryIdsForPreset(categoryTabs, key));
  const toggleExplorerCategory = (categoryId: string) => setExplorerCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);
  const open = (title: string, amount: TraceableAmount) => openTransactions({ title, transactionIds: amount.transactionIds, range: report.range });
  return <section className="mt-6 space-y-5">
    <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_16px_44px_rgba(37,45,42,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[var(--paper)] p-1" aria-label="Reporting period">
          <button onClick={() => selectPreset("current_month")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "current_month" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Current month</button>
          <label className={`flex items-center rounded-lg px-2 text-xs font-semibold ${preset === "custom_month" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}><span className="sr-only">Custom month</span><select aria-label="Custom month" value={customMonth} onChange={(event) => selectCustomMonth(event.target.value)} onClick={() => { if (preset !== "custom_month") selectCustomMonth(customMonth); }} className="h-8 bg-transparent pr-1 font-semibold outline-none"><option value={customMonth}>Custom month · {formatMonth(customMonth)}</option>{availableMonths.filter((month) => month !== customMonth).map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}</select></label>
          <button onClick={() => selectPreset("ytd")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "ytd" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Year to date</button>
          <button onClick={() => selectPreset("last_year")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "last_year" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Last year</button>
          <button onClick={() => selectPreset("all_records")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "all_records" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>All records</button>
          <button onClick={() => setPreset("custom")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${preset === "custom" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>Custom dates</button>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><CircleDollarSign aria-hidden="true" className="size-4 text-[var(--forest)]" />Reporting currency: <strong className="text-[var(--ink)]">USD</strong></div>
      </div>
      {preset === "custom" ? <div className="mt-4 flex flex-wrap gap-3"><DateField label="From" value={range.from} onChange={(from) => updatePrimaryRange({ ...range, from })} /><DateField label="To" value={range.to} max={today} onChange={(to) => updatePrimaryRange({ ...range, to })} /></div> : null}
      {moneyView !== "shared" ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-white p-2" aria-label="Personal or shared spending"><span className="px-2 text-xs font-semibold text-[var(--muted)]">What did {moneyView === "luciana" ? "Luciana" : "Julian"} pay?</span>{([['all', 'All spending paid'], ['personal', 'Personal only'], ['shared', 'Shared household only']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setScope(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${scope === value ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "text-[var(--muted)]"}`}>{label}</button>)}</div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm"><p><strong>{rangeLabel(report.range)}</strong><span className="ml-2 text-[var(--muted)]">{report.transactionCount} included transactions</span></p><button type="button" onClick={() => setComparisonEnabled((current) => !current)} aria-pressed={comparisonEnabled} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${comparisonEnabled ? "border-[var(--forest)] bg-[var(--forest)] text-white" : "border-[var(--line)] text-[var(--forest)]"}`}><ArrowLeftRight aria-hidden="true" className="size-3.5" />Compare periods</button></div>
      {comparisonEnabled ? <div className="mt-4 grid gap-3 rounded-xl bg-[var(--paper)] p-3 lg:grid-cols-2"><div className="rounded-xl border border-[var(--forest)] bg-white p-3"><span className="mb-3 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--forest)]">Period A · primary</span><div className="flex flex-wrap gap-3"><DateField label="From" value={range.from} max={today} onChange={(from) => updateComparisonPrimary({ ...range, from })} /><DateField label="To" value={range.to} max={today} onChange={(to) => updateComparisonPrimary({ ...range, to })} /></div></div><div className="rounded-xl border border-[var(--line)] bg-white p-3"><span className="mb-3 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Period B · compare against</span><div className="flex flex-wrap gap-3"><DateField label="From" value={comparisonRange.from} max={today} onChange={(from) => setComparisonRange((current) => ({ ...current, from }))} /><DateField label="To" value={comparisonRange.to} max={today} onChange={(to) => setComparisonRange((current) => ({ ...current, to }))} /></div></div><div className="flex flex-wrap gap-2 lg:col-span-2"><button type="button" onClick={() => setComparisonRange(previousComparableRange(report.range))} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--forest)]">Use previous equal period for B</button><button type="button" onClick={swapComparisonRanges} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--forest)]">Swap A and B</button></div></div> : null}
    </div>

    {workspace.mode !== "live" ? <div className="rounded-xl border border-[#e3bf9f] bg-[#fbefe4] px-4 py-3 text-sm text-[#74411f]"><strong>No financial data loaded.</strong> Sign in to open your private imported transactions.</div> : null}
    {report.missingFxTransactionIds.length ? <button onClick={() => openTransactions({ title: "Transactions missing a USD conversion", transactionIds: report.missingFxTransactionIds, range: report.range })} className="flex w-full items-start gap-3 rounded-xl border border-[#e3bf9f] bg-[#fbefe4] px-4 py-3 text-left text-sm text-[#74411f]"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span><strong>{report.missingFxTransactionIds.length} transactions are excluded from the USD total.</strong> No historical exchange rate has been confirmed for them. Open the exact transactions.</span></button> : null}

    <article className="rounded-[22px] border border-[var(--forest)] bg-[linear-gradient(135deg,var(--forest-soft),var(--surface)_58%)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">Financial profile overview</p><h2 className="mt-1 text-xl font-semibold">{profileName(moneyView)}</h2></div><p className="text-xs text-[var(--muted)]">USD · {rangeLabel(profileReport.range)} · click any number for its transactions</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {moneyView === "shared" ? <>
          <OverviewMetric label="Household spending" amount={profileReport.total} onClick={() => openTransactions({ title: "Shared household spending", transactionIds: profileReport.total.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Paid by Luciana" amount={lucianaPaidReport.total} onClick={() => openTransactions({ title: "Shared spending paid by Luciana", transactionIds: lucianaPaidReport.total.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Paid by Julian" amount={julianPaidReport.total} onClick={() => openTransactions({ title: "Shared spending paid by Julian", transactionIds: julianPaidReport.total.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Shared flights" amount={sharedFlights} onClick={() => openTransactions({ title: "Shared flights", transactionIds: sharedFlights.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Average / completed month" amount={profileReport.completedAverage} note={`${profileReport.completedAverage.monthCount} completed months`} onClick={() => openTransactions({ title: "Shared spending in completed months", transactionIds: profileReport.completedAverage.transactionIds, range: profileReport.range })} />
        </> : <>
          <OverviewMetric label={`Paid by ${moneyView === "luciana" ? "Luciana" : "Julian"}`} amount={profileReport.total} onClick={() => openTransactions({ title: "All spending paid from this profile", transactionIds: profileReport.total.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Personal use" amount={profileReport.personal} onClick={() => openTransactions({ title: "Personal spending", transactionIds: profileReport.personal.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Shared household paid" amount={profileReport.household} onClick={() => openTransactions({ title: "Shared household spending paid from this profile", transactionIds: profileReport.household.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Income received" amount={incomeReceived} onClick={() => openTransactions({ title: "Income received by this profile", transactionIds: incomeReceived.transactionIds, range: profileReport.range })} />
          <OverviewMetric label="Average / completed month" amount={profileReport.completedAverage} note={`${profileReport.completedAverage.monthCount} completed months`} onClick={() => openTransactions({ title: "Spending in completed months", transactionIds: profileReport.completedAverage.transactionIds, range: profileReport.range })} />
        </>}
      </div>
    </article>

    {comparisonEnabled ? <PeriodComparison selected={report} comparison={comparisonReport} rows={categoryComparison} openTransactions={openTransactions} /> : null}

    <article className="rounded-[22px] border border-[var(--forest)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><Heading title="Category explorer" subtitle="Combine the categories you want and see one total for the selected period" />{explorerCategoryIds.length ? <button type="button" onClick={() => setExplorerCategoryIds([])} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Clear selection</button> : null}</div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Category groups">{categoryExplorerPresets.map((preset) => <button key={preset.key} type="button" onClick={() => selectCategoryPreset(preset.key)} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-xs font-semibold text-[var(--forest)]">{preset.label}</button>)}</div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Choose spending categories">{categoryTabs.map((category) => { const active = explorerCategoryIds.includes(category.id); return <button key={category.id} type="button" onClick={() => toggleExplorerCategory(category.id)} aria-pressed={active} className="rounded-full border px-3 py-1.5 text-xs font-semibold transition" style={{ borderColor: category.color, backgroundColor: active ? category.color : category.color + "18", color: active ? "#fff" : category.color }}>{category.name}</button>; })}</div>
      <button type="button" disabled={!explorerCategoryIds.length} onClick={() => openTransactions({ title: explorerCategoryNames.length ? explorerCategoryNames.join(" + ") : "Selected categories", transactionIds: explorerSummary.transactionIds, range: report.range })} className="mt-5 flex w-full flex-wrap items-end justify-between gap-3 rounded-2xl bg-[var(--forest)] p-4 text-left text-white disabled:cursor-not-allowed disabled:bg-[var(--paper-deep)] disabled:text-[var(--muted)]"><span><span className="block text-xs font-semibold uppercase tracking-[0.1em]">Selected category total</span><span className="mt-1 block text-xs opacity-80">{explorerCategoryIds.length ? `${explorerCategoryIds.length} categories · ${explorerSummary.transactionIds.length} transactions · open exact list` : "Choose a preset or any categories above"}</span></span><strong className="font-mono text-2xl">{money(explorerSummary.amount)}</strong></button>
    </article>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <article className="min-w-0 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><Heading title="Monthly breakdown" subtitle="Select a month to update this entire page" /><div className="mt-6 max-w-full overflow-x-auto pb-2"><div className="flex h-56 min-w-full items-end gap-2" style={report.monthly.length > 12 ? { width: `${report.monthly.length * 58}px` } : undefined} aria-label="Monthly spending chart">{report.monthly.map((month) => { const amount = month.amount; return <button key={month.month} onClick={() => selectMonth(month.month)} className="group flex min-w-[42px] flex-1 flex-col items-center justify-end gap-2" aria-label={`Show ${formatMonth(month.month)} throughout the dashboard`}><span className="hidden text-[10px] font-semibold text-[var(--muted)] sm:block">{compactMoney(amount)}</span><span className={`w-full rounded-t-lg transition group-hover:opacity-75 ${month.isCurrentPartial ? "bg-[var(--amber)]" : "bg-[var(--forest)]"}`} style={{ height: `${Math.max(4, amount / maxMonth * 160)}px` }} /><span className="whitespace-nowrap text-[10px] text-[var(--muted)]">{chartMonthLabel(month.month, report.monthly.length > 12)}{month.isCurrentPartial ? "*" : ""}</span></button>; })}</div></div><p className="mt-3 text-xs text-[var(--muted)]">Selecting a bar keeps you here and recalculates totals, categories, merchants, and locations. Long ranges scroll inside the chart. * Current month is partial.</p></article>
      <article className="min-w-0 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><Heading title="Spending by category" subtitle="Choose a colored category to see merchants and transactions below" /><div className="mt-4 flex flex-wrap gap-2">{categoryTabs.map((category) => <button key={"tab-" + category.id} onClick={() => setSelectedCategoryId(category.id)} aria-pressed={selectedCategoryId === category.id} className="max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-semibold transition" style={{ borderColor: category.color, backgroundColor: selectedCategoryId === category.id ? category.color : category.color + "18", color: selectedCategoryId === category.id ? "#fff" : category.color }}>{category.name}</button>)}</div><div className="mt-6 space-y-3">{report.categories.slice(0, 10).map((category) => <button key={category.id} onClick={() => setSelectedCategoryId(category.id)} className="block w-full min-w-0 text-left"><div className="mb-1.5 flex min-w-0 items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: category.color }} />{category.name}<span className="ml-2 text-xs text-[var(--muted)]">{category.detail}</span></span><strong className="shrink-0 font-mono text-xs">{money(category.amount)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.abs(category.amount) / maxCategory * 100)}%`, backgroundColor: category.color }} /></div></button>)}</div></article>
    </div>

    {selectedCategory ? <CategoryDetail category={selectedCategory} workspace={workspace} range={report.range} openTransactions={openTransactions} close={() => setSelectedCategoryId(null)} /> : null}

    <div className="grid gap-5 lg:grid-cols-3">
      <SplitCard title="Life expenses" left={{ label: "Essential", ...report.essential }} right={{ label: "Flexible", ...report.flexible }} range={report.range} openTransactions={openTransactions} />
      <SplitCard title="Personal and shared" left={{ label: "Personal only", ...report.personal }} right={{ label: "Shared household paid", ...report.household }} range={report.range} openTransactions={openTransactions} />
      <button onClick={() => open("Flights and extraordinary costs", report.extraordinary)} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 text-left"><p className="text-sm font-semibold">Flights and extraordinary costs</p><p className="mt-3 text-2xl font-semibold">{money(report.extraordinary.amount)}</p><p className="mt-1 text-xs text-[var(--muted)]">Excluded from normal location averages · {report.extraordinary.transactionIds.length} transactions</p></button>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start justify-between gap-3"><Heading title="Spending by confirmed location" subtitle="Full-month averages exclude partial months and extraordinary travel" /><button onClick={openLocations} className="text-xs font-semibold text-[var(--forest)]">Manage stays</button></div><div className="mt-4 space-y-3">{report.locations.map((location) => <LocationComparison key={location.id} group={location} workspace={workspace} range={report.range} today={today} openTransactions={openTransactions} />)}</div></article>
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><Heading title="Insights" subtitle="Every observation opens its supporting transactions" /><div className="mt-4 space-y-2">{workspace.insights.slice(0, 5).map((insight) => <button key={insight.key} onClick={() => openTransactions({ title: insight.title, transactionIds: insight.transactionIds, range: report.range })} className="block w-full rounded-xl border border-[var(--line)] p-3 text-left"><strong className="text-sm">{insight.title}</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{insight.body}</span></button>)}{!workspace.insights.length ? <p className="rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">Insights will appear as repeat patterns and unusual expenses become clear.</p> : null}</div></article>
    </div>

    {workTrips.total.transactionIds.length ? <article className="rounded-[22px] border border-[#aac7d8] bg-[#f3f8fb] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><Heading title="Work trips" subtitle={`${rangeLabel(workTrips.range)} · categorized normally and also shown separately`} /><button onClick={() => openTransactions({ title: "Work-trip spending", transactionIds: workTrips.total.transactionIds, range: workTrips.range })} className="rounded-xl bg-[#416788] px-3 py-2 text-sm font-semibold text-white">{money(workTrips.total.amount)} · {workTrips.total.transactionIds.length} transactions</button></div><div className="mt-4 flex flex-wrap gap-2">{workTrips.categories.map((category) => <button key={category.id} onClick={() => openTransactions({ title: `Work trips · ${category.name}`, transactionIds: category.transactionIds, range: workTrips.range })} className="rounded-full border border-[#aac7d8] bg-white px-3 py-1.5 text-xs font-semibold">{category.name} {money(category.amount)}</button>)}</div></article> : null}

    <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><Heading title="Top merchants and providers" subtitle="Visits, average per visit, location, and exact transactions" /><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{report.merchants.slice(0, 12).map((merchant) => <button key={merchant.id} onClick={() => openTransactions({ title: merchant.name, transactionIds: merchant.transactionIds, range: report.range })} className="rounded-xl bg-[var(--paper)] p-3 text-left"><span className="block truncate text-sm font-semibold">{merchant.name}</span><span className="mt-1 block text-xs text-[var(--muted)]">{merchant.visits} visit{merchant.visits === 1 ? "" : "s"} · {money(merchant.averagePerVisit)} average</span><span className="mt-2 block font-mono text-sm">{money(merchant.amount)}</span></button>)}</div></article>
  </section>;
}

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-[var(--muted)]">{label}<input type="date" value={value} max={max} onChange={(event) => { if (event.target.value) onChange(event.target.value); }} className="ml-2 h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" /></label>; }
function Heading({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p></div>; }
function PeriodComparison({ selected, comparison, rows, openTransactions }: { selected: SpendingReport; comparison: SpendingReport; rows: SpendingCategoryComparison[]; openTransactions: OpenTransactions }) {
  const difference = selected.total.amount - comparison.total.amount;
  const percent = percentageChange(selected.total.amount, comparison.total.amount);
  const combinedRange = { from: earlier(selected.range.from, comparison.range.from), to: later(selected.range.to, comparison.range.to) };
  const allTransactionIds = [...new Set([...selected.total.transactionIds, ...comparison.total.transactionIds])];
  return <article className="overflow-hidden rounded-[22px] border border-[var(--forest)] bg-[var(--surface)]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-5 sm:p-6"><Heading title="How you use your money · period comparison" subtitle={`Actual cash spending in USD · ${rangeLabel(selected.range)} versus ${rangeLabel(comparison.range)}`} /><span className="rounded-full bg-[var(--forest-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--forest)]">Every number is traceable</span></div>
    <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
      <ComparisonTotal label="Selected period" amount={selected.total.amount} note={`${rangeLabel(selected.range)} · ${selected.total.transactionIds.length} transactions`} onClick={() => openTransactions({ title: "Selected comparison period", transactionIds: selected.total.transactionIds, range: selected.range })} />
      <ComparisonTotal label="Comparison period" amount={comparison.total.amount} note={`${rangeLabel(comparison.range)} · ${comparison.total.transactionIds.length} transactions`} onClick={() => openTransactions({ title: "Comparison period", transactionIds: comparison.total.transactionIds, range: comparison.range })} />
      <ComparisonTotal label="Difference" amount={difference} signed note={changeDescription(difference, percent)} tone={difference > 0 ? "more" : difference < 0 ? "less" : "same"} onClick={() => openTransactions({ title: "Transactions behind the period difference", transactionIds: allTransactionIds, range: combinedRange })} />
    </div>
    <div className="overflow-x-auto border-t border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--paper)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Selected period</th><th className="px-4 py-3 text-right">Comparison period</th><th className="px-4 py-3 text-right">Difference</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: row.color }} /><strong>{row.name}</strong></td><td className="px-4 py-3 text-right"><button onClick={() => openTransactions({ title: `${row.name} · selected period`, transactionIds: row.selectedTransactionIds, range: selected.range })} className="font-mono text-xs underline decoration-[var(--line)] underline-offset-4">{money(row.selectedAmount)}</button></td><td className="px-4 py-3 text-right"><button onClick={() => openTransactions({ title: `${row.name} · comparison period`, transactionIds: row.comparisonTransactionIds, range: comparison.range })} className="font-mono text-xs underline decoration-[var(--line)] underline-offset-4">{money(row.comparisonAmount)}</button></td><td className="px-4 py-3 text-right"><button onClick={() => openTransactions({ title: `${row.name} · period comparison`, transactionIds: [...new Set([...row.selectedTransactionIds, ...row.comparisonTransactionIds])], range: combinedRange })} className={`font-mono text-xs font-semibold underline decoration-[var(--line)] underline-offset-4 ${differenceColor(row.difference)}`}>{signedMoney(row.difference)} <span className="ml-1 font-sans">{percentageLabel(row.percentageChange)}</span></button></td></tr>)}{!rows.length ? <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No spending exists in either period.</td></tr> : null}</tbody></table></div>
  </article>;
}
function ComparisonTotal({ label, amount, note, onClick, signed = false, tone = "same" }: { label: string; amount: number; note: string; onClick: () => void; signed?: boolean; tone?: "more" | "less" | "same" }) { return <button onClick={onClick} className={`rounded-xl border p-4 text-left ${tone === "more" ? "border-[#e3bf9f] bg-[#fbefe4]" : tone === "less" ? "border-[#b9d4c4] bg-[var(--forest-soft)]" : "border-[var(--line)] bg-[var(--paper)]"}`}><span className="text-xs font-semibold text-[var(--muted)]">{label}</span><strong className={`mt-2 block text-xl ${differenceColor(tone === "more" ? 1 : tone === "less" ? -1 : 0)}`}>{signed ? signedMoney(amount) : money(amount)}</strong><span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{note}</span></button>; }
function CategoryDetail({ category, workspace, range, openTransactions, close }: { category: SpendingGroup; workspace: WorkspaceData; range: DateRange; openTransactions: OpenTransactions; close: () => void }) {
  const rows = workspace.transactions.filter((transaction) => category.transactionIds.includes(transaction.id)).sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
  const merchants = categoryMerchants(rows);
  return <article className="overflow-hidden rounded-[22px] border bg-[var(--surface)]" style={{ borderColor: category.color }}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: category.color }}>{category.name}</p><h2 className="mt-1 text-xl font-semibold">{money(category.amount)} across {category.transactionIds.length} transactions</h2><p className="mt-1 text-sm text-[var(--muted)]">Merchant totals first, followed by every underlying transaction.</p></div><div className="flex gap-2"><button onClick={() => openTransactions({ title: category.name + " spending", transactionIds: category.transactionIds, range })} className="rounded-xl px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: category.color }}>Open all in Transactions</button><button onClick={close} aria-label={"Close " + category.name + " detail"} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold">Close</button></div></div>
    <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-4">{merchants.map((merchant) => <button key={merchant.key} onClick={() => openTransactions({ title: category.name + " · " + merchant.name, transactionIds: merchant.transactionIds, range })} className="rounded-xl bg-[var(--paper)] p-3 text-left"><strong className="block truncate text-sm">{merchant.name}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{merchant.visits} visit{merchant.visits === 1 ? "" : "s"} · {money(merchant.average)}</span><span className="mt-2 block font-mono text-sm">{money(merchant.amount)}</span></button>)}</div>
    <div className="overflow-x-auto border-t border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--paper)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Original statement name</th><th className="px-4 py-3">Original</th><th className="px-4 py-3">USD</th><th className="px-4 py-3">Location</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((transaction) => <tr key={transaction.id}><td className="whitespace-nowrap px-4 py-3">{transaction.occurred_at.slice(0, 10)}</td><td className="px-4 py-3"><strong className="block">{transaction.description}</strong>{transaction.transaction_label ? <span className="mt-0.5 block text-xs font-medium text-[var(--forest)]">{transaction.transaction_label}</span> : null}<span className="text-xs text-[var(--muted)]">{transaction.account?.name}</span></td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{originalMoney(transaction)}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{usdValue(transaction) == null ? "Rate needed" : money(usdValue(transaction) ?? 0)}</td><td className="px-4 py-3 text-xs">{transaction.location_period?.location.country_name || transaction.merchant_country || "Not confirmed"}</td></tr>)}</tbody></table></div>
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
function incomeInRange(transactions: WorkspaceTransaction[], range: DateRange): TraceableAmount {
  const rows = transactions.filter((transaction) => transaction.occurred_at.slice(0, 10) >= range.from && transaction.occurred_at.slice(0, 10) <= range.to && transaction.status === "posted" && transaction.metadata?.isDuplicate !== true && !transaction.excluded_from_totals && transaction.kind === "income" && Number(transaction.amount) > 0);
  return {
    amount: rows.reduce((sum, transaction) => sum + (transaction.currency === "USD" ? Number(transaction.amount) : Math.abs(Number(transaction.reporting_value?.reporting_amount ?? 0))), 0),
    transactionIds: rows.map((transaction) => transaction.id),
  };
}
function profileName(view: MoneyView) { return view === "luciana" ? "Luciana" : view === "julian" ? "Julian" : "Shared household"; }
function OverviewMetric({ label, amount, note, onClick }: { label: string; amount: TraceableAmount; note?: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-xl border border-white/80 bg-white/80 p-3 text-left shadow-sm transition hover:border-[var(--forest)]"><span className="block text-[11px] font-medium text-[var(--muted)]">{label}</span><strong className="mt-1 block font-mono text-lg">{money(amount.amount)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{note ?? `${amount.transactionIds.length} transaction${amount.transactionIds.length === 1 ? "" : "s"}`}</span></button>; }
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
  return <div className="rounded-xl bg-[var(--paper)] p-3"><button onClick={() => openTransactions({ title: `${group.name} spending`, transactionIds: group.transactionIds, range })} className="flex w-full items-center gap-3 text-left"><MapPin aria-hidden="true" className="size-4 shrink-0 text-[var(--forest)]" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{group.name}{period?.trip_purpose ? <span className="ml-2 rounded-full bg-[#dceaf2] px-2 py-0.5 text-[9px] font-semibold uppercase text-[#315b73]">{period.trip_purpose} trip</span> : null}</strong><span className="text-[10px] text-[var(--muted)]">{from} to {to} · {group.transactionIds.length} transactions · {detail.originalCurrencies.map((item) => item.currency).join(", ") || "USD"}</span></span><strong className="font-mono text-sm">{money(group.amount)}</strong></button><div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3 text-left sm:grid-cols-4"><LocationMetric label="Normal living cost" value={normal.amount} count={normal.transactionIds.length} onClick={() => openTransactions({ title: `${group.name} normal living cost`, transactionIds: normal.transactionIds, range })} /><LocationMetric label="Avg. full month" value={complete.length ? completeAmount / complete.length : 0} count={completeIds.length} note={`${complete.length} full month${complete.length === 1 ? "" : "s"}`} onClick={() => openTransactions({ title: `${group.name} full months`, transactionIds: completeIds, range })} /><LocationMetric label="Partial months" value={partialAmount} count={partialIds.length} onClick={() => openTransactions({ title: `${group.name} partial months`, transactionIds: partialIds, range })} /><LocationMetric label="Flights / extraordinary" value={detail.extraordinary.amount} count={detail.extraordinary.transactionIds.length} onClick={() => openTransactions({ title: `${group.name} extraordinary costs`, transactionIds: detail.extraordinary.transactionIds, range })} /></div><div className="mt-2 flex flex-wrap gap-1">{detail.categories.slice(0, 6).map((category) => <button key={category.id} onClick={() => openTransactions({ title: `${group.name} · ${category.name}`, transactionIds: category.transactionIds, range })} className="rounded-full border border-[var(--line)] bg-white px-2 py-1 text-[10px] font-semibold">{category.name} {money(category.amount)}</button>)}</div></div>;
}
function LocationMetric({ label, value, count, note, onClick }: { label: string; value: number; count: number; note?: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-lg bg-white p-2 text-left"><span className="block text-[10px] text-[var(--muted)]">{label}</span><strong className="mt-1 block text-xs">{money(value)}</strong><span className="text-[9px] text-[var(--muted)]">{note ?? `${count} transaction${count === 1 ? "" : "s"}`}</span></button>; }
function isFullMonth(month: string, from: string, to: string, today: string) { const first = `${month}-01`; const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10); return from <= first && to >= last && last < today; }
function later(left: string, right: string) { return left > right ? left : right; }
function earlier(left: string, right: string) { return left < right ? left : right; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function signedMoney(value: number) { return value > 0 ? `+${money(value)}` : money(value); }
function percentageLabel(value: number | null) { return value == null ? "new" : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`; }
function changeDescription(value: number, percent: number | null) {
  if (value === 0) return "No change between the selected periods.";
  const direction = value > 0 ? "more" : "less";
  const percentText = percent == null ? "with no comparable prior spending" : `${Math.abs(Math.round(percent * 100))}% ${direction}`;
  return `${money(Math.abs(value))} ${direction} · ${percentText}`;
}
function differenceColor(value: number) { return value > 0 ? "text-[var(--danger)]" : value < 0 ? "text-[var(--forest)]" : "text-[var(--ink)]"; }
function compactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}$${trimDecimal(absolute / 1_000_000)}M`;
  if (absolute >= 1_000) return `${sign}$${trimDecimal(absolute / 1_000)}K`;
  return `${sign}$${Math.round(absolute)}`;
}
function trimDecimal(value: number) { return value.toFixed(1).replace(/\.0$/, ""); }
function formatMonth(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }); }
function chartMonthLabel(value: string, includeYear: boolean) { const short = new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }); return includeYear ? `${short} '${value.slice(2, 4)}` : short; }
