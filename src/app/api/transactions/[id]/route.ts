import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const correctionSchema = z.object({
  description: z.string().trim().min(1).max(240).optional(),
  kind: z.enum(["income", "expense", "transfer", "fee", "tax", "refund", "cash_withdrawal", "investment_purchase", "investment_sale", "investment_income", "unknown"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  applyToSimilar: z.boolean().default(true),
  excludedFromTotals: z.boolean().optional(),
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
  const update: Record<string, unknown> = {};
  if (input.data.description) update.description = input.data.description;
  if (input.data.kind) update.kind = input.data.kind;
  if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
  if (input.data.excludedFromTotals !== undefined) update.excluded_from_totals = input.data.excludedFromTotals;
  const shouldApplyCategoryRule = input.data.categoryId !== undefined && input.data.applyToSimilar && !input.data.description;
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
