import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const statusSchema = z.object({ status: z.enum(["confirmed", "rejected"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = statusSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: chain } = await supabase.from("transfer_chains").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!chain) return Response.json({ error: "Transfer chain not found." }, { status: 404 });
  if (input.data.status === "confirmed") {
    const { data: members, error: memberError } = await supabase.from("transfer_chain_members").select("transaction_id").eq("transfer_chain_id", id).eq("user_id", user.id);
    if (memberError) return Response.json({ error: memberError.message }, { status: 422 });
    const transactionIds = (members ?? []).map((member) => member.transaction_id);
    if (transactionIds.length) {
      const { error } = await supabase.from("transactions").update({ kind: "transfer", excluded_from_totals: true }).eq("user_id", user.id).in("id", transactionIds);
      if (error) return Response.json({ error: error.message }, { status: 422 });
    }
  }
  const { error } = await supabase.from("transfer_chains").update({ status: input.data.status }).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: input.data.status === "confirmed" ? "Transfer confirmed and excluded from income and spending." : "Transfer suggestion rejected." });
}
