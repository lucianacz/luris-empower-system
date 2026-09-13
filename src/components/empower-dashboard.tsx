"use client";

import {
  Banknote,
  CheckCircle2,
  CircleHelp,
  FileUp,
  FolderArchive,
  LayoutDashboard,
  Link2,
  MapPin,
  Menu,
  PiggyBank,
  RefreshCw,
  Repeat2,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CashWithdrawals } from "@/components/cash-withdrawals";
import { FilesByMonth } from "@/components/files-by-month";
import type { FinanceMutate, TransactionSelection } from "@/components/finance-ui-types";
import { ImportWorkspace } from "@/components/import-workspace";
import { LocationsAndStays } from "@/components/locations-stays";
import { QuestionsInbox } from "@/components/questions-inbox";
import { RecurringExpenses } from "@/components/recurring-expenses";
import { ReportingWorkspace } from "@/components/reporting-workspace";
import { TransactionLedger } from "@/components/transaction-ledger";
import { createEmptyWorkspace, type WorkspaceData } from "@/lib/workspace/demo";

type View = "spending" | "transactions" | "questions" | "locations" | "recurring" | "cash" | "files" | "imports" | "investments" | "transfers" | "settings";
const views = new Set<View>(["spending", "transactions", "questions", "locations", "recurring", "cash", "files", "imports", "investments", "transfers", "settings"]);

const viewTitles: Record<View, string> = {
  spending: "How you use your money",
  transactions: "Transactions and evidence",
  questions: "Questions inbox",
  locations: "Locations and stays",
  recurring: "Recurring expenses",
  cash: "Cash withdrawals",
  files: "Files by month",
  imports: "Import statements",
  investments: "Investments",
  transfers: "Transfer chains",
  settings: "Settings and data history",
};

export function EmpowerDashboard() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>("spending");
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => createEmptyWorkspace());
  const [selection, setSelection] = useState<TransactionSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Workspace data could not be loaded.");
      setWorkspace(result);
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const handleRefresh = () => void refresh();
    window.addEventListener("empower:refresh", handleRefresh);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("empower:refresh", handleRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const syncViewFromUrl = () => {
      const candidate = new URL(window.location.href).searchParams.get("view");
      setCurrentView(candidate && views.has(candidate as View) ? candidate as View : "spending");
      setMenuOpen(false);
    };
    const initialUrl = new URL(window.location.href);
    const initialView = initialUrl.searchParams.get("view");
    if (initialView && views.has(initialView as View) && initialView !== "spending" && window.history.state?.empowerView !== initialView) {
      const selectedUrl = `${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`;
      initialUrl.searchParams.delete("view");
      window.history.replaceState({ ...window.history.state, empowerView: "spending" }, "", `${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`);
      window.history.pushState({ ...window.history.state, empowerView: initialView }, "", selectedUrl);
    }
    syncViewFromUrl();
    window.addEventListener("popstate", syncViewFromUrl);
    return () => window.removeEventListener("popstate", syncViewFromUrl);
  }, []);

  const navigate = (view: View) => {
    if (view !== currentView) {
      const url = new URL(window.location.href);
      if (view === "spending") url.searchParams.delete("view");
      else url.searchParams.set("view", view);
      window.history.pushState({ ...window.history.state, empowerView: view }, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setCurrentView(view);
    setMenuOpen(false);
  };
  const mutate: FinanceMutate = async (url, method, body) => {
    setNotice("");
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The change could not be saved.");
    setNotice(result.message || "Saved.");
    await refresh();
  };
  const openTransactions = (nextSelection: TransactionSelection) => {
    setSelection(nextSelection);
    navigate("transactions");
  };
  if (loading) return <main className="grid min-h-screen place-items-center px-6"><div role="status" aria-live="polite" className="text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--forest-soft)] text-[var(--forest)]"><RefreshCw aria-hidden="true" className="size-5 animate-spin" /></span><h1 className="mt-4 text-lg font-semibold">Loading your financial workspace</h1><p className="mt-2 text-sm text-[var(--muted)]">Fetching your imported transactions securely…</p></div></main>;

  const pendingCount = workspace.questions.length + workspace.suggestedQuestions.length;
  const locationCount = workspace.locationPeriods.filter((period) => period.status === "suggested").length;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
      <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-[252px] flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-5 lg:static lg:flex lg:w-auto`} aria-label="Primary navigation">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-[14px] bg-[var(--forest)] text-white shadow-[0_8px_24px_rgba(33,78,69,0.22)]"><Sparkles aria-hidden="true" className="size-5" /></span>
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Luris</p><p className="text-lg font-semibold tracking-[-0.03em]">Empower</p></div>
        </div>
        <nav className="mt-9 space-y-1 text-sm" aria-label="Workspace">
          <NavItem icon={LayoutDashboard} label="Spending" active={currentView === "spending"} onSelect={() => navigate("spending")} />
          <NavItem icon={WalletCards} label="Transactions" active={currentView === "transactions"} onSelect={() => { setSelection(null); navigate("transactions"); }} />
          <NavItem icon={CircleHelp} label="Questions" badge={pendingCount} active={currentView === "questions"} onSelect={() => navigate("questions")} />
          <NavItem icon={MapPin} label="Locations" badge={locationCount} active={currentView === "locations"} onSelect={() => navigate("locations")} />
          <NavItem icon={Repeat2} label="Recurring expenses" active={currentView === "recurring"} onSelect={() => navigate("recurring")} />
          <NavItem icon={Banknote} label="Cash withdrawals" active={currentView === "cash"} onSelect={() => navigate("cash")} />
          <NavItem icon={FolderArchive} label="Files by month" active={currentView === "files"} onSelect={() => navigate("files")} />
          <NavItem icon={FileUp} label="Imports" active={currentView === "imports"} onSelect={() => navigate("imports")} />
          <NavItem icon={PiggyBank} label="Investments" active={currentView === "investments"} onSelect={() => navigate("investments")} />
          <NavItem icon={Link2} label="Transfer chains" active={currentView === "transfers"} onSelect={() => navigate("transfers")} />
        </nav>
        <div className="mt-auto space-y-2">
          <button onClick={() => navigate("questions")} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3.5 text-left">
            <span className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-[var(--forest)]" />Data quality {workspace.dataQuality.score}%</span>
            <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">{workspace.dataQuality.uncategorized} uncategorized · {workspace.dataQuality.missingFx} missing USD rates</span>
          </button>
          <NavItem icon={Settings2} label="Settings" active={currentView === "settings"} onSelect={() => navigate("settings")} />
        </div>
      </aside>
      {menuOpen ? <button className="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}

      <main className="min-w-0 px-4 pb-12 pt-4 sm:px-6 lg:px-10 lg:pt-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu aria-hidden="true" className="size-5" /></button>
            <div><p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--muted)]">Financial workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{viewTitles[currentView]}</h1></div>
          </div>
          <button onClick={() => navigate("imports")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(33,78,69,0.18)]"><FileUp aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Import statements</span><span className="sm:hidden">Import</span></button>
        </header>
        {notice ? <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X aria-hidden="true" className="size-4" /></button></div> : null}
        {currentView === "spending" ? <ReportingWorkspace workspace={workspace} loading={loading} openTransactions={openTransactions} openQuestions={() => navigate("questions")} openLocations={() => navigate("locations")} /> : null}
        {currentView === "transactions" ? <><TransactionLedger workspace={workspace} mutate={mutate} selection={selection} clearSelection={() => setSelection(null)} /><CategoryCreator disabled={workspace.mode !== "live"} mutate={mutate} /></> : null}
        {currentView === "questions" ? <QuestionsInbox workspace={workspace} mutate={mutate} openTransactions={openTransactions} /> : null}
        {currentView === "locations" ? <LocationsAndStays workspace={workspace} mutate={mutate} openTransactions={openTransactions} /> : null}
        {currentView === "recurring" ? <RecurringExpenses workspace={workspace} mutate={mutate} openTransactions={openTransactions} /> : null}
        {currentView === "cash" ? <CashWithdrawals workspace={workspace} openTransactions={openTransactions} /> : null}
        {currentView === "files" ? <FilesByMonth workspace={workspace} /> : null}
        {currentView === "imports" ? <ImportWorkspace /> : null}
        {currentView === "investments" ? <InvestmentsView workspace={workspace} mutate={mutate} /> : null}
        {currentView === "transfers" ? <TransfersView workspace={workspace} mutate={mutate} /> : null}
        {currentView === "settings" ? <SettingsView workspace={workspace} mutate={mutate} /> : null}
      </main>
    </div>
  );
}

function CategoryCreator({ disabled, mutate }: { disabled: boolean; mutate: FinanceMutate }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await mutate("/api/categories", "POST", { name: data.get("name"), kind: "expense", lifeArea: data.get("lifeArea"), essential: data.get("essential") === "on", extraordinary: data.get("extraordinary") === "on" });
      form.reset();
    } catch (error) { window.alert(messageOf(error)); }
  };
  return <form onSubmit={(event) => void submit(event)} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="mr-auto"><h2 className="font-semibold">Create a spending category</h2><p className="mt-1 text-xs text-[var(--muted)]">Group it into the part of life it supports.</p></div><Field label="Category"><input required disabled={disabled} name="name" className="field" placeholder="e.g. Childcare" /></Field><Field label="Life area"><input required disabled={disabled} name="lifeArea" className="field" placeholder="e.g. Family" /></Field><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input disabled={disabled} name="essential" type="checkbox" /> Essential</label><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input disabled={disabled} name="extraordinary" type="checkbox" /> Extraordinary</label><button disabled={disabled} className="h-10 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white disabled:opacity-45">Add category</button></form>;
}

function TransfersView({ workspace, mutate }: { workspace: WorkspaceData; mutate: FinanceMutate }) {
  const live = workspace.mode === "live";
  const decide = async (id: string, status: "confirmed" | "rejected") => { try { await mutate(`/api/transfers/${id}`, "PATCH", { status }); } catch (error) { window.alert(messageOf(error)); } };
  const rebuild = async () => { try { await mutate("/api/transfers/rebuild", "POST"); } catch (error) { window.alert(messageOf(error)); } };
  return <section className="mt-7 space-y-4"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">Transfers remain visible so the same money is not counted as income or spending twice. They are intentionally secondary to expense analysis.</p><button disabled={!live} onClick={() => void rebuild()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold disabled:opacity-45"><RefreshCw aria-hidden="true" className="size-4" />Rebuild</button></div>{workspace.transferChains.map((chain) => <article key={chain.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><StatusBadge value={chain.status} /><h2 className="mt-3 font-semibold">{chain.notes || "Owned-account movement"}</h2><p className="mt-1 text-sm text-[var(--muted)]">{Math.round(Number(chain.confidence) * 100)}% confidence · principal {formatMoney(chain.source_amount, chain.source_currency)} · fees {formatMoney(chain.fee_amount, chain.source_currency)}</p></div>{chain.status === "suggested" ? <div className="flex gap-2"><button disabled={!live} onClick={() => void decide(chain.id, "rejected")} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold disabled:opacity-45">Not a transfer</button><button disabled={!live} onClick={() => void decide(chain.id, "confirmed")} className="rounded-xl bg-[var(--forest)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-45">Confirm</button></div> : null}</div><div className="mt-5 space-y-2">{chain.members.map((member, index) => <div key={`${chain.id}-${member.sequence}`} className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--forest-soft)] text-xs font-bold text-[var(--forest)]">{index + 1}</span><div className="min-w-0 flex-1 rounded-xl bg-[var(--paper)] px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><span className="truncate font-medium">{member.transaction?.account?.name ?? "Account movement"} · {member.transaction?.description ?? "Imported transaction"}</span><span className="font-mono text-sm">{formatMoney(member.allocated_amount ?? member.transaction?.amount, member.allocated_currency ?? member.transaction?.currency)}</span></div></div></div>)}</div></article>)}{!workspace.transferChains.length ? <EmptyPanel icon={Link2} title="No transfer chains yet" body="Import at least two owned accounts, then rebuild suggestions." /> : null}</section>;
}

function InvestmentsView({ workspace, mutate }: { workspace: WorkspaceData; mutate: FinanceMutate }) {
  const live = workspace.mode === "live";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await mutate("/api/investments", "POST", { recordType: "position", institution: data.get("institution"), accountName: data.get("accountName"), baseCurrency: String(data.get("currency") || "USD").toUpperCase(), cashAvailable: 0, valuationDate: data.get("valuationDate"), assetName: data.get("assetName"), symbol: data.get("symbol") || null, assetType: data.get("assetType"), assetCurrency: String(data.get("currency") || "USD").toUpperCase(), quantity: Number(data.get("quantity") || 0), costBasis: Number(data.get("costBasis") || 0), currentValue: Number(data.get("currentValue") || 0), realizedProfitLoss: 0 });
      form.reset();
    } catch (error) { window.alert(messageOf(error)); }
  };
  return <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_360px]"><div className="space-y-4">{workspace.investments.map((position) => <article key={position.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div><p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">{position.account?.name ?? "Investment account"} · {position.asset?.asset_type}</p><h2 className="mt-1 text-lg font-semibold">{position.asset?.symbol ? `${position.asset.symbol} · ` : ""}{position.asset?.name ?? "Position"}</h2></div><div className="text-right"><p className="font-mono text-lg font-semibold">{formatMoney(position.current_value, position.currency)}</p><p className="text-sm text-[var(--muted)]">valued {formatDate(position.valuation_date)}</p></div></article>)}{!workspace.investments.length ? <EmptyPanel icon={PiggyBank} title="Investments stay separate" body="ARQ portfolio movements never become ordinary spending or income." /> : null}</div><form onSubmit={(event) => void submit(event)} className="h-fit rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Manual position</h2><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Institution"><select name="institution" className="field"><option value="arq">ARQ</option><option value="other">Other</option></select></Field><Field label="Account"><input required name="accountName" className="field" /></Field><Field label="Asset"><input required name="assetName" className="field" /></Field><Field label="Symbol"><input name="symbol" className="field" /></Field><Field label="Type"><input required name="assetType" className="field" placeholder="ETF, stock, bond" /></Field><Field label="Currency"><input required name="currency" defaultValue="USD" className="field" /></Field><Field label="Quantity"><input required name="quantity" type="number" step="any" className="field" /></Field><Field label="Cost basis"><input name="costBasis" type="number" step="any" className="field" /></Field><Field label="Current value"><input name="currentValue" type="number" step="any" className="field" /></Field><Field label="Valuation date"><input required name="valuationDate" type="date" defaultValue={workspace.asOfDate} className="field" /></Field></div><button disabled={!live} className="mt-5 w-full rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">Save position</button></form></section>;
}

function SettingsView({ workspace, mutate }: { workspace: WorkspaceData; mutate: FinanceMutate }) {
  const live = workspace.mode === "live";
  const rollback = async (id: string) => {
    if (!window.confirm("Remove every transaction created by this import batch? The original statement stays in secure history.")) return;
    try { await mutate(`/api/import/batches/${id}`, "DELETE"); } catch (error) { window.alert(messageOf(error)); }
  };
  return <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_380px]"><article className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><SectionHeading title="Import history" subtitle="Checksums, row counts, and reversible batches" />{workspace.imports.length ? <div className="divide-y divide-[var(--line)]">{workspace.imports.map((batch) => <div key={batch.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><FileUp aria-hidden="true" className="size-4 text-[var(--forest)]" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{batch.file_name}</p><p className="mt-1 text-xs text-[var(--muted)]">{batch.imported_count} imported · {batch.duplicate_count} duplicates · {batch.unresolved_count} questions</p></div><StatusBadge value={batch.status} />{batch.status === "confirmed" ? <button onClick={() => void rollback(batch.id)} aria-label={`Roll back ${batch.file_name}`} className="grid size-9 place-items-center rounded-lg text-[var(--danger)] hover:bg-[#f7e3df]"><Trash2 aria-hidden="true" className="size-4" /></button> : null}</div>)}</div> : <p className="p-6 text-sm text-[var(--muted)]">Confirmed imports will appear here.</p>}</article><aside className="space-y-4"><ConnectionCard live={live} /><ExchangeRateSettings workspace={workspace} mutate={mutate} /></aside></section>;
}

function ExchangeRateSettings({ workspace, mutate }: { workspace: WorkspaceData; mutate: FinanceMutate }) {
  const [method, setMethod] = useState(workspace.exchangeRatePreference ?? "");
  const saveMethod = async () => { try { await mutate("/api/settings/exchange-rate", "PATCH", { method: method || null }); } catch (error) { window.alert(messageOf(error)); } };
  const saveRate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try { await mutate("/api/exchange-rates", "POST", { rateDate: data.get("rateDate"), sourceCurrency: data.get("sourceCurrency"), rateToUsd: Number(data.get("rateToUsd")), source: data.get("source"), methodology: data.get("methodology"), estimated: data.get("estimated") === "on", transactionIds: [] }); } catch (error) { window.alert(messageOf(error)); }
  };
  return <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Historical exchange rates</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">USD is the reporting currency. Historical ARS is never converted with today&apos;s rate or an unconfirmed method.</p><Field label="Preferred ARS method"><select value={method} onChange={(event) => setMethod(event.target.value)} className="field"><option value="">Ask me before choosing</option><option value="personal_arq_conversion">My linked ARQ conversion</option><option value="mep">MEP</option><option value="official">Official</option><option value="blue">Blue</option><option value="card">Card</option><option value="custom">Custom</option></select></Field><button disabled={workspace.mode !== "live"} onClick={() => void saveMethod()} className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold disabled:opacity-45">Save methodology</button><form onSubmit={(event) => void saveRate(event)} className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-5"><Field label="Date"><input required name="rateDate" type="date" className="field" /></Field><Field label="From"><input required name="sourceCurrency" defaultValue="ARS" className="field" /></Field><Field label="USD per unit"><input required name="rateToUsd" type="number" min="0" step="any" className="field" /></Field><Field label="Source"><input required name="source" placeholder="ARQ conversion" className="field" /></Field><div className="col-span-2"><Field label="Methodology"><input required name="methodology" placeholder="Personal conversion / MEP / other" className="field" /></Field></div><label className="col-span-2 flex items-center gap-2 text-xs"><input name="estimated" type="checkbox" />Mark this rate as estimated</label><button disabled={workspace.mode !== "live"} className="col-span-2 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">Apply rate to that date</button></form></article>;
}

function ConnectionCard({ live }: { live: boolean }) { return <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Connection</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{live ? "Signed in. Database, private storage, and Row Level Security are active." : "Sign in to load your private financial workspace. No sample or demo transactions are displayed."}</p>{!live ? <a href="/login" className="mt-4 inline-block rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white">Open sign in</a> : null}</article>; }
function NavItem({ icon: Icon, label, active, badge, onSelect }: { icon: typeof LayoutDashboard; label: string; active: boolean; badge?: number; onSelect: () => void }) { return <button onClick={onSelect} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium transition ${active ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" className="size-[18px]" /><span>{label}</span>{badge ? <span className="ml-auto rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-bold text-[#8a4b21]">{badge}</span> : null}</button>; }
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="border-b border-[var(--line)] px-5 py-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p></div>; }
function EmptyPanel({ icon: Icon, title, body }: { icon: typeof CheckCircle2; title: string; body: string }) { return <div className="grid min-h-64 place-items-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--forest-soft)] text-[var(--forest)]"><Icon aria-hidden="true" className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p></div></div>; }
function StatusBadge({ value }: { value: string }) { const color = ["confirmed", "active", "posted"].includes(value) ? "bg-[var(--forest-soft)] text-[var(--forest)]" : ["rejected", "failed", "inactive"].includes(value) ? "bg-[#f7e3df] text-[var(--danger)]" : "bg-[var(--paper-deep)] text-[var(--muted)]"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{value.replaceAll("_", " ")}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-semibold text-[var(--muted)]">{label}{children}</label>; }
function formatDate(value: string) { return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function formatMoney(value: string | number | null | undefined, currency: string | null | undefined) { if (value == null || !currency) return "—"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); } catch { return `${currency} ${Number(value).toLocaleString()}`; } }
function messageOf(error: unknown) { return error instanceof Error ? error.message : "The change could not be saved."; }
