"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  FileUp,
  Landmark,
  LayoutDashboard,
  Link2,
  Menu,
  PiggyBank,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { ImportWorkspace } from "@/components/import-workspace";

type View = "overview" | "imports" | "transactions" | "transfers" | "questions" | "investments" | "settings";

const viewTitles: Record<View, string> = {
  overview: "Your money, connected.",
  imports: "Import statements",
  transactions: "All transactions",
  transfers: "Transfer chains",
  questions: "Questions inbox",
  investments: "Investments",
  settings: "Settings",
};

const accounts = [
  { name: "Deel", meta: "USD account", status: "Updated Aug 29", tone: "forest" },
  { name: "ARQ", meta: "ARS wallet", status: "Updated Aug 31", tone: "amber" },
  { name: "Brubank", meta: "ARS savings", status: "Updated Aug 31", tone: "purple" },
];

const transfers = [
  { from: "Deel", to: "ARQ", amount: "$1,290.25", date: "Aug 22", confidence: "Matched" },
  { from: "ARQ", to: "Brubank", amount: "ARS 1,014,329", date: "Aug 25", confidence: "Review" },
];

export function EmpowerDashboard() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>("overview");
  const navigate = (view: View) => {
    setCurrentView(view);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-[240px] flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-5 lg:static lg:flex lg:w-auto`}
        aria-label="Primary navigation"
      >
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-[14px] bg-[var(--forest)] text-white shadow-[0_8px_24px_rgba(33,78,69,0.22)]">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Luris</p>
            <p className="text-lg font-semibold tracking-[-0.03em]">Empower</p>
          </div>
        </div>

        <nav className="mt-10 space-y-1 text-sm" aria-label="Workspace">
          <NavItem icon={LayoutDashboard} label="Overview" active={currentView === "overview"} onSelect={() => navigate("overview")} />
          <NavItem icon={FileUp} label="Imports" active={currentView === "imports"} onSelect={() => navigate("imports")} />
          <NavItem icon={WalletCards} label="Transactions" active={currentView === "transactions"} onSelect={() => navigate("transactions")} />
          <NavItem icon={Link2} label="Transfer chains" badge="2" active={currentView === "transfers"} onSelect={() => navigate("transfers")} />
          <NavItem icon={CircleHelp} label="Questions" badge="4" active={currentView === "questions"} onSelect={() => navigate("questions")} />
          <NavItem icon={PiggyBank} label="Investments" active={currentView === "investments"} onSelect={() => navigate("investments")} />
        </nav>

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <ShieldCheck aria-hidden="true" className="size-4 text-[var(--forest)]" />
              Private by design
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Your files stay tied to your account and can be rolled back by import.</p>
          </div>
          <NavItem icon={Settings2} label="Settings" active={currentView === "settings"} onSelect={() => navigate("settings")} />
        </div>
      </aside>

      {menuOpen ? <button className="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}

      <main className="min-w-0 px-4 pb-12 pt-4 sm:px-6 lg:px-10 lg:pt-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--muted)]">September 2026</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{viewTitles[currentView]}</h1>
            </div>
          </div>
          <button onClick={() => navigate("imports")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(33,78,69,0.18)] transition hover:bg-[#173d35]">
            <FileUp aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Import statements</span>
            <span className="sm:hidden">Import</span>
          </button>
        </header>

        {currentView === "imports" ? <ImportWorkspace /> : currentView !== "overview" ? <FeatureView view={currentView} /> : <>
        <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Monthly summary">
          <Metric label="Income" value="$6,000.00" note="Original client payments" icon={ArrowDownRight} tone="green" />
          <Metric label="Spending" value="$2,184.42" note="Purchases, fees and taxes" icon={ArrowUpRight} tone="amber" />
          <Metric label="Internal movement" value="$4,397.75" note="Excluded from totals" icon={Link2} tone="plain" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(37,45,42,0.06)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-5 sm:px-6">
              <div>
                <h2 className="font-semibold tracking-[-0.02em]">Account coverage</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Latest statement and transaction dates</p>
              </div>
              <button className="text-sm font-semibold text-[var(--forest)]">View all</button>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {accounts.map((account) => (
                <button key={account.name} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[var(--paper)] sm:px-6">
                  <span className={`grid size-10 place-items-center rounded-xl account-${account.tone}`}>
                    <Landmark aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{account.name}</span>
                    <span className="block text-sm text-[var(--muted)]">{account.meta}</span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block text-sm font-medium">{account.status}</span>
                    <span className="block text-xs text-[var(--muted)]">No gaps detected</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 text-[var(--muted)]" />
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-[22px] border border-[var(--line)] bg-[var(--forest)] p-5 text-white shadow-[0_18px_50px_rgba(33,78,69,0.18)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold tracking-[-0.02em]">Transfer chains</h2>
                <p className="mt-1 text-sm text-white/65">How income moved between your accounts</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">2 paths</span>
            </div>

            <div className="mt-7 space-y-3">
              {transfers.map((transfer) => (
                <div key={`${transfer.from}-${transfer.to}`} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-white/10 text-xs font-bold">{transfer.from.slice(0, 1)}</span>
                    <span className="h-px flex-1 bg-white/25" />
                    <ChevronRight aria-hidden="true" className="size-4 text-[#efb180]" />
                    <span className="h-px flex-1 bg-white/25" />
                    <span className="grid size-9 place-items-center rounded-full bg-[#efb180] text-xs font-bold text-[var(--ink)]">{transfer.to.slice(0, 1)}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{transfer.from} to {transfer.to}</p>
                      <p className="mt-0.5 text-xs text-white/60">{transfer.date} · {transfer.confidence}</p>
                    </div>
                    <p className="font-mono text-sm">{transfer.amount}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <article className="rounded-[22px] border border-dashed border-[#b8b0a3] bg-[rgba(255,253,248,0.55)] p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--amber-soft)] text-[var(--amber)]">
                <FileUp aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Monthly update</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">Drop Deel, ARQ, Brubank or Payoneer exports here. Empower previews changes and finds duplicates before anything is saved.</p>
              </div>
            </div>
            <button className="mt-5 whitespace-nowrap rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold shadow-sm sm:mt-0">Choose files</button>
          </article>

          <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--amber-soft)] text-[var(--amber)]"><CircleHelp aria-hidden="true" className="size-4" /></span>
              <div>
                <p className="font-semibold">4 questions</p>
                <p className="text-xs text-[var(--muted)]">Need your confirmation</p>
              </div>
              <ChevronRight aria-hidden="true" className="ml-auto size-4 text-[var(--muted)]" />
            </div>
          </article>
        </section>
        </>}
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, active = false, badge, onSelect }: { icon: typeof LayoutDashboard; label: string; active?: boolean; badge?: string; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium transition ${active ? "bg-[var(--forest-soft)] text-[var(--forest)]" : "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"}`} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" className="size-[18px]" />
      <span>{label}</span>
      {badge ? <span className="ml-auto rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-bold text-[#8a4b21]">{badge}</span> : null}
    </button>
  );
}

function FeatureView({ view }: { view: Exclude<View, "overview" | "imports"> }) {
  const content = {
    transactions: { title: "Normalized ledger", body: "Search, filter, categorize, and split imported activity without changing the source statement.", action: "Import transactions" },
    transfers: { title: "Follow the full path", body: "Suggested matches support currency conversion, date differences, fees, partial allocations, and multi-step account chains.", action: "Review matches" },
    questions: { title: "Resolve only what is uncertain", body: "Unknown incoming movements, cash withdrawals, and low-confidence transfer matches wait here before affecting totals.", action: "Open next question" },
    investments: { title: "Portfolio records are separate", body: "The Alpaca statement was recognized as investment data. Manual positions and snapshots are supported by the database while automated investment parsing remains deferred.", action: "Add a position" },
    settings: { title: "Workspace settings", body: "Choose a reporting currency, manage accounts, reusable import mappings, and secure statement retention.", action: "Connect Supabase" },
  }[view];
  return (
    <section className="mt-8 grid min-h-[520px] place-items-center rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--forest-soft)] text-[var(--forest)]"><Sparkles aria-hidden="true" className="size-5" /></span>
        <h2 className="mt-5 text-xl font-semibold">{content.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{content.body}</p>
        <button className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 text-sm font-semibold">{content.action}</button>
      </div>
    </section>
  );
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof ArrowDownRight; tone: "green" | "amber" | "plain" }) {
  const toneClass = tone === "green" ? "bg-[var(--forest-soft)] text-[var(--forest)]" : tone === "amber" ? "bg-[var(--amber-soft)] text-[var(--amber)]" : "bg-[var(--paper-deep)] text-[var(--muted)]";
  return (
    <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_12px_34px_rgba(37,45,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
        <span className={`grid size-8 place-items-center rounded-xl ${toneClass}`}><Icon aria-hidden="true" className="size-4" /></span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </article>
  );
}
