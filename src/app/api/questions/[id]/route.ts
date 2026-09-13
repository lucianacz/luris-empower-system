import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const resolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  kind: z.enum(["income", "expense", "transfer", "fee", "tax", "refund", "cash_withdrawal", "investment_purchase", "investment_sale", "investment_income", "unknown"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  excludedFromTotals: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
  personName: z.string().trim().min(1).max(100).optional(),
  providerName: z.string().trim().min(1).max(100).optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual", "uncertain"]).optional(),
  countryCode: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()).optional(),
  applyHistorical: z.boolean().default(true),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = resolutionSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: question, error: questionError } = await supabase.from("questions").select("transaction_id,supporting_transaction_ids,context,group_key").eq("id", id).eq("user_id", user.id).single();
  if (questionError) return Response.json({ error: questionError.message }, { status: 404 });

  if (input.data.categoryId) {
    const { data: category } = await supabase.from("categories").select("id").eq("id", input.data.categoryId).eq("user_id", user.id).maybeSingle();
    if (!category) return Response.json({ error: "Choose a category from your workspace." }, { status: 400 });
  }

  const transactionIds = input.data.applyHistorical ? [...new Set([...(question.supporting_transaction_ids ?? []), ...(question.transaction_id ? [question.transaction_id] : [])])] : question.transaction_id ? [question.transaction_id] : [];
  if (transactionIds.length && (input.data.kind || input.data.categoryId !== undefined || input.data.excludedFromTotals !== undefined)) {
    const update: Record<string, unknown> = {};
    if (input.data.kind) update.kind = input.data.kind;
    if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
    if (input.data.excludedFromTotals !== undefined) update.excluded_from_totals = input.data.excludedFromTotals;
    const { error } = await supabase.from("transactions").update(update).in("id", transactionIds).eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 422 });
  }

  const merchantKey = typeof question.context?.merchantKey === "string" ? question.context.merchantKey : null;
  let personId: string | null = null;
  if (input.data.personName) {
    const { data: person, error: personError } = await supabase.from("people").upsert({ user_id: user.id, display_name: input.data.personName, role: "provider" }, { onConflict: "user_id,display_name" }).select("id").single();
    if (personError) return Response.json({ error: personError.message }, { status: 422 });
    personId = person.id;
  }
  if (merchantKey && (input.data.providerName || input.data.personName || input.data.categoryId)) {
    const providerName = input.data.providerName || input.data.personName || merchantKey;
    const { data: merchant, error: merchantError } = await supabase.from("merchant_profiles").upsert({ user_id: user.id, merchant_key: merchantKey, display_name: providerName, category_id: input.data.categoryId ?? null, person_id: personId, country_code: input.data.countryCode ?? null }, { onConflict: "user_id,merchant_key" }).select("id").single();
    if (merchantError) return Response.json({ error: merchantError.message }, { status: 422 });
    const { error: obligationError } = await supabase.from("recurring_obligations").upsert({ user_id: user.id, merchant_profile_id: merchant.id, provider_name: providerName, merchant_key: merchantKey, category_id: input.data.categoryId ?? null, country_code: input.data.countryCode ?? null, frequency: input.data.frequency ?? "uncertain", status: "active" }, { onConflict: "user_id,merchant_key" });
    if (obligationError) return Response.json({ error: obligationError.message }, { status: 422 });
  }
  if (input.data.categoryId && transactionIds.length) {
    const { data: rows, error: rowsError } = await supabase.from("transactions").select("description").eq("user_id", user.id).in("id", transactionIds);
    if (rowsError) return Response.json({ error: rowsError.message }, { status: 422 });
    for (const description of [...new Set((rows ?? []).map((row) => row.description))]) {
      const { error: ruleError } = await supabase.from("categorization_rules").upsert({ user_id: user.id, category_id: input.data.categoryId, name: `Exact match: ${description.slice(0, 80)}`, match_text: description.trim().toLocaleLowerCase(), conditions: { descriptionEquals: description }, enabled: true }, { onConflict: "user_id,match_text" });
      if (ruleError) return Response.json({ error: ruleError.message }, { status: 422 });
    }
  }
  const { error } = await supabase.from("questions").update({ status: input.data.status, resolution: input.data, resolved_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: "Question resolved and totals will use the confirmed treatment." });
}
