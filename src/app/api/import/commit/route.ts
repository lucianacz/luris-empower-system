import { partitionDuplicates } from "@/lib/import/duplicates";
import { previewFile } from "@/lib/import/engine";
import { stableFingerprint } from "@/lib/import/normalize";
import { providers, type ColumnMapping, type Provider } from "@/lib/import/types";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rebuildTransferSuggestions } from "@/lib/transfers/persist";

export const runtime = "nodejs";
export const maxDuration = 45;

const maxBytes = 15 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Connect Supabase before confirming imports. Preview remains available without it." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in before importing statements." }, { status: 401 });

  let batchId: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a statement file to import." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "Files must be 15 MB or smaller." }, { status: 413 });

    const providerValue = form.get("provider");
    const provider = typeof providerValue === "string" && providers.includes(providerValue as Provider) ? providerValue as Provider : undefined;
    const mappingValue = form.get("mapping");
    const mapping = typeof mappingValue === "string" && mappingValue ? JSON.parse(mappingValue) as ColumnMapping : undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await previewFile({ name: file.name, mimeType: file.type, bytes }, { provider, mapping });
    if (preview.requiresMapping) return Response.json({ error: "Complete the column mapping before importing." }, { status: 422 });
    if (preview.detection.provider === "alpaca") return Response.json({ error: "Alpaca statements belong to the investment workflow, which is currently staged for manual positions and snapshots." }, { status: 422 });

    const { data: existingBatch } = await supabase.from("import_batches").select("id,status,imported_count").eq("user_id", user.id).eq("file_checksum", preview.checksum).maybeSingle();
    if (existingBatch) return Response.json({ alreadyImported: true, batch: existingBatch, message: "This exact file is already in import history. No duplicate transactions were created." }, { status: 409 });

    const institution = preview.detection.provider === "generic" ? "other" : preview.detection.provider;
    const currency = preview.summary.currencies[0] ?? "USD";
    const { data: account, error: accountError } = await supabase
      .from("financial_accounts")
      .upsert({ user_id: user.id, institution, name: preview.summary.accountLabel, currency }, { onConflict: "user_id,institution,name,currency" })
      .select("id")
      .single();
    if (accountError) throw accountError;

    const { data: batch, error: batchError } = await supabase.from("import_batches").insert({
      user_id: user.id,
      account_id: account.id,
      institution,
      status: "previewed",
      file_name: file.name,
      file_checksum: preview.checksum,
      file_size: file.size,
      source_format: preview.detection.format,
      adapter_name: preview.detection.variant ? `${preview.detection.provider}:${preview.detection.variant}` : preview.detection.provider,
      mapping: mapping ?? preview.suggestedMapping,
      warnings: preview.warnings,
      row_count: preview.summary.totalRows,
      unresolved_count: preview.summary.unresolvedRows,
    }).select("id").single();
    if (batchError) throw batchError;
    batchId = batch.id;

    if (preview.headers.length && Object.keys(mapping ?? preview.suggestedMapping).length) {
      const { error: mappingError } = await supabase.from("import_mappings").upsert({
        user_id: user.id,
        institution,
        signature: stableFingerprint(preview.headers),
        name: `${preview.summary.accountLabel} mapping`,
        mapping: mapping ?? preview.suggestedMapping,
      }, { onConflict: "user_id,institution,signature" });
      if (mappingError) throw mappingError;
    }

    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    const storagePath = `${user.id}/${batch.id}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from("statement-files").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const { error: fileError } = await supabase.from("import_files").insert({ user_id: user.id, import_batch_id: batch.id, storage_path: storagePath, content_type: file.type || null });
    if (fileError) throw fileError;

    const { data: existingTransactions, error: existingError } = await supabase.from("transactions").select("source_transaction_id,fingerprint").eq("user_id", user.id).eq("account_id", account.id);
    if (existingError) throw existingError;
    const { accepted, duplicates } = partitionDuplicates(preview.transactions, (existingTransactions ?? []).map((item) => ({ sourceId: item.source_transaction_id, fingerprint: item.fingerprint })));

    if (accepted.length) {
      const { data: inserted, error: transactionError } = await supabase.from("transactions").insert(accepted.map((transaction) => ({
        user_id: user.id,
        account_id: account.id,
        import_batch_id: batch.id,
        source_transaction_id: transaction.sourceId,
        fingerprint: transaction.fingerprint,
        occurred_at: transaction.occurredAt,
        posted_at: transaction.postedAt,
        description: transaction.description,
        amount: transaction.amount,
        currency: transaction.currency,
        original_amount: transaction.originalAmount,
        original_currency: transaction.originalCurrency,
        fee_amount: transaction.feeAmount,
        fee_currency: transaction.feeCurrency,
        status: transaction.status,
        kind: transaction.kind,
        excluded_from_totals: transaction.excludedFromTotals,
        metadata: transaction.metadata,
      }))).select("id,fingerprint");
      if (transactionError) throw transactionError;
      const insertedByFingerprint = new Map((inserted ?? []).map((item) => [item.fingerprint, item.id]));
      const questions = accepted.flatMap((transaction) => transaction.warnings.length || transaction.kind === "unknown" ? [{
        user_id: user.id,
        transaction_id: insertedByFingerprint.get(transaction.fingerprint) ?? null,
        import_batch_id: batch.id,
        question_type: transaction.kind === "unknown" ? "classification" : "import_warning",
        prompt: transaction.kind === "unknown" ? `How should “${transaction.description}” be classified?` : transaction.warnings[0],
        context: { warnings: transaction.warnings, fingerprint: transaction.fingerprint },
      }] : []);
      if (questions.length) {
        const { error: questionError } = await supabase.from("questions").insert(questions);
        if (questionError) throw questionError;
      }
    }

    const dates = accepted.map((transaction) => transaction.occurredAt).sort();
    const { error: accountUpdateError } = await supabase.from("financial_accounts").update({
      last_imported_at: new Date().toISOString(),
      last_transaction_at: dates.at(-1) ?? null,
      coverage_start: dates[0]?.slice(0, 10) ?? null,
      coverage_end: dates.at(-1)?.slice(0, 10) ?? null,
    }).eq("id", account.id);
    if (accountUpdateError) throw accountUpdateError;

    const { error: confirmError } = await supabase.from("import_batches").update({
      status: "confirmed",
      imported_count: accepted.length,
      duplicate_count: duplicates.length,
      confirmed_at: new Date().toISOString(),
    }).eq("id", batch.id);
    if (confirmError) throw confirmError;

    let transferSuggestionCount = 0;
    let transferWarning: string | null = null;
    try {
      transferSuggestionCount = await rebuildTransferSuggestions(supabase, user.id);
    } catch {
      transferWarning = "Transactions imported, but transfer suggestions need to be rebuilt from the Transfer chains view.";
    }

    return Response.json({
      batchId: batch.id,
      importedCount: accepted.length,
      duplicateCount: duplicates.length,
      unresolvedCount: preview.summary.unresolvedRows,
      transferSuggestionCount,
      transferWarning,
      message: `Imported ${accepted.length} new transaction${accepted.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if (batchId) await supabase.from("import_batches").delete().eq("id", batchId);
    const message = error instanceof Error ? error.message : "The import could not be confirmed.";
    return Response.json({ error: message }, { status: 422 });
  }
}
