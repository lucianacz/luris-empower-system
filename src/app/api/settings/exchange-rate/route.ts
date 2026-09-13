import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ method: z.enum(["personal_arq_conversion", "official", "mep", "blue", "card", "custom"]).nullable() });

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const input = schema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { error } = await supabase.from("profiles").update({ ars_exchange_rate_method: input.data.method }).eq("id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: input.data.method ? "Argentine exchange-rate method saved." : "Exchange-rate method cleared." });
}
