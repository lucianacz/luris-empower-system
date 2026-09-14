import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const goalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.enum(["personal", "shared"]),
  ownerPersonId: z.string().uuid().nullable().optional(),
  targetAmount: z.number().positive().finite(),
  savedAmount: z.number().min(0).finite().default(0),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/).default("USD"),
  targetDate: z.iso.date().nullable().optional(),
  status: z.enum(["active", "completed", "paused"]).default("active"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const input = goalSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const ownerPersonId = input.data.scope === "personal" ? input.data.ownerPersonId ?? null : null;
  if (input.data.scope === "personal" && !ownerPersonId) return Response.json({ error: "Choose the owner of a personal goal." }, { status: 400 });
  if (ownerPersonId) {
    const { data: owner } = await supabase.from("people").select("id").eq("user_id", user.id).eq("id", ownerPersonId).maybeSingle();
    if (!owner) return Response.json({ error: "Choose a person from this workspace." }, { status: 400 });
  }
  const { data, error } = await supabase.from("savings_goals").insert({
    user_id: user.id,
    owner_person_id: ownerPersonId,
    name: input.data.name,
    scope: input.data.scope,
    target_amount: input.data.targetAmount,
    saved_amount: input.data.savedAmount,
    currency: input.data.currency,
    target_date: input.data.targetDate ?? null,
    status: input.data.status,
    notes: input.data.notes || null,
  }).select("id").single();
  if (error) return Response.json({ error: error.code === "23505" ? "A savings goal with this name already exists." : error.message }, { status: 422 });
  return Response.json({ message: "Savings goal added.", goalId: data.id }, { status: 201 });
}
