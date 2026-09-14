"use client";

import * as Progress from "@radix-ui/react-progress";
import { AlertTriangle, Check, FileSpreadsheet, FileText, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import { DragEvent, useCallback, useRef, useState } from "react";
import type { ColumnMapping, ColumnRole, ImportPreview, Provider } from "@/lib/import/types";
import type { WorkspacePerson } from "@/lib/workspace/demo";

const providerOptions: Array<{ value: Provider | ""; label: string }> = [
  { value: "", label: "Detect automatically" },
  { value: "deel", label: "Deel" },
  { value: "arq", label: "ARQ" },
  { value: "brubank", label: "Brubank" },
  { value: "payoneer", label: "Payoneer" },
  { value: "alpaca", label: "Alpaca investments" },
  { value: "wise", label: "Wise" },
  { value: "generic", label: "Generic statement" },
];

const columnRoles: Array<{ key: ColumnRole; label: string; required?: boolean }> = [
  { key: "date", label: "Date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Signed amount" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "currency", label: "Currency" },
  { key: "status", label: "Status" },
  { key: "externalId", label: "Transaction ID" },
  { key: "type", label: "Type" },
];

type Stage = "idle" | "previewing" | "preview" | "committing" | "complete" | "error";

export function ImportWorkspace({ people = [], defaultOwnerPersonId = null }: { people?: WorkspacePerson[]; defaultOwnerPersonId?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [provider, setProvider] = useState<Provider | "">("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [ownerPersonId, setOwnerPersonId] = useState(() => defaultOwnerPersonId ?? people.find((person) => person.role === "self")?.id ?? "");

  const runPreview = useCallback(async (selected: File, overrideProvider = provider, overrideMapping = mapping) => {
    setStage("previewing");
    setMessage("");
    const form = new FormData();
    form.set("file", selected);
    if (overrideProvider) form.set("provider", overrideProvider);
    if (Object.keys(overrideMapping).length) form.set("mapping", JSON.stringify(overrideMapping));
    try {
      const response = await fetch("/api/import/preview", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The statement could not be previewed.");
      setPreview(result);
      setMapping((current) => ({ ...result.suggestedMapping, ...current }));
      const inferredOwner = people.find((person) => person.display_name.toLocaleLowerCase() === result.ownerHint?.displayName?.toLocaleLowerCase());
      if (inferredOwner) setOwnerPersonId(inferredOwner.id);
      setStage("preview");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The statement could not be previewed.");
      setStage("error");
    }
  }, [mapping, people, provider]);

  const openFile = (selected: File, index: number) => {
    setQueueIndex(index);
    setFile(selected);
    setPreview(null);
    setMapping({});
    setProvider("");
    void runPreview(selected, "", {});
  };

  const chooseFiles = (selected: FileList | File[]) => {
    const files = Array.from(selected);
    if (!files.length) return;
    setFileQueue(files);
    openFile(files[0], 0);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFiles(event.dataTransfer.files);
  };

  const confirmImport = async () => {
    if (!file || !preview) return;
    setStage("committing");
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    if (provider) form.set("provider", provider);
    if (Object.keys(mapping).length) form.set("mapping", JSON.stringify(mapping));
    if (ownerPersonId) form.set("ownerPersonId", ownerPersonId);
    if (queueIndex < fileQueue.length - 1) form.set("deferAnalysis", "true");
    try {
      const response = await fetch("/api/import/commit", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(result.error || "The import could not be confirmed.");
      setMessage(result.message);
      setStage("complete");
      window.dispatchEvent(new Event("empower:refresh"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import could not be confirmed.");
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setFileQueue([]);
    setQueueIndex(0);
    setPreview(null);
    setMapping({});
    setProvider("");
    setMessage("");
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const progress = stage === "idle" ? 8 : stage === "previewing" ? 32 : stage === "preview" ? 66 : stage === "committing" ? 88 : stage === "complete" ? 100 : 20;

  return (
    <section className="mt-8" aria-labelledby="import-heading">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <article className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_50px_rgba(37,45,42,0.05)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--amber)]">New import</p>
                <h2 id="import-heading" className="mt-2 text-xl font-semibold tracking-[-0.03em]">Preview before anything is saved</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Upload CSV, XLSX, or PDF statements. The original file remains unchanged and every confirmed batch can be rolled back.</p>
              </div>
              {file ? <button onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold"><RotateCcw aria-hidden="true" className="size-4" /> Start over</button> : null}
            </div>

            <Progress.Root className="mt-6 h-1.5 overflow-hidden rounded-full bg-[var(--paper-deep)]" value={progress} aria-label="Import progress">
              <Progress.Indicator className="h-full bg-[var(--forest)] transition-transform duration-300" style={{ transform: `translateX(-${100 - progress}%)` }} />
            </Progress.Root>

            {!file ? (
              <div
                className={`mt-6 grid min-h-64 place-items-center rounded-[20px] border-2 border-dashed p-8 text-center transition ${dragging ? "border-[var(--forest)] bg-[var(--forest-soft)]" : "border-[#bdb5a8] bg-[var(--paper)]"}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--forest-soft)] text-[var(--forest)]"><UploadCloud aria-hidden="true" className="size-6" /></span>
                  <p className="mt-4 font-semibold">Drop all your statements here</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">One or many CSV, XLSX, or PDF files, up to 15 MB each</p>
                  <button onClick={() => inputRef.current?.click()} className="mt-5 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white">Choose files</button>
                  <input ref={inputRef} type="file" multiple className="sr-only" accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => event.target.files && chooseFiles(event.target.files)} />
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--surface)] text-[var(--forest)]">{file.name.toLowerCase().endsWith(".pdf") ? <FileText aria-hidden="true" className="size-5" /> : <FileSpreadsheet aria-hidden="true" className="size-5" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-[var(--muted)]">{formatBytes(file.size)}{fileQueue.length > 1 ? ` · File ${queueIndex + 1} of ${fileQueue.length}` : ""}</p></div>
                  {stage === "previewing" ? <Loader2 aria-label="Reading statement" className="size-5 animate-spin text-[var(--forest)]" /> : <Check aria-label="File read" className="size-5 text-[var(--forest)]" />}
                </div>

                <label className="block max-w-sm text-sm font-semibold">Institution
                  <select value={provider} onChange={(event) => { const value = event.target.value as Provider | ""; setProvider(value); void runPreview(file, value, mapping); }} className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 font-normal">
                    {providerOptions.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {people.length ? <label className="block max-w-sm text-sm font-semibold">Account owner<select value={ownerPersonId} onChange={(event) => setOwnerPersonId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 font-normal">{people.filter((person) => ["self", "partner"].includes(person.role)).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[var(--muted)]">{preview?.ownerHint ? `${preview.ownerHint.displayName} detected from the account-holder field. ` : ""}This keeps Luciana, Julian, and shared reporting separate.</span></label> : null}

                {preview?.requiresMapping ? <MappingEditor headers={preview.headers} mapping={mapping} onChange={setMapping} onApply={() => void runPreview(file, provider, mapping)} /> : null}
                {preview && !preview.requiresMapping ? <PreviewResult preview={preview} /> : null}
                {message ? <StatusMessage message={message} error={stage === "error"} /> : null}
                {stage === "complete" && queueIndex < fileQueue.length - 1 ? <button onClick={() => openFile(fileQueue[queueIndex + 1], queueIndex + 1)} className="w-full rounded-xl border border-[var(--forest)] px-4 py-3 text-sm font-semibold text-[var(--forest)]">Preview next file ({fileQueue.length - queueIndex - 1} remaining)</button> : null}

                {preview && !preview.requiresMapping && stage !== "complete" ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
                    <p className="text-sm text-[var(--muted)]">{preview.detection.provider === "alpaca" ? `Confirmation stores the original statement, ${preview.investmentStatement?.positions.length ?? 0} positions, and ${preview.investmentStatement?.transactions.length ?? 0} investment movements without adding consumer spending.` : `Confirmation saves the original statement, its checksum, and ${preview.transactions.length} normalized rows.`}</p>
                    <button disabled={stage === "committing"} onClick={() => void confirmImport()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
                      {stage === "committing" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
                      {preview.detection.provider === "alpaca" ? "Store statement" : "Confirm import"}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-4" aria-label="Import safeguards">
          <InfoCard title="What gets counted" items={["Original client payments as income", "Purchases, fees, and taxes as spending", "Owned-account transfers stay visible but excluded"]} />
          <InfoCard title="Built-in safeguards" items={["File checksum blocks repeat imports", "Transaction fingerprints catch overlaps", "Failed and reversed rows remain historical", "Rollback removes the whole batch"]} />
        </aside>
      </div>
    </section>
  );
}

function PreviewResult({ preview }: { preview: ImportPreview }) {
  const rows = preview.transactions.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Summary label="Detected" value={`${Math.round(preview.detection.confidence * 100)}% ${preview.detection.provider.toUpperCase()}`} />
        <Summary label="Ready" value={String(preview.summary.readyRows)} />
        <Summary label="Needs review" value={String(preview.summary.unresolvedRows)} />
        <Summary label="Period" value={formatPeriod(preview.summary.dateFrom, preview.summary.dateTo)} />
      </div>
      {preview.warnings.length ? <div className="rounded-xl border border-[#e3bf9f] bg-[#fbefe4] p-3 text-sm text-[#74411f]">{preview.warnings.join(" ")}</div> : null}
      {preview.investmentStatement ? <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Investment snapshot · {preview.investmentStatement.periodEnd}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><Summary label="Portfolio value" value={formatUsd(preview.investmentStatement.totalMarketValue)} /><Summary label="Cash" value={formatUsd(preview.investmentStatement.cashAvailable)} /><Summary label="YTD contributions" value={formatUsd(preview.investmentStatement.yearToDate.contributions)} /></div><div className="mt-3 flex flex-wrap gap-2">{preview.investmentStatement.positions.map((position) => <span key={position.symbol} className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold">{position.symbol} {formatUsd(position.currentValue)}</span>)}</div></div> : null}
      {!preview.investmentStatement ? (
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Normalized transaction preview</caption>
          <thead className="bg-[var(--paper)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-[var(--line)]">{rows.map((row) => <tr key={row.fingerprint}><td className="whitespace-nowrap px-4 py-3">{new Date(row.occurredAt).toLocaleDateString()}</td><td className="max-w-[260px] truncate px-4 py-3 font-medium">{row.description}</td><td className="px-4 py-3"><span className="rounded-full bg-[var(--paper-deep)] px-2.5 py-1 text-xs">{row.kind.replaceAll("_", " ")}</span></td><td className="whitespace-nowrap px-4 py-3 text-right font-mono">{row.currency} {row.amount}</td><td className="px-4 py-3">{row.warnings.length ? <span className="inline-flex items-center gap-1 text-[#8a4b21]"><AlertTriangle aria-hidden="true" className="size-3.5" /> Review</span> : row.status}</td></tr>)}</tbody>
        </table>
      </div>
      ) : null}
      {preview.transactions.length > rows.length ? <p className="text-xs text-[var(--muted)]">Showing 10 of {preview.transactions.length} normalized rows.</p> : null}
    </div>
  );
}

function MappingEditor({ headers, mapping, onChange, onApply }: { headers: string[]; mapping: ColumnMapping; onChange: (mapping: ColumnMapping) => void; onApply: () => void }) {
  return (
    <div className="rounded-2xl border border-[#e3bf9f] bg-[#fbefe4] p-4">
      <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" /><div><p className="font-semibold">Map the unfamiliar columns</p><p className="mt-1 text-sm text-[#74411f]">Date, description, and either a signed amount or debit/credit columns are required. The mapping can be saved after sign-in.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{columnRoles.map((role) => <label key={role.key} className="text-xs font-semibold">{role.label}{role.required ? " *" : ""}<select value={mapping[role.key] ?? ""} onChange={(event) => onChange({ ...mapping, [role.key]: event.target.value || undefined })} className="mt-1.5 h-10 w-full rounded-lg border border-[#d6b18f] bg-white px-2 font-normal"><option value="">Not mapped</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
      <button onClick={onApply} className="mt-4 rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white">Apply mapping</button>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--paper)] p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
function StatusMessage({ message, error }: { message: string; error: boolean }) { return <div role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${error ? "bg-[#f7e3df] text-[var(--danger)]" : "bg-[var(--forest-soft)] text-[var(--forest)]"}`}>{error ? <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}{message}</div>; }
function InfoCard({ title, items }: { title: string; items: string[] }) { return <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><h3 className="font-semibold">{title}</h3><ul className="mt-3 space-y-3">{items.map((item) => <li key={item} className="flex gap-2 text-sm leading-5 text-[var(--muted)]"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--forest)]" />{item}</li>)}</ul></article>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatPeriod(from: string | null, to: string | null) { if (!from || !to) return "Not found"; return `${new Date(from).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}–${new Date(to).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}`; }
function formatUsd(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
