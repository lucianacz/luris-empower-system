"use client";

import { ArrowUpRight, MessageCircle, Send, ShieldCheck, WalletCards } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { answerPlanningQuestion, type PlanningAnswer } from "@/lib/planning/advisor";
import { buildSpendingReport } from "@/lib/reporting/report";
import { completedMonthKeys, rangeForPreset, throughLastCompletedMonth } from "@/lib/reporting/periods";
import { savingsProgress } from "@/lib/savings/plan";
import type { WorkspaceData, WorkspaceTransaction } from "@/lib/workspace/demo";

type PlannerProfile = "luciana" | "shared" | "julian";

export function FinancialPlanner({ workspace, profile }: { workspace: WorkspaceData; profile: PlannerProfile }) {
  const [question, setQuestion] = useState("¿Puedo alquilar por dos meses un departamento de USD 2.000 por mes en Argentina?");
  const [answer, setAnswer] = useState<PlanningAnswer | null>(null);
  const [safetyMonths, setSafetyMonths] = useState(3);
  const context = useMemo(() => planningContext(workspace, profile, safetyMonths), [profile, safetyMonths, workspace]);
  const ask = (event: FormEvent) => {
    event.preventDefault();
    setAnswer(answerPlanningQuestion({ question, ...context }));
  };

  return <section className="mt-7 space-y-5">
    <article className="overflow-hidden rounded-[24px] border border-[var(--forest)] bg-[var(--surface)]">
      <div className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--forest)] text-white"><MessageCircle aria-hidden="true" className="size-5" /></span><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">Private planning assistant</p><h2 className="mt-1 text-xl font-semibold">Ask whether a decision fits your plan</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">The calculation stays inside this app. It uses current cash, completed-month spending, income assumptions, goals, and a cash safety buffer. It does not send your transactions to an external AI service.</p></div></div></div>
      <div className="grid border-t border-[var(--line)] sm:grid-cols-4"><PlannerMetric label="Current liquid cash" value={money(context.currentCash)} note="Latest confirmed Deel balances" /><PlannerMetric label="Income used / month" value={money(context.monthlyIncome)} note={profile === "julian" ? "Completed-month average; variable" : profile === "shared" ? "Luciana plan + Julian history" : "Expected on the last day"} /><PlannerMetric label="Living cost / month" value={money(context.monthlyLivingCost)} note={`${context.completedMonths} completed months`} /><PlannerMetric label="Goals / month" value={money(context.monthlyGoalContribution)} note="Dated active goals only" /></div>
    </article>

    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><form onSubmit={ask}><label className="text-sm font-semibold" htmlFor="planner-question">What are you considering?</label><textarea id="planner-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--forest)]" /><button className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white"><Send aria-hidden="true" className="size-4" />Calculate with my plan</button></form>
        {answer ? <div className={`mt-5 rounded-2xl border p-5 ${answer.level === "comfortable" ? "border-[var(--forest)] bg-[var(--forest-soft)]" : answer.level === "tight" ? "border-[var(--amber)] bg-[var(--amber-soft)]" : answer.level === "needs_amount" ? "border-[var(--line)] bg-[var(--paper)]" : "border-[var(--danger)] bg-[#f7e3df]"}`}><p className="text-xs font-semibold uppercase tracking-[0.1em]">Planning estimate</p><h3 className="mt-2 text-xl font-semibold">{answer.headline}</h3><p className="mt-2 text-sm leading-6">{answer.explanation}</p>{answer.level !== "needs_amount" ? <div className="mt-4 grid gap-2 sm:grid-cols-3"><AnswerMetric label="Decision cost" value={money(answer.scenarioCost)} /><AnswerMetric label="Cash after decision" value={money(answer.projectedCash)} /><AnswerMetric label="After safety reserve" value={money(answer.availableAfterSafety)} /></div> : null}<p className="mt-4 text-xs leading-5 opacity-75">This is a cash-planning estimate, not professional financial advice. Change the safety reserve at right to test a more conservative or flexible plan.</p></div> : null}
      </article>
      <aside className="space-y-4"><article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-[var(--forest)]" />Minimum cash reserve</span><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Keep this many months of normal living costs untouched.</p><div className="mt-4 grid grid-cols-3 gap-2">{[2,3,6].map((months) => <button key={months} onClick={() => { setSafetyMonths(months); setAnswer(null); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ${safetyMonths === months ? "bg-[var(--forest)] text-white" : "border border-[var(--line)]"}`}>{months} mo</button>)}</div><strong className="mt-4 block font-mono text-xl">{money(context.monthlyLivingCost * safetyMonths)}</strong></article>
        <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="inline-flex items-center gap-2 text-sm font-semibold"><WalletCards aria-hidden="true" className="size-4 text-[var(--forest)]" />Balances included</span><div className="mt-3 space-y-2">{context.balances.map((balance) => <div key={balance.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--paper)] p-3 text-xs"><span>{balance.owner?.display_name ?? "Owner"} · {balance.institution}</span><strong className="font-mono">{money(Number(balance.amount))}</strong></div>)}{!context.balances.length ? <p className="text-xs text-[var(--muted)]">No confirmed cash balance yet.</p> : null}</div></article>
        <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowUpRight aria-hidden="true" className="size-4 text-[var(--forest)]" />Unscheduled goals</span><strong className="mt-3 block font-mono text-xl">{money(context.unscheduledGoals)}</strong><p className="mt-1 text-xs leading-5 text-[var(--muted)]">These goals are visible but not deducted monthly until they have a target date.</p></article></aside>
    </div>
  </section>;
}

function planningContext(workspace: WorkspaceData, profile: PlannerProfile, safetyMonths: number) {
  const role = profile === "luciana" ? "self" : profile === "julian" ? "partner" : null;
  const latestByOwnerInstitution = new Map<string, WorkspaceData["balanceSnapshots"][number]>();
  for (const balance of workspace.balanceSnapshots) {
    if (balance.currency !== "USD" || (role && balance.owner?.role !== role)) continue;
    const key = `${balance.owner_person_id}:${balance.institution}:${balance.currency}`;
    if (!latestByOwnerInstitution.has(key)) latestByOwnerInstitution.set(key, balance);
  }
  const balances = [...latestByOwnerInstitution.values()];
  const currentCash = balances.reduce((sum, balance) => sum + Number(balance.amount), 0);
  const completedRange = throughLastCompletedMonth(rangeForPreset("ytd", workspace.asOfDate), workspace.asOfDate);
  const completedMonths = completedRange ? completedMonthKeys(completedRange, workspace.asOfDate).length : 0;
  const report = completedRange ? buildSpendingReport(workspace.transactions, completedRange, workspace.asOfDate) : null;
  const monthlyLivingCost = report?.completedAverage.amount ?? 0;
  const monthlyIncome = profile === "shared"
    ? incomeForRole(workspace, "self", completedRange, completedMonths) + incomeForRole(workspace, "partner", completedRange, completedMonths)
    : incomeForRole(workspace, role!, completedRange, completedMonths);
  let monthlyGoalContribution = 0;
  let unscheduledGoals = 0;
  for (const goal of workspace.savingsGoals.filter((item) => item.status === "active")) {
    const belongs = goal.scope === "shared" || profile === "shared" || goal.owner?.role === role;
    if (!belongs) continue;
    const share = profile === "shared" || goal.scope === "personal" ? 1 : 0.5;
    const progress = savingsProgress(goal.target_amount, goal.saved_amount, goal.target_date, workspace.asOfDate);
    if (progress.monthlyRequired == null) unscheduledGoals += progress.remaining * share;
    else monthlyGoalContribution += progress.monthlyRequired * share;
  }
  return { currentCash, monthlyIncome, monthlyLivingCost, monthlyGoalContribution, safetyMonths, completedMonths, unscheduledGoals, balances };
}

function incomeForRole(workspace: WorkspaceData, role: "self" | "partner", range: { from: string; to: string } | null, completedMonths: number) {
  const planning = workspace.planningProfiles.find((item) => item.person?.role === role);
  if (planning && !planning.income_is_variable && planning.expected_monthly_income != null) return Number(planning.expected_monthly_income);
  if (!range || !completedMonths) return 0;
  const total = workspace.transactions.filter((row) => payerRole(row) === role && row.kind === "income" && row.status === "posted" && !row.excluded_from_totals && Number(row.amount) > 0 && inRange(row.occurred_at, range)).reduce((sum, row) => sum + transactionUsd(row), 0);
  return total / completedMonths;
}

function payerRole(row: WorkspaceTransaction) { return row.paid_by?.role ?? row.account_owner?.role ?? null; }
function inRange(value: string, range: { from: string; to: string }) { const date = value.slice(0, 10); return date >= range.from && date <= range.to; }
function transactionUsd(row: WorkspaceTransaction) { return row.currency === "USD" ? Math.abs(Number(row.amount)) : Math.abs(Number(row.reporting_value?.reporting_amount ?? 0)); }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function PlannerMetric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="border-b border-[var(--line)] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-1 block font-mono text-xl">{value}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{note}</span></div>; }
function AnswerMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/55 p-3"><span className="text-[10px] uppercase tracking-[0.08em] opacity-70">{label}</span><strong className="mt-1 block font-mono text-sm">{value}</strong></div>; }
