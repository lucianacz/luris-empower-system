import { rebuildSpendingIntelligence } from "@/lib/intelligence/persist";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const result = await rebuildSpendingIntelligence(supabase, user.id);
    return Response.json({ ...result, message: `Analysis refreshed. ${result.obligationCount} recurring patterns and ${result.questionCount} priority questions are ready.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Spending analysis could not be refreshed." }, { status: 422 });
  }
}
