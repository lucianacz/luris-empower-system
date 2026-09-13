import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const resolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  kind: z.enum(["income", "expense", "transfer", "fee", "tax", "refund", "cash_withdrawal", "investment_purchase", "investment_sale", "investment_income", "unknown"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  excludedFromTotals: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = resolutionSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: question, error: questionError } = await supabase.from("questions").select("transaction_id").eq("id", id).eq("user_id", user.id).single();
  if (questionError) return Response.json({ error: questionError.message }, { status: 404 });

  if (question.transaction_id && (input.data.kind || input.data.categoryId !== undefined || input.data.excludedFromTotals !== undefined)) {
    const update: Record<string, unknown> = {};
    if (input.data.kind) update.kind = input.data.kind;
    if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
    if (input.data.excludedFromTotals !== undefined) update.excluded_from_totals = input.data.excludedFromTotals;
    const { error } = await supabase.from("transactions").update(update).eq("id", question.transaction_id).eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 422 });
  }
  const { error } = await supabase.from("questions").update({ status: input.data.status, resolution: input.data, resolved_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: "Question resolved and totals will use the confirmed treatment." });
}
