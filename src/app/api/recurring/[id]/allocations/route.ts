import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  transactionId: z.string().uuid(),
  allocations: z.array(z.object({ serviceMonth: z.string().regex(/^\d{4}-\d{2}$/), amount: z.number().positive(), currency: z.string().trim().min(3).max(5), reportingAmount: z.number().positive().nullable().optional(), estimated: z.boolean().default(false), notes: z.string().trim().max(300).optional() })).min(1).max(24),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = schema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const [{ data: obligation }, { data: transaction }] = await Promise.all([
    supabase.from("recurring_obligations").select("id").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("transactions").select("id").eq("id", input.data.transactionId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!obligation || !transaction) return Response.json({ error: "Recurring expense or transaction not found." }, { status: 404 });
  const rows = input.data.allocations.map((allocation) => ({ user_id: user.id, transaction_id: input.data.transactionId, recurring_obligation_id: id, service_month: `${allocation.serviceMonth}-01`, amount: allocation.amount, currency: allocation.currency.toUpperCase(), reporting_amount: allocation.reportingAmount ?? null, reporting_currency: "USD", is_estimated: allocation.estimated, notes: allocation.notes ?? null }));
  const { error: deleteError } = await supabase.from("expense_period_allocations").delete().eq("user_id", user.id).eq("transaction_id", input.data.transactionId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 422 });
  const { error } = await supabase.from("expense_period_allocations").insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: "Service-month allocation saved. Cash flow remains on the original payment date." });
}
