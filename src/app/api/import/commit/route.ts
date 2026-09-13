import Decimal from "decimal.js";
import { ensureDefaultCategories, suggestDefaultCategory } from "@/lib/categories/defaults";
import { matchKnownMerchant, normalizeUserCountryHint, resolvedKnownMerchantKind } from "@/lib/categories/known-merchants";
import { partitionDuplicates } from "@/lib/import/duplicates";
import { previewFile } from "@/lib/import/engine";
import { stableFingerprint } from "@/lib/import/normalize";
import { canonicalMerchant } from "@/lib/reporting/report";
import { providers, type ColumnMapping, type NormalizedTransaction, type Provider } from "@/lib/import/types";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rebuildTransferSuggestions } from "@/lib/transfers/persist";
import { rebuildSpendingIntelligence } from "@/lib/intelligence/persist";

export const runtime = "nodejs";
export const maxDuration = 45;

const maxBytes = 15 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Connect Supabase before confirming imports. Preview remains available without it." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in before importing statements." }, { status: 401 });

  let batchId: string | null = null;
  let uploadedStoragePath: string | null = null;
  let createdNewBatch = false;
  let repairingExistingBatch = false;
  const insertedTransactionIds: string[] = [];
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a statement file to import." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "Files must be 15 MB or smaller." }, { status: 413 });

    const providerValue = form.get("provider");
    const provider = typeof providerValue === "string" && providers.includes(providerValue as Provider) ? providerValue as Provider : undefined;
    const deferAnalysis = form.get("deferAnalysis") === "true";
    const mappingValue = form.get("mapping");
    const mapping = typeof mappingValue === "string" && mappingValue ? JSON.parse(mappingValue) as ColumnMapping : undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await previewFile({ name: file.name, mimeType: file.type, bytes }, { provider, mapping });
    if (preview.requiresMapping) return Response.json({ error: "Complete the column mapping before importing." }, { status: 422 });
    const isInvestmentStatement = preview.detection.provider === "alpaca";

    const { data: existingBatch, error: existingBatchError } = await supabase.from("import_batches").select("id,status,imported_count,duplicate_count,account_id").eq("user_id", user.id).eq("file_checksum", preview.checksum).maybeSingle();
    if (existingBatchError) throw existingBatchError;
    let existingTransactionCount = 0;
    if (existingBatch) {
      const { count, error: countError } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("import_batch_id", existingBatch.id);
      if (countError) throw countError;
      existingTransactionCount = count ?? 0;
      if (existingBatch.status !== "confirmed" || existingTransactionCount === existingBatch.imported_count || !existingBatch.account_id) {
        return Response.json({ alreadyImported: true, batch: existingBatch, message: "This exact file is already in import history. No duplicate transactions were created." }, { status: 409 });
      }
      if (existingTransactionCount > existingBatch.imported_count) {
        return Response.json({ error: "The stored batch contains more transactions than its audit count. Review it before importing again." }, { status: 409 });
      }
      repairingExistingBatch = true;
      batchId = existingBatch.id;
    }

    const institution = preview.detection.provider === "generic" ? "other" : preview.detection.provider;
    const currency = preview.detection.provider === "deel" ? "USD" : preview.summary.currencies[0] ?? "USD";
    let account: { id: string; coverage_start: string | null; coverage_end: string | null; last_transaction_at: string | null };
    if (existingBatch?.account_id) {
      const { data, error } = await supabase.from("financial_accounts").select("id,coverage_start,coverage_end,last_transaction_at").eq("id", existingBatch.account_id).eq("user_id", user.id).single();
      if (error) throw error;
      account = data;
    } else {
      const { data, error: accountError } = await supabase
        .from("financial_accounts")
        .upsert({ user_id: user.id, institution, name: preview.summary.accountLabel, currency }, { onConflict: "user_id,institution,name,currency" })
        .select("id,coverage_start,coverage_end,last_transaction_at")
        .single();
      if (accountError) throw accountError;
      account = data;

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
        coverage_start: preview.summary.dateFrom?.slice(0, 10) ?? null,
        coverage_end: preview.summary.dateTo?.slice(0, 10) ?? null,
      }).select("id").single();
      if (batchError) throw batchError;
      batchId = batch.id;
      createdNewBatch = true;

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
      uploadedStoragePath = storagePath;
      const { error: fileError } = await supabase.from("import_files").insert({ user_id: user.id, import_batch_id: batch.id, storage_path: storagePath, content_type: file.type || null });
      if (fileError) throw fileError;
    }

    if (!batchId) throw new Error("The import batch could not be prepared.");

    const existingTransactions: Array<{ source_transaction_id: string | null; fingerprint: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("transactions").select("source_transaction_id,fingerprint").eq("user_id", user.id).eq("account_id", account.id).range(from, from + 999);
      if (error) throw error;
      existingTransactions.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const userFingerprints: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("transactions").select("fingerprint").eq("user_id", user.id).range(from, from + 999);
      if (error) throw error;
      userFingerprints.push(...(data ?? []).map((item) => item.fingerprint));
      if (!data || data.length < 1000) break;
    }
    const duplicateKeys = [
      ...userFingerprints.map((fingerprint) => ({ sourceId: null, fingerprint })),
      ...existingTransactions.map((item) => ({ sourceId: item.source_transaction_id, fingerprint: item.fingerprint })),
    ];
    const { accepted, duplicates } = partitionDuplicates(preview.transactions, duplicateKeys);

    if (accepted.length) {
      const categoryIds = await ensureDefaultCategories(supabase, user.id);
      const { data: savedRules, error: rulesError } = await supabase.from("categorization_rules").select("match_text,category_id").eq("user_id", user.id).eq("enabled", true);
      if (rulesError) throw rulesError;
      const savedCategoryIds = new Map((savedRules ?? []).map((rule) => [normalizeMatchText(rule.match_text), rule.category_id]));
      const transactionRows = accepted.map((transaction) => {
        const known = matchKnownMerchant(transaction.description);
        const kind = resolvedKnownMerchantKind(known, transaction.amount, transaction.kind);
        const categoryName = suggestDefaultCategory({ ...transaction, kind });
        const merchantName = known?.displayName ?? transaction.description;
        return {
          user_id: user.id,
          account_id: account.id,
          import_batch_id: batchId,
          category_id: savedCategoryIds.get(normalizeMatchText(transaction.description)) ?? categoryIds.get(categoryName ?? "") ?? null,
          source_transaction_id: transaction.sourceId,
          fingerprint: transaction.fingerprint,
          occurred_at: transaction.occurredAt,
          posted_at: transaction.postedAt,
          description: transaction.description,
          merchant_name: merchantName,
          merchant_key: canonicalMerchant(merchantName),
          merchant_country: known?.countryCode ?? normalizeUserCountryHint(transaction.metadata.merchantCountry),
          merchant_city: typeof transaction.metadata.merchantCity === "string" ? transaction.metadata.merchantCity : null,
          amount: transaction.amount,
          currency: transaction.currency,
          original_amount: transaction.originalAmount,
          original_currency: transaction.originalCurrency,
          fee_amount: transaction.feeAmount,
          fee_currency: transaction.feeCurrency,
          status: transaction.status,
          kind,
          excluded_from_totals: known?.excludedFromTotals ?? transaction.excludedFromTotals,
          metadata: transaction.metadata,
        };
      });
      const inserted: Array<{ id: string; fingerprint: string }> = [];
      for (let index = 0; index < transactionRows.length; index += 500) {
        const result = await supabase.from("transactions").insert(transactionRows.slice(index, index + 500)).select("id,fingerprint");
        if (result.error) throw result.error;
        inserted.push(...(result.data ?? []));
        insertedTransactionIds.push(...(result.data ?? []).map((item) => item.id));
      }
      const insertedByFingerprint = new Map((inserted ?? []).map((item) => [item.fingerprint, item.id]));
      await persistArqConversionRates(supabase, user.id, accepted);
      const questions = accepted.flatMap((transaction) => transaction.warnings.length || transaction.kind === "unknown" ? [{
        user_id: user.id,
        transaction_id: insertedByFingerprint.get(transaction.fingerprint) ?? null,
        import_batch_id: batchId,
        question_type: transaction.kind === "unknown" ? "classification" : "import_warning",
        prompt: transaction.kind === "unknown" ? `How should “${transaction.description}” be classified?` : transaction.warnings[0],
        context: { warnings: transaction.warnings, fingerprint: transaction.fingerprint },
      }] : []);
      for (let index = 0; index < questions.length; index += 250) {
        const { error: questionError } = await supabase.from("questions").insert(questions.slice(index, index + 250));
        if (questionError) throw questionError;
      }
    }

    const dates = accepted.map((transaction) => transaction.occurredAt).sort();
    const coverageStart = earliestDate(account.coverage_start, dates[0]?.slice(0, 10));
    const coverageEnd = latestDate(account.coverage_end, dates.at(-1)?.slice(0, 10));
    const lastTransactionAt = latestDate(account.last_transaction_at, dates.at(-1));
    const { error: accountUpdateError } = await supabase.from("financial_accounts").update({
      last_imported_at: new Date().toISOString(),
      last_transaction_at: lastTransactionAt,
      coverage_start: coverageStart,
      coverage_end: coverageEnd,
    }).eq("id", account.id);
    if (accountUpdateError) throw accountUpdateError;

    const { error: confirmError } = await supabase.from("import_batches").update({
      status: "confirmed",
      imported_count: existingTransactionCount + accepted.length,
      duplicate_count: duplicates.length,
      confirmed_at: new Date().toISOString(),
    }).eq("id", batchId);
    if (confirmError) throw confirmError;

    let transferSuggestionCount = 0;
    let transferWarning: string | null = null;
    if (accepted.length && !deferAnalysis) {
      try {
        transferSuggestionCount = await rebuildTransferSuggestions(supabase, user.id);
      } catch {
        transferWarning = "Transactions imported, but transfer suggestions need to be rebuilt from the Transfer chains view.";
      }
    }

    let intelligenceWarning: string | null = null;
    if (accepted.length && !deferAnalysis) {
      try {
        await rebuildSpendingIntelligence(supabase, user.id);
      } catch {
        intelligenceWarning = "Transactions imported, but proactive spending analysis needs to be refreshed from the Questions view.";
      }
    }

    return Response.json({
      batchId,
      repaired: repairingExistingBatch,
      importedCount: accepted.length,
      duplicateCount: duplicates.length,
      unresolvedCount: preview.summary.unresolvedRows,
      transferSuggestionCount,
      transferWarning,
      intelligenceWarning,
      message: repairingExistingBatch
        ? `Recovered ${accepted.length} missing transaction${accepted.length === 1 ? "" : "s"} from the stored statement.`
        : isInvestmentStatement
        ? "Investment statement stored securely. No consumer-spending transactions were created."
        : `Imported ${accepted.length} new transaction${accepted.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if (repairingExistingBatch && insertedTransactionIds.length) {
      await supabase.from("transactions").delete().eq("user_id", user.id).in("id", insertedTransactionIds);
    }
    if (createdNewBatch && uploadedStoragePath) await supabase.storage.from("statement-files").remove([uploadedStoragePath]);
    if (createdNewBatch && batchId) {
      await supabase.from("transactions").delete().eq("import_batch_id", batchId).eq("user_id", user.id);
      await supabase.from("import_batches").delete().eq("id", batchId).eq("user_id", user.id);
    }
    const message = error instanceof Error ? error.message : "The import could not be confirmed.";
    return Response.json({ error: message }, { status: 422 });
  }
}

function earliestDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left < right ? left : right;
}

function latestDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left > right ? left : right;
}

function normalizeMatchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

async function persistArqConversionRates(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, transactions: NormalizedTransaction[]) {
  const groups = new Map<string, { date: string; sourceCurrency: string; usd: Decimal; local: Decimal }>();
  for (const transaction of transactions) {
    if (transaction.metadata.exchangeRateSource !== "ARQ personal conversion" || !transaction.originalCurrency || !transaction.originalAmount) continue;
    const date = transaction.occurredAt.slice(0, 10);
    const sourceCurrency = transaction.originalCurrency;
    const key = `${date}:${sourceCurrency}`;
    const group = groups.get(key) ?? { date, sourceCurrency, usd: new Decimal(0), local: new Decimal(0) };
    group.usd = group.usd.plus(new Decimal(transaction.amount).abs());
    group.local = group.local.plus(new Decimal(transaction.originalAmount).abs());
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.local.isZero()) continue;
    const rateToReporting = group.usd.dividedBy(group.local).toDecimalPlaces(12).toFixed();
    const { data: rate, error: rateError } = await supabase.from("exchange_rates").upsert({ user_id: userId, rate_date: group.date, source_currency: group.sourceCurrency, reporting_currency: "USD", rate_to_reporting: rateToReporting, source: "ARQ statement conversion", methodology: "personal_arq_conversion", is_estimated: false }, { onConflict: "user_id,rate_date,source_currency,reporting_currency,source,methodology" }).select("id").single();
    if (rateError) throw rateError;
    const { data: localTransactions, error: transactionError } = await supabase.from("transactions").select("id,amount").eq("user_id", userId).eq("currency", group.sourceCurrency).gte("occurred_at", `${group.date}T00:00:00Z`).lte("occurred_at", `${group.date}T23:59:59Z`);
    if (transactionError) throw transactionError;
    const reportingRows = (localTransactions ?? []).map((transaction) => ({ user_id: userId, transaction_id: transaction.id, exchange_rate_id: rate.id, reporting_currency: "USD", reporting_amount: new Decimal(transaction.amount).times(rateToReporting).toDecimalPlaces(8).toFixed(), rate_to_reporting: rateToReporting, source: "ARQ personal conversion · daily weighted average", is_estimated: false }));
    if (reportingRows.length) {
      const { error } = await supabase.from("transaction_reporting_values").upsert(reportingRows, { onConflict: "transaction_id,reporting_currency" });
      if (error) throw error;
    }
  }
}
