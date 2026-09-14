"use client";

import { Banknote, Home, Landmark, ReceiptText, Users } from "lucide-react";
import type { OpenTransactions } from "@/components/finance-ui-types";
import type { WorkspaceData, WorkspacePropertyExpense } from "@/lib/workspace/demo";

export function PropertyProject({ workspace, profile, openTransactions }: { workspace: WorkspaceData; profile: "luciana" | "shared" | "julian"; openTransactions: OpenTransactions }) {
  const project = workspace.propertyProjects.find((item) => item.name === "satu-lagi-house");
  const rows = workspace.propertyExpenses.filter((expense) => expense.project_id === project?.id);
  const total = sum(rows, "amount");
  const principal = sum(rows, "principal_amount");
  const fees = sum(rows, "fee_amount");
  const cash = rows.filter((expense) => expense.payment_method === "cash");
  const legal = rows.filter((expense) => expense.expense_type === "legal");
  const fence = rows.filter((expense) => expense.expense_type === "fence");
  const land = rows.filter((expense) => expense.expense_type === "land_purchase");
  const byPerson = [...rows.reduce((groups, expense) => {
    const name = expense.paid_by?.display_name ?? "Unknown payer";
    const current = groups.get(name) ?? { name, amount: 0, rows: [] as WorkspacePropertyExpense[] };
    current.amount += Number(expense.amount);
    current.rows.push(expense);
    groups.set(name, current);
    return groups;
  }, new Map<string, { name: string; amount: number; rows: WorkspacePropertyExpense[] }>()).values()].sort((left, right) => right.amount - left.amount);

  if (!project) return <section className="mt-7 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center"><Home aria-hidden="true" className="mx-auto size-8 text-[var(--forest)]" /><h2 className="mt-4 font-semibold">Satu Lagi House is being synchronized</h2><p className="mt-2 text-sm text-[var(--muted)]">The property ledger will appear after the confirmed profile sync finishes.</p></section>;

  return <section className="mt-7 space-y-5">
    <article className="overflow-hidden rounded-[24px] border border-[#c7a77a] bg-[linear-gradient(135deg,#fffdf8_0%,#f5ead7_100%)]">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#76532e]"><Home aria-hidden="true" className="size-4" />Property capital</span><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{project.display_name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{project.notes} Every payment stays visible here, including cash. Nothing on this page is included in monthly living-spending totals.</p></div>
        <div className="rounded-[20px] bg-white/75 p-5"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{profile === "shared" ? "Known household investment" : profile === "luciana" ? "Paid by Luciana" : "Paid by Julian"}</span><strong className="mt-2 block font-mono text-4xl tracking-[-0.05em]">{money(total)}</strong><span className="mt-2 block text-xs text-[var(--muted)]">USD · all records · {rows.length} ledger entries</span></div>
      </div>
    </article>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={Landmark} label="Land & purchase" value={sum(land, "principal_amount")} note={`${land.length} payments`} />
      <Metric icon={ReceiptText} label="Legal" value={sum(legal, "amount")} note={`${legal.length} payments`} />
      <Metric icon={Home} label="Fence" value={sum(fence, "amount")} note={`${fence.length} cash payments`} />
      <Metric icon={Banknote} label="Cash recorded" value={sum(cash, "amount")} note={`${cash.length} manual entries`} />
      <Metric icon={ReceiptText} label="Transfer fees" value={fees} note={`Principal ${money(principal)}`} />
    </div>

    {profile === "shared" ? <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center gap-2"><Users aria-hidden="true" className="size-5 text-[var(--forest)]" /><h2 className="font-semibold">Contribution by person</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{byPerson.map((person) => <button key={person.name} onClick={() => openLinked(person.rows, `${project.display_name} · ${person.name}`, openTransactions)} className="rounded-2xl bg-[var(--paper)] p-4 text-left"><span className="text-sm font-semibold">{person.name}</span><strong className="mt-2 block font-mono text-2xl">{money(person.amount)}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{person.rows.length} entries · open linked bank evidence</span></button>)}</div></article> : null}

    <article className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] p-5"><h2 className="font-semibold">Complete property ledger</h2><p className="mt-1 text-sm text-[var(--muted)]">Original transaction names remain intact. The line below is the reusable explanation.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--paper)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Original record</th><th className="px-4 py-3">Paid by</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((expense) => <tr key={expense.id}><td className="whitespace-nowrap px-4 py-3">{expense.paid_on ? date(expense.paid_on) : <span className="text-[var(--muted)]">Date pending</span>}</td><td className="max-w-[360px] px-4 py-3"><strong className="block">{expense.description}</strong>{expense.transaction_label ? <span className="mt-1 block text-xs font-medium text-[var(--forest)]">{expense.transaction_label}</span> : null}{expense.notes ? <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{expense.notes}</span> : null}{expense.transaction_id ? <button onClick={() => openTransactions({ title: `${project.display_name} · ${expense.description}`, transactionIds: [expense.transaction_id!], range: { from: expense.paid_on!, to: expense.paid_on! } })} className="mt-2 text-xs font-semibold text-[var(--forest)] underline underline-offset-4">Open original transaction</button> : null}</td><td className="px-4 py-3">{expense.paid_by?.display_name ?? "Unknown"}</td><td className="px-4 py-3 capitalize">{expense.expense_type.replaceAll("_", " ")}</td><td className="px-4 py-3 capitalize">{expense.payment_method.replaceAll("_", " ")}</td><td className="px-4 py-3 text-right"><strong className="font-mono">{money(expense.amount)}</strong>{Number(expense.fee_amount) > 0 ? <span className="mt-1 block text-[10px] text-[var(--muted)]">includes {money(expense.fee_amount)} fee</span> : null}</td></tr>)}</tbody></table></div></article>
  </section>;
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Home; label: string; value: number; note: string }) { return <article className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><Icon aria-hidden="true" className="size-5 text-[var(--forest)]" /><span className="mt-3 block text-xs text-[var(--muted)]">{label}</span><strong className="mt-1 block font-mono text-xl">{money(value)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{note}</span></article>; }
function sum(rows: WorkspacePropertyExpense[], key: "amount" | "principal_amount" | "fee_amount") { return rows.reduce((total, row) => total + Number(row[key]), 0); }
function money(value: string | number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value)); }
function date(value: string) { return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function openLinked(rows: WorkspacePropertyExpense[], title: string, openTransactions: OpenTransactions) { const linked = rows.filter((row) => row.transaction_id && row.paid_on); if (!linked.length) return; const dates = linked.map((row) => row.paid_on!).sort(); openTransactions({ title, transactionIds: linked.map((row) => row.transaction_id!), range: { from: dates[0], to: dates.at(-1)! } }); }
