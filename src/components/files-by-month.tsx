"use client";

import { CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import type { WorkspaceData } from "@/lib/workspace/demo";

export function FilesByMonth({ workspace }: { workspace: WorkspaceData }) {
  const months = useMemo(() => monthKeys("2025-01", workspace.asOfDate.slice(0, 7)), [workspace.asOfDate]);
  const grouped = useMemo(() => months.map((month) => ({ month, files: workspace.imports.filter((batch) => coversMonth(batch, month)) })).reverse(), [months, workspace.imports]);
  const missing = grouped.filter((group) => group.files.length === 0).map((group) => group.month).reverse();

  return <section className="mt-7 space-y-5">
    <div className="grid gap-4 md:grid-cols-[1fr_320px]"><article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Statement coverage from 2025 to today</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">A file appears under every month covered by its statement. The original is still stored once in its import batch.</p></article><article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">{missing.length ? <><ShieldAlert aria-hidden="true" className="size-5 text-[var(--amber)]" /><strong className="mt-3 block">{missing.length} month{missing.length === 1 ? "" : "s"} with no statement</strong><p className="mt-1 text-xs text-[var(--muted)]">{missing.map(formatMonth).join(", ")}</p></> : <><CheckCircle2 aria-hidden="true" className="size-5 text-[var(--forest)]" /><strong className="mt-3 block">No calendar month is empty</strong><p className="mt-1 text-xs text-[var(--muted)]">At least one imported statement covers every month from Jan 2025 through {formatMonth(workspace.asOfDate.slice(0, 7))}.</p></>}</article></div>
    <div className="grid gap-4 xl:grid-cols-2">{grouped.map((group) => <article key={group.month} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{formatMonth(group.month)}</h2><span className="rounded-full bg-[var(--paper)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">{group.files.length} file{group.files.length === 1 ? "" : "s"}</span></div><div className="mt-4 space-y-2">{group.files.map((file) => <div key={file.id} className="flex items-start gap-3 rounded-xl bg-[var(--paper)] p-3"><FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--forest)]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.file_name}>{file.file_name}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{file.institution ?? "Other"} · {file.imported_count} rows · {file.duplicate_count} duplicates blocked</p></div></div>)}{!group.files.length ? <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No imported statement covers this month.</p> : null}</div></article>)}</div>
  </section>;
}

function coversMonth(batch: WorkspaceData["imports"][number], month: string) {
  const fallback = (batch.confirmed_at ?? batch.created_at).slice(0, 7);
  const start = batch.coverage_start?.slice(0, 7) ?? fallback;
  const end = batch.coverage_end?.slice(0, 7) ?? fallback;
  return batch.status === "confirmed" && start <= month && end >= month;
}
function monthKeys(first: string, last: string) { const values: string[] = []; const cursor = new Date(`${first}-01T00:00:00Z`); const end = new Date(`${last}-01T00:00:00Z`); while (cursor <= end) { values.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); } return values; }
function formatMonth(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }); }
