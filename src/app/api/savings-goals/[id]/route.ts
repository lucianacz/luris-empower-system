import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: z.enum(["personal", "shared"]).optional(),
  ownerPersonId: z.string().uuid().nullable().optional(),
  targetAmount: z.number().positive().finite().optional(),
  savedAmount: z.number().min(0).finite().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/).optional(),
  targetDate: z.iso.date().nullable().optional(),
  status: z.enum(["active", "completed", "paused"]).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = updateSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: current, error: currentError } = await supabase.from("savings_goals").select("scope,owner_person_id").eq("user_id", user.id).eq("id", id).maybeSingle();
  if (currentError) return Response.json({ error: currentError.message }, { status: 422 });
  if (!current) return Response.json({ error: "Savings goal not found." }, { status: 404 });
  const scope = input.data.scope ?? current.scope;
  const requestedOwner = input.data.ownerPersonId === undefined ? current.owner_person_id : input.data.ownerPersonId;
  const ownerPersonId = scope === "shared" ? null : requestedOwner;
  if (scope === "personal" && !ownerPersonId) return Response.json({ error: "Choose the owner of a personal goal." }, { status: 400 });
  if (ownerPersonId) {
    const { data: owner } = await supabase.from("people").select("id").eq("user_id", user.id).eq("id", ownerPersonId).maybeSingle();
    if (!owner) return Response.json({ error: "Choose a person from this workspace." }, { status: 400 });
  }
  const update: Record<string, unknown> = { scope, owner_person_id: ownerPersonId };
  if (input.data.name !== undefined) update.name = input.data.name;
  if (input.data.targetAmount !== undefined) update.target_amount = input.data.targetAmount;
  if (input.data.savedAmount !== undefined) update.saved_amount = input.data.savedAmount;
  if (input.data.currency !== undefined) update.currency = input.data.currency;
  if (input.data.targetDate !== undefined) update.target_date = input.data.targetDate;
  if (input.data.status !== undefined) update.status = input.data.status;
  if (input.data.notes !== undefined) update.notes = input.data.notes || null;
  const { error } = await supabase.from("savings_goals").update(update).eq("user_id", user.id).eq("id", id);
  if (error) return Response.json({ error: error.code === "23505" ? "A savings goal with this name already exists." : error.message }, { status: 422 });
  return Response.json({ message: "Savings plan updated." });
}
