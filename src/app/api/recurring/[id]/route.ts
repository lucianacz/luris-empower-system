import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  providerName: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual", "uncertain"]).optional(),
  status: z.enum(["active", "inactive", "uncertain"]).optional(),
  countryCode: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = schema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: obligation, error: obligationError } = await supabase.from("recurring_obligations").select("id,merchant_key,merchant_profile_id,provider_name").eq("id", id).eq("user_id", user.id).single();
  if (obligationError) return Response.json({ error: obligationError.message }, { status: 404 });
  if (input.data.categoryId) {
    const { data: category } = await supabase.from("categories").select("id").eq("id", input.data.categoryId).eq("user_id", user.id).maybeSingle();
    if (!category) return Response.json({ error: "Choose a category from your workspace." }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (input.data.providerName) update.provider_name = input.data.providerName;
  if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
  if (input.data.frequency) update.frequency = input.data.frequency;
  if (input.data.status) update.status = input.data.status;
  if (input.data.countryCode !== undefined) update.country_code = input.data.countryCode;
  const { error } = await supabase.from("recurring_obligations").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  if (input.data.providerName || input.data.categoryId !== undefined || input.data.countryCode !== undefined) {
    const merchantUpdate: Record<string, unknown> = {};
    if (input.data.providerName) merchantUpdate.display_name = input.data.providerName;
    if (input.data.categoryId !== undefined) merchantUpdate.category_id = input.data.categoryId;
    if (input.data.countryCode !== undefined) merchantUpdate.country_code = input.data.countryCode;
    if (obligation.merchant_profile_id) {
      const { error: merchantError } = await supabase.from("merchant_profiles").update(merchantUpdate).eq("id", obligation.merchant_profile_id).eq("user_id", user.id);
      if (merchantError) return Response.json({ error: merchantError.message }, { status: 422 });
    }
    const { data: links, error: linkError } = await supabase.from("recurring_obligation_transactions").select("transaction_id").eq("recurring_obligation_id", id).eq("user_id", user.id);
    if (linkError) return Response.json({ error: linkError.message }, { status: 422 });
    const transactionIds = (links ?? []).map((link) => link.transaction_id);
    if (transactionIds.length) {
      const transactionUpdate: Record<string, unknown> = {};
      if (input.data.providerName) transactionUpdate.merchant_name = input.data.providerName;
      if (input.data.categoryId !== undefined) transactionUpdate.category_id = input.data.categoryId;
      if (input.data.countryCode !== undefined) transactionUpdate.merchant_country = input.data.countryCode;
      const { error: transactionError } = await supabase.from("transactions").update(transactionUpdate).eq("user_id", user.id).in("id", transactionIds);
      if (transactionError) return Response.json({ error: transactionError.message }, { status: 422 });
      if (input.data.categoryId) {
        const { data: transactions, error: descriptionsError } = await supabase.from("transactions").select("description").eq("user_id", user.id).in("id", transactionIds);
        if (descriptionsError) return Response.json({ error: descriptionsError.message }, { status: 422 });
        for (const description of [...new Set((transactions ?? []).map((transaction) => transaction.description))]) {
          const { error: ruleError } = await supabase.from("categorization_rules").upsert({ user_id: user.id, category_id: input.data.categoryId, name: `${input.data.providerName || obligation.provider_name} recurring rule`, match_text: description.trim().toLocaleLowerCase(), conditions: { descriptionEquals: description }, enabled: true }, { onConflict: "user_id,match_text" });
          if (ruleError) return Response.json({ error: ruleError.message }, { status: 422 });
        }
      }
    }
  }
  return Response.json({ message: "Recurring expense updated." });
}
