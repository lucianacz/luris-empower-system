import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const correctionSchema = z.object({
  description: z.string().trim().min(1).max(240).optional(),
  kind: z.enum(["income", "expense", "transfer", "fee", "tax", "refund", "cash_withdrawal", "investment_purchase", "investment_sale", "investment_income", "unknown"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  applyToSimilar: z.boolean().default(true),
  excludedFromTotals: z.boolean().optional(),
  accountOwnerId: z.string().uuid().nullable().optional(),
  paidById: z.string().uuid().nullable().optional(),
  beneficiaryScope: z.enum(["personal", "shared", "partner", "other"]).optional(),
  reimbursementStatus: z.enum(["none", "expected", "partial", "settled", "uncertain"]).optional(),
  merchantName: z.string().trim().max(160).nullable().optional(),
  merchantCountry: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()).nullable().optional(),
  merchantCity: z.string().trim().max(100).nullable().optional(),
  locationPeriodId: z.string().uuid().nullable().optional(),
  travelOrigin: z.string().trim().max(100).nullable().optional(),
  travelDestination: z.string().trim().max(100).nullable().optional(),
  travelDate: z.iso.date().nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = correctionSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: current, error: currentError } = await supabase.from("transactions").select("description").eq("id", id).eq("user_id", user.id).single();
  if (currentError) return Response.json({ error: currentError.message }, { status: 404 });
  if (input.data.categoryId) {
    const { data: category, error: categoryError } = await supabase.from("categories").select("id").eq("id", input.data.categoryId).eq("user_id", user.id).maybeSingle();
    if (categoryError) return Response.json({ error: categoryError.message }, { status: 422 });
    if (!category) return Response.json({ error: "Choose a category from your workspace." }, { status: 400 });
  }
  const personIds = [input.data.accountOwnerId, input.data.paidById].filter((value): value is string => Boolean(value));
  if (personIds.length) {
    const { data: people } = await supabase.from("people").select("id").eq("user_id", user.id).in("id", personIds);
    if ((people ?? []).length !== new Set(personIds).size) return Response.json({ error: "Choose people from your workspace." }, { status: 400 });
  }
  if (input.data.locationPeriodId) {
    const { data: period } = await supabase.from("location_periods").select("id").eq("id", input.data.locationPeriodId).eq("user_id", user.id).maybeSingle();
    if (!period) return Response.json({ error: "Choose a location period from your workspace." }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (input.data.description) update.description = input.data.description;
  if (input.data.kind) update.kind = input.data.kind;
  if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
  if (input.data.excludedFromTotals !== undefined) update.excluded_from_totals = input.data.excludedFromTotals;
  if (input.data.accountOwnerId !== undefined) update.account_owner_id = input.data.accountOwnerId;
  if (input.data.paidById !== undefined) update.paid_by_id = input.data.paidById;
  if (input.data.beneficiaryScope) update.beneficiary_scope = input.data.beneficiaryScope;
  if (input.data.reimbursementStatus) update.reimbursement_status = input.data.reimbursementStatus;
  if (input.data.merchantName !== undefined) update.merchant_name = input.data.merchantName;
  if (input.data.merchantCountry !== undefined) update.merchant_country = input.data.merchantCountry;
  if (input.data.merchantCity !== undefined) update.merchant_city = input.data.merchantCity;
  if (input.data.locationPeriodId !== undefined) update.location_period_id = input.data.locationPeriodId;
  if (input.data.travelOrigin !== undefined) update.travel_origin = input.data.travelOrigin;
  if (input.data.travelDestination !== undefined) update.travel_destination = input.data.travelDestination;
  if (input.data.travelDate !== undefined) update.travel_date = input.data.travelDate;
  const hasTransactionSpecificFields = [input.data.accountOwnerId, input.data.paidById, input.data.beneficiaryScope, input.data.reimbursementStatus, input.data.merchantName, input.data.merchantCountry, input.data.merchantCity, input.data.locationPeriodId, input.data.travelOrigin, input.data.travelDestination, input.data.travelDate].some((value) => value !== undefined);
  const shouldApplyCategoryRule = input.data.categoryId !== undefined && input.data.applyToSimilar && !input.data.description && !input.data.kind && input.data.excludedFromTotals === undefined && !hasTransactionSpecificFields;
  let query = supabase.from("transactions").update(update).eq("user_id", user.id);
  query = shouldApplyCategoryRule ? query.eq("description", current.description) : query.eq("id", id);
  const { error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 422 });

  if (shouldApplyCategoryRule) {
    const matchText = normalizeMatchText(current.description);
    if (input.data.categoryId) {
      const { error: ruleError } = await supabase.from("categorization_rules").upsert({
        user_id: user.id,
        category_id: input.data.categoryId,
        name: `Exact match: ${current.description.slice(0, 80)}`,
        match_text: matchText,
        conditions: { descriptionEquals: current.description },
        enabled: true,
      }, { onConflict: "user_id,match_text" });
      if (ruleError) return Response.json({ error: ruleError.message }, { status: 422 });
    } else {
      const { error: ruleError } = await supabase.from("categorization_rules").delete().eq("user_id", user.id).eq("match_text", matchText);
      if (ruleError) return Response.json({ error: ruleError.message }, { status: 422 });
    }
  }

  const { data, error: reloadError } = await supabase.from("transactions").select("id,description,kind,category_id,excluded_from_totals").eq("id", id).eq("user_id", user.id).single();
  if (reloadError) return Response.json({ error: reloadError.message }, { status: 422 });
  return Response.json({ transaction: data, appliedToSimilar: shouldApplyCategoryRule });
}

function normalizeMatchText(value: string) {
  return value.trim().toLocaleLowerCase();
}
