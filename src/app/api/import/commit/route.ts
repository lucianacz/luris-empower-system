import Decimal from "decimal.js";
import { ensureDefaultCategories, suggestDefaultCategory } from "@/lib/categories/defaults";
import { matchKnownMerchant, normalizeUserCountryHint, resolvedKnownMerchantKind, resolvedKnownMerchantName } from "@/lib/categories/known-merchants";
import { partitionDuplicates } from "@/lib/import/duplicates";
import { previewFile } from "@/lib/import/engine";
import { stableFingerprint } from "@/lib/import/normalize";
import { canonicalMerchant } from "@/lib/reporting/report";
import { providers, type ColumnMapping, type InvestmentStatementPreview, type NormalizedTransaction, type Provider } from "@/lib/import/types";
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
  const insertedInvestmentTransactionIds: string[] = [];
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a statement file to import." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "Files must be 15 MB or smaller." }, { status: 413 });

    const providerValue = form.get("provider");
    const provider = typeof providerValue === "string" && providers.includes(providerValue as Provider) ? providerValue as Provider : undefined;
    const deferAnalysis = form.get("deferAnalysis") === "true";
    const ownerPersonIdValue = form.get("ownerPersonId");
    const ownerPersonId = typeof ownerPersonIdValue === "string" && ownerPersonIdValue ? ownerPersonIdValue : null;
    if (ownerPersonId) {
      const { data: owner } = await supabase.from("people").select("id").eq("id", ownerPersonId).eq("user_id", user.id).maybeSingle();
      if (!owner) return Response.json({ error: "Choose an account owner from this workspace." }, { status: 400 });
    }
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
      const countQuery = isInvestmentStatement ? supabase.from("investment_transactions") : supabase.from("transactions");
      const { count, error: countError } = await countQuery.select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("import_batch_id", existingBatch.id);
      if (countError) throw countError;
      existingTransactionCount = count ?? 0;
      const completeInvestmentImport = isInvestmentStatement && existingTransactionCount > 0 && existingTransactionCount === existingBatch.imported_count;
      if (existingBatch.status !== "confirmed" || (!isInvestmentStatement && existingTransactionCount === existingBatch.imported_count) || completeInvestmentImport || !existingBatch.account_id) {
        return Response.json({ alreadyImported: true, batch: existingBatch, message: "This exact file is already in import history. No duplicate transactions were created." }, { status: 409 });
      }
      if (existingTransactionCount > existingBatch.imported_count) {
        return Response.json({ error: "The stored batch contains more transactions than its audit count. Review it before importing again." }, { status: 409 });
      }
      repairingExistingBatch = true;
      batchId = existingBatch.id;
    }

    const institution = preview.detection.provider === "generic" ? "other" : preview.detection.provider;
    const currency = ["deel", "wise"].includes(preview.detection.provider) ? "USD" : preview.summary.currencies[0] ?? "USD";
    let account: { id: string; coverage_start: string | null; coverage_end: string | null; last_transaction_at: string | null };
    if (existingBatch?.account_id) {
      const { data, error } = await supabase.from("financial_accounts").select("id,coverage_start,coverage_end,last_transaction_at").eq("id", existingBatch.account_id).eq("user_id", user.id).single();
      if (error) throw error;
      account = data;
    } else {
      const { data, error: accountError } = await supabase
        .from("financial_accounts")
        .upsert({ user_id: user.id, institution, name: preview.summary.accountLabel, currency, owner_person_id: ownerPersonId }, { onConflict: "user_id,institution,name,currency,owner_person_id" })
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

    if (isInvestmentStatement) {
      if (!preview.investmentStatement) throw new Error("The Alpaca statement was detected, but its holdings could not be parsed safely.");
      const investmentResult = await persistAlpacaStatement(supabase, user.id, ownerPersonId, account.id, batchId, preview.investmentStatement);
      insertedInvestmentTransactionIds.push(...investmentResult.transactionIds);
    }

    if (accepted.length) {
      const categoryIds = await ensureDefaultCategories(supabase, user.id);
      const { data: savedRules, error: rulesError } = await supabase.from("categorization_rules").select("match_text,category_id").eq("user_id", user.id).eq("enabled", true);
      if (rulesError) throw rulesError;
      const { data: merchantProfiles, error: merchantProfilesError } = await supabase.from("merchant_profiles").select("merchant_key,transaction_label").eq("user_id", user.id).not("transaction_label", "is", null);
      if (merchantProfilesError) throw merchantProfilesError;
      const savedCategoryIds = new Map((savedRules ?? []).map((rule) => [normalizeMatchText(rule.match_text), rule.category_id]));
      const savedMerchantLabels = new Map((merchantProfiles ?? []).map((profile) => [profile.merchant_key, profile.transaction_label]));
      const transactionRows = accepted.map((transaction) => {
        const known = matchKnownMerchant(transaction.description, transaction);
        const kind = resolvedKnownMerchantKind(known, transaction.amount, transaction.kind);
        const categoryName = suggestDefaultCategory({ ...transaction, kind });
        const merchantName = resolvedKnownMerchantName(known, transaction.description);
        const merchantKey = canonicalMerchant(merchantName);
        const categoryId = known
          ? categoryIds.get(known.categoryName ?? "") ?? null
          : savedCategoryIds.get(normalizeMatchText(transaction.description)) ?? categoryIds.get(categoryName ?? "") ?? null;
        return {
          user_id: user.id,
          account_id: account.id,
          import_batch_id: batchId,
          category_id: categoryId,
          source_transaction_id: transaction.sourceId,
          fingerprint: transaction.fingerprint,
          occurred_at: transaction.occurredAt,
          posted_at: transaction.postedAt,
          description: transaction.description,
          transaction_label: known?.transactionLabel ?? savedMerchantLabels.get(merchantKey) ?? (kind === "cash_withdrawal" ? "Cash withdrawal" : null),
          merchant_name: merchantName,
          merchant_key: merchantKey,
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
          beneficiary_scope: known?.beneficiaryScope ?? "personal",
          account_owner_id: ownerPersonId,
          paid_by_id: ownerPersonId,
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
      const questions = accepted.flatMap((transaction) => transaction.status === "posted" && Number(transaction.amount) !== 0 && (transaction.warnings.length || transaction.kind === "unknown") ? [{
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

    const dates = isInvestmentStatement && preview.investmentStatement
      ? [preview.investmentStatement.periodStart, preview.investmentStatement.periodEnd]
      : accepted.map((transaction) => transaction.occurredAt).sort();
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
      imported_count: existingTransactionCount + (isInvestmentStatement ? preview.investmentStatement?.transactions.length ?? 0 : accepted.length),
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
      importedCount: isInvestmentStatement ? preview.investmentStatement?.transactions.length ?? 0 : accepted.length,
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
    if (insertedInvestmentTransactionIds.length) await supabase.from("investment_transactions").delete().eq("user_id", user.id).in("id", insertedInvestmentTransactionIds);
    if (createdNewBatch && uploadedStoragePath) await supabase.storage.from("statement-files").remove([uploadedStoragePath]);
    if (createdNewBatch && batchId) {
      await supabase.from("transactions").delete().eq("import_batch_id", batchId).eq("user_id", user.id);
      await supabase.from("import_batches").delete().eq("id", batchId).eq("user_id", user.id);
    }
    const message = error instanceof Error ? error.message : "The import could not be confirmed.";
    return Response.json({ error: message }, { status: 422 });
  }
}

async function persistAlpacaStatement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ownerPersonId: string | null,
  financialAccountId: string,
  batchId: string,
  statement: InvestmentStatementPreview,
) {
  let accountLookupQuery = supabase.from("investment_accounts").select("id").eq("user_id", userId).eq("institution", "alpaca").eq("name", statement.accountLabel);
  accountLookupQuery = ownerPersonId ? accountLookupQuery.eq("owner_person_id", ownerPersonId) : accountLookupQuery.is("owner_person_id", null);
  const accountLookup = await accountLookupQuery.maybeSingle();
  if (accountLookup.error) throw accountLookup.error;
  let investmentAccount = accountLookup.data;
  if (!investmentAccount) {
    const created = await supabase.from("investment_accounts").insert({ user_id: userId, owner_person_id: ownerPersonId, financial_account_id: financialAccountId, institution: "alpaca", name: statement.accountLabel, base_currency: statement.currency, cash_available: statement.cashAvailable }).select("id").single();
    if (created.error) throw created.error;
    investmentAccount = created.data;
  } else {
    const { error } = await supabase.from("investment_accounts").update({ owner_person_id: ownerPersonId, financial_account_id: financialAccountId, base_currency: statement.currency, cash_available: statement.cashAvailable }).eq("id", investmentAccount.id).eq("user_id", userId);
    if (error) throw error;
  }

  const assets = new Map<string, string>();
  for (const position of statement.positions) {
    const { data: asset, error: assetError } = await supabase.from("investment_assets").upsert({ user_id: userId, symbol: position.symbol, name: position.name, asset_type: position.assetType, currency: statement.currency }, { onConflict: "user_id,symbol,name" }).select("id").single();
    if (assetError) throw assetError;
    assets.set(position.symbol, asset.id);
    const { error: positionError } = await supabase.from("investment_positions").upsert({ user_id: userId, investment_account_id: investmentAccount.id, asset_id: asset.id, import_batch_id: batchId, quantity: position.quantity, cost_basis: position.costBasis, current_value: position.currentValue, realized_profit_loss: 0, unrealized_profit_loss: position.unrealizedProfitLoss, currency: statement.currency, valuation_date: statement.periodEnd }, { onConflict: "investment_account_id,asset_id" });
    if (positionError) throw positionError;
  }

  const positionsValue = statement.positions.reduce((sum, position) => sum + position.currentValue, 0);
  const unrealizedProfitLoss = statement.positions.reduce((sum, position) => sum + position.unrealizedProfitLoss, 0);
  const { error: snapshotError } = await supabase.from("portfolio_snapshots").upsert({ user_id: userId, investment_account_id: investmentAccount.id, import_batch_id: batchId, valuation_date: statement.periodEnd, cash_value: statement.cashAvailable, positions_value: positionsValue, total_value: statement.totalMarketValue, contributions: statement.yearToDate.contributions, withdrawals: statement.yearToDate.withdrawals, dividends: statement.yearToDate.dividends, interest: statement.yearToDate.interest, fees: statement.yearToDate.fees, taxes: statement.yearToDate.taxes, realized_profit_loss: statement.yearToDate.realizedProfitLoss, unrealized_profit_loss: unrealizedProfitLoss, currency: statement.currency }, { onConflict: "investment_account_id,valuation_date" });
  if (snapshotError) throw snapshotError;

  const transactionRows = statement.transactions.map((transaction) => ({
    user_id: userId,
    investment_account_id: investmentAccount!.id,
    asset_id: transaction.symbol ? assets.get(transaction.symbol) ?? null : null,
    import_batch_id: batchId,
    occurred_at: transaction.occurredAt,
    transaction_type: transaction.transactionType,
    quantity: transaction.quantity,
    unit_price: transaction.unitPrice,
    gross_amount: transaction.grossAmount,
    fee_amount: transaction.feeAmount,
    tax_amount: 0,
    currency: statement.currency,
    cost_basis: transaction.transactionType === "purchase" ? transaction.grossAmount : null,
    metadata: { source: "Alpaca monthly statement", description: transaction.description, statementPeriodEnd: statement.periodEnd },
  }));
  const inserted = transactionRows.length ? await supabase.from("investment_transactions").insert(transactionRows).select("id") : { data: [], error: null };
  if (inserted.error) throw inserted.error;
  return { transactionIds: (inserted.data ?? []).map((transaction) => transaction.id) };
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
