import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: RouteContext<"/api/import/batches/[id]">) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in before rolling back an import." }, { status: 401 });
  const { error } = await supabase.rpc("rollback_import_batch", { target_batch_id: id });
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ message: "The imported transactions were removed. The original statement remains in secure import history." });
}
