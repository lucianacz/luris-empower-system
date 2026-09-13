import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const splitSchema = z.object({
  splits: z.array(z.object({
    kind: z.enum(["personal", "shared", "household_member"]),
    label: z.string().trim().min(1).max(80),
    percentage: z.number().min(0).max(1).nullable().optional(),
    amount: z.number().nullable().optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/).nullable().optional(),
  })).min(1).max(20),
}).superRefine(({ splits }, context) => {
  const percentages = splits.map((split) => split.percentage).filter((value): value is number => value != null);
  if (percentages.length === splits.length && Math.abs(percentages.reduce((total, value) => total + value, 0) - 1) > 0.0001) {
    context.addIssue({ code: "custom", message: "Split percentages must add up to 100%." });
  }
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = splitSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: transaction } = await supabase.from("transactions").select("id,currency").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!transaction) return Response.json({ error: "Transaction not found." }, { status: 404 });
  const { error: deleteError } = await supabase.from("expense_splits").delete().eq("transaction_id", id).eq("user_id", user.id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 422 });
  const { data, error } = await supabase.from("expense_splits").insert(input.data.splits.map((split) => ({
    user_id: user.id,
    transaction_id: id,
    split_kind: split.kind,
    label: split.label,
    percentage: split.percentage ?? null,
    amount: split.amount ?? null,
    currency: split.currency ?? transaction.currency,
  }))).select("id,split_kind,label,percentage,amount,currency");
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ splits: data ?? [] });
}
