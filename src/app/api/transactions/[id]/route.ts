import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const correctionSchema = z.object({
  description: z.string().trim().min(1).max(240).optional(),
  kind: z.enum(["income", "expense", "transfer", "fee", "tax", "refund", "cash_withdrawal", "investment_purchase", "investment_sale", "investment_income", "unknown"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
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
  const update: Record<string, unknown> = {};
  if (input.data.description) update.description = input.data.description;
  if (input.data.kind) update.kind = input.data.kind;
  if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
  if (input.data.excludedFromTotals !== undefined) update.excluded_from_totals = input.data.excludedFromTotals;
  const { data, error } = await supabase.from("transactions").update(update).eq("id", id).eq("user_id", user.id).select("id,description,kind,category_id,excluded_from_totals").single();
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ transaction: data });
}
