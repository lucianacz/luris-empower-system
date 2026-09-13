import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rebuildTransferSuggestions } from "@/lib/transfers/persist";

export async function POST() {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in before rebuilding transfer suggestions." }, { status: 401 });
  try {
    const count = await rebuildTransferSuggestions(supabase, user.id);
    return Response.json({ count, message: `${count} transfer chain${count === 1 ? "" : "s"} suggested.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Transfer suggestions could not be rebuilt." }, { status: 422 });
  }
}
