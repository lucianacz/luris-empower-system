"use client";

import { CalendarDays, Check, Pencil, Plus, Target, Users, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { FinanceMutate } from "@/components/finance-ui-types";
import { analyzeHouseholdContributions } from "@/lib/reporting/household-contributions";
import { rangeForPreset, throughLastCompletedMonth } from "@/lib/reporting/periods";
import { savingsProgress, splitByIncome } from "@/lib/savings/plan";
import type { WorkspaceData, WorkspaceSavingsGoal } from "@/lib/workspace/demo";

type SavingsProfile = "luciana" | "shared" | "julian";

export function SavingsPlan({ workspace, profile, mutate }: { workspace: WorkspaceData; profile: SavingsProfile; mutate: FinanceMutate }) {
  const [showAdd, setShowAdd] = useState(false);
  const goals = workspace.savingsGoals.filter((goal) => goal.scope === "shared" || ownerRole(goal) === (profile === "julian" ? "partner" : "self")).filter((goal) => profile !== "shared" || goal.scope === "shared");
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const personalGoals = activeGoals.filter((goal) => goal.scope === "personal");
  const sharedGoals = activeGoals.filter((goal) => goal.scope === "shared");
  const completedRange = throughLastCompletedMonth(rangeForPreset("ytd", workspace.asOfDate), workspace.asOfDate);
  const incomeAnalysis = useMemo(() => completedRange ? analyzeHouseholdContributions(workspace.transactions, completedRange, workspace.asOfDate) : null, [completedRange, workspace.asOfDate, workspace.transactions]);
  const incomeShares = incomeAnalysis?.contributors.map(({ role, name, incomeShare }) => ({ role, name, incomeShare })) ?? [];
  const defaultOwnerId = workspace.people.find((person) => person.role === (profile === "julian" ? "partner" : "self"))?.id ?? null;

  return <section className="mt-7 space-y-5">
    <article className="overflow-hidden rounded-[24px] border border-[var(--forest)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">Savings worksheet</p><h2 className="mt-1 text-xl font-semibold">Turn plans into monthly targets</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">Amounts saved are entered manually, so spending and bank transfers are never mistaken for savings. The open month is excluded from the income-based contribution guide.</p></div><button disabled={workspace.mode !== "live"} onClick={() => setShowAdd((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45"><Plus aria-hidden="true" className="size-4" />Add goal</button></div>
      <div className="grid border-t border-[var(--line)] sm:grid-cols-3"><PlanSummary label="Personal targets" value={sumTargets(personalGoals)} note={`${personalGoals.length} active goal${personalGoals.length === 1 ? "" : "s"}`} /><PlanSummary label="Shared targets" value={sumTargets(sharedGoals)} note={`${sharedGoals.length} household goal${sharedGoals.length === 1 ? "" : "s"}`} /><PlanSummary label="Recorded as saved" value={sumSaved(activeGoals)} note="Editable planning balance" /></div>
    </article>

    {showAdd ? <NewGoalForm profile={profile} people={workspace.people} defaultOwnerId={defaultOwnerId} mutate={mutate} onDone={() => setShowAdd(false)} /> : null}

    <div className="grid gap-5 xl:grid-cols-2">{goals.map((goal) => <SavingsGoalCard key={goal.id} goal={goal} asOfDate={workspace.asOfDate} incomeShares={incomeShares} incomeRangeEnd={completedRange?.to ?? null} mutate={mutate} live={workspace.mode === "live"} />)}{!goals.length ? <article className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center xl:col-span-2"><Target aria-hidden="true" className="mx-auto size-6 text-[var(--forest)]" /><h2 className="mt-3 font-semibold">No savings goals in this profile</h2><p className="mt-1 text-sm text-[var(--muted)]">Add a personal or shared target to start the worksheet.</p></article> : null}</div>
  </section>;
}

function SavingsGoalCard({ goal, asOfDate, incomeShares, incomeRangeEnd, mutate, live }: { goal: WorkspaceSavingsGoal; asOfDate: string; incomeShares: Array<{ role: "self" | "partner"; name: string; incomeShare: number }>; incomeRangeEnd: string | null; mutate: FinanceMutate; live: boolean }) {
  const [editing, setEditing] = useState(false);
  const progress = savingsProgress(goal.target_amount, goal.saved_amount, goal.target_date, asOfDate);
  const incomeSplit = progress.monthlyRequired && goal.scope === "shared" ? splitByIncome(progress.monthlyRequired, incomeShares) : [];
  return <article className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
    <div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${goal.scope === "shared" ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "bg-[#eee8f8] text-[#66569a]"}`}>{goal.scope === "shared" ? <Users aria-hidden="true" className="size-3" /> : <Target aria-hidden="true" className="size-3" />}{goal.scope === "shared" ? "Shared household" : goal.owner?.display_name || "Personal"}</span><h2 className="mt-3 text-xl font-semibold">{goal.name}</h2>{goal.notes ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{goal.notes}</p> : null}</div><button disabled={!live} onClick={() => setEditing(true)} aria-label={`Edit ${goal.name}`} className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--forest)] disabled:opacity-45"><Pencil aria-hidden="true" className="size-4" /></button></div>
      <div className="mt-5 grid grid-cols-3 gap-2"><GoalMetric label="Target" value={money(progress.target)} /><GoalMetric label="Saved" value={money(progress.saved)} /><GoalMetric label="Remaining" value={money(progress.remaining)} /></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full bg-[var(--forest)]" style={{ width: `${Math.max(progress.progress > 0 ? 2 : 0, progress.progress * 100)}%` }} /></div><p className="mt-2 text-right text-xs font-semibold text-[var(--muted)]">{percent(progress.progress)} funded</p>
      {goal.target_date ? <div className="mt-4 rounded-2xl bg-[var(--paper)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-xs font-semibold"><CalendarDays aria-hidden="true" className="size-4 text-[var(--forest)]" />Target {friendlyDate(goal.target_date)}</span><strong className="font-mono text-lg text-[var(--forest)]">{progress.monthlyRequired == null ? "Date passed" : `${money(progress.monthlyRequired)}/month`}</strong></div><p className="mt-1 text-xs text-[var(--muted)]">{progress.savingMonths} saving month{progress.savingMonths === 1 ? "" : "s"}; the current partial month is not counted.</p></div> : <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">Choose a target date to calculate the monthly amount.</div>}
      {incomeSplit.length && incomeSplit.some((item) => item.incomeShare > 0) ? <div className="mt-4 border-t border-[var(--line)] pt-4"><p className="text-xs font-semibold">Two ways to plan the shared monthly amount</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[var(--paper)] p-3"><span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">50 / 50</span><strong className="mt-1 block font-mono">{money((progress.monthlyRequired ?? 0) / 2)} each</strong></div><div className="rounded-xl bg-[var(--forest-soft)] p-3"><span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">By confirmed income</span>{incomeSplit.map((item) => <strong key={item.role} className="mt-1 flex justify-between gap-3 text-xs"><span>{item.name} · {percent(item.incomeShare)}</span><span className="font-mono">{money(item.amount)}</span></strong>)}</div></div><p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">Income-proportional amounts use confirmed 2026 income through {incomeRangeEnd}; they are a comparison guide, not an automatic obligation.</p></div> : null}
    </div>
    {editing ? <EditGoalForm goal={goal} mutate={mutate} onDone={() => setEditing(false)} /> : null}
  </article>;
}

function EditGoalForm({ goal, mutate, onDone }: { goal: WorkspaceSavingsGoal; mutate: FinanceMutate; onDone: () => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await mutate(`/api/savings-goals/${goal.id}`, "PATCH", { name: data.get("name"), targetAmount: Number(data.get("targetAmount")), savedAmount: Number(data.get("savedAmount")), targetDate: data.get("targetDate") || null, status: data.get("status"), notes: data.get("notes") || null });
      onDone();
    } catch (error) { window.alert(messageOf(error)); }
  };
  return <form onSubmit={(event) => void submit(event)} className="border-t border-[var(--line)] bg-[var(--paper)] p-5"><div className="grid gap-3 sm:grid-cols-2"><GoalField label="Goal name"><input name="name" required defaultValue={goal.name} className="field" /></GoalField><GoalField label="Target USD"><input name="targetAmount" required type="number" min="0.01" step="0.01" defaultValue={Number(goal.target_amount)} className="field" /></GoalField><GoalField label="Already saved USD"><input name="savedAmount" required type="number" min="0" step="0.01" defaultValue={Number(goal.saved_amount)} className="field" /></GoalField><GoalField label="Target date"><input name="targetDate" type="date" defaultValue={goal.target_date ?? ""} className="field" /></GoalField><GoalField label="Status"><select name="status" defaultValue={goal.status} className="field"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></GoalField><GoalField label="Notes"><input name="notes" defaultValue={goal.notes ?? ""} className="field" /></GoalField></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onDone} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold"><X aria-hidden="true" className="size-3.5" />Cancel</button><button className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--forest)] px-3 py-2 text-xs font-semibold text-white"><Check aria-hidden="true" className="size-3.5" />Save changes</button></div></form>;
}

function NewGoalForm({ profile, people, defaultOwnerId, mutate, onDone }: { profile: SavingsProfile; people: WorkspaceData["people"]; defaultOwnerId: string | null; mutate: FinanceMutate; onDone: () => void }) {
  const [scope, setScope] = useState<"personal" | "shared">(profile === "shared" ? "shared" : "personal");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await mutate("/api/savings-goals", "POST", { name: data.get("name"), scope, ownerPersonId: scope === "personal" ? data.get("ownerPersonId") : null, targetAmount: Number(data.get("targetAmount")), savedAmount: Number(data.get("savedAmount") || 0), currency: "USD", targetDate: data.get("targetDate") || null, notes: data.get("notes") || null });
      onDone();
    } catch (error) { window.alert(messageOf(error)); }
  };
  return <form onSubmit={(event) => void submit(event)} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Add a savings goal</h2><p className="mt-1 text-xs text-[var(--muted)]">Targets are always planned in USD.</p></div><button type="button" aria-label="Close add goal form" onClick={onDone}><X aria-hidden="true" className="size-4" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><GoalField label="Goal name"><input name="name" required className="field" /></GoalField><GoalField label="Who is it for?"><select value={scope} onChange={(event) => setScope(event.target.value as "personal" | "shared")} className="field"><option value="personal">Personal</option><option value="shared">Shared household</option></select></GoalField>{scope === "personal" ? <GoalField label="Owner"><select name="ownerPersonId" required defaultValue={defaultOwnerId ?? ""} className="field"><option value="" disabled>Choose person</option>{people.filter((person) => person.role === "self" || person.role === "partner").map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></GoalField> : null}<GoalField label="Target USD"><input name="targetAmount" required type="number" min="0.01" step="0.01" className="field" /></GoalField><GoalField label="Already saved USD"><input name="savedAmount" type="number" min="0" step="0.01" defaultValue="0" className="field" /></GoalField><GoalField label="Target date (optional)"><input name="targetDate" type="date" className="field" /></GoalField><GoalField label="Notes"><input name="notes" className="field" /></GoalField></div><button className="mt-4 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white">Save goal</button></form>;
}

function PlanSummary({ label, value, note }: { label: string; value: number; note: string }) { return <div className="border-b border-[var(--line)] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-xs font-semibold text-[var(--muted)]">{label}</span><strong className="mt-2 block text-2xl">{money(value)}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{note}</span></div>; }
function GoalMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--paper)] p-3"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span><strong className="mt-1 block truncate font-mono text-sm">{value}</strong></div>; }
function GoalField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-semibold text-[var(--muted)]">{label}{children}</label>; }
function ownerRole(goal: WorkspaceSavingsGoal) { return goal.owner?.role ?? null; }
function sumTargets(goals: WorkspaceSavingsGoal[]) { return goals.reduce((sum, goal) => sum + Number(goal.target_amount), 0); }
function sumSaved(goals: WorkspaceSavingsGoal[]) { return goals.reduce((sum, goal) => sum + Number(goal.saved_amount), 0); }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function percent(value: number) { return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function friendlyDate(value: string) { return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function messageOf(error: unknown) { return error instanceof Error ? error.message : "The savings goal could not be saved."; }
