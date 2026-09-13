import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  action: z.enum(["update", "merge", "split"]).default("update"),
  status: z.enum(["suggested", "confirmed", "rejected"]).optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().nullable().optional(),
  periodType: z.enum(["location", "stay", "temporary_stay", "home_base"]).optional(),
  tripPurpose: z.string().trim().max(120).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  explanation: z.string().trim().max(1000).optional(),
  targetPeriodId: z.string().uuid().optional(),
  splitOn: z.iso.date().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await context.params;
  const input = updateSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: period, error: periodError } = await supabase.from("location_periods").select("*").eq("id", id).eq("user_id", user.id).single();
  if (periodError) return Response.json({ error: periodError.message }, { status: 404 });

  if (input.data.action === "merge") {
    if (!input.data.targetPeriodId) return Response.json({ error: "Choose a period to merge." }, { status: 400 });
    const { data: target, error } = await supabase.from("location_periods").select("*").eq("id", input.data.targetPeriodId).eq("user_id", user.id).single();
    if (error) return Response.json({ error: error.message }, { status: 404 });
    const startsOn = period.starts_on < target.starts_on ? period.starts_on : target.starts_on;
    const endsOn = laterEnd(period.ends_on, target.ends_on);
    const { error: updateError } = await supabase.from("location_periods").update({ starts_on: startsOn, ends_on: endsOn, status: "confirmed", explanation: `${period.explanation} Merged with an adjacent confirmed period.` }).eq("id", id).eq("user_id", user.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 422 });
    await supabase.from("transactions").update({ location_period_id: id }).eq("user_id", user.id).eq("location_period_id", target.id);
    await supabase.from("location_periods").delete().eq("id", target.id).eq("user_id", user.id);
    return Response.json({ message: "Location periods merged." });
  }

  if (input.data.action === "split") {
    if (!input.data.splitOn || input.data.splitOn <= period.starts_on || period.ends_on && input.data.splitOn > period.ends_on) return Response.json({ error: "Choose a split date inside the period." }, { status: 400 });
    const firstEnd = previousDay(input.data.splitOn);
    const originalEnd = period.ends_on;
    const { error: updateError } = await supabase.from("location_periods").update({ ends_on: firstEnd }).eq("id", id).eq("user_id", user.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 422 });
    const { data: second, error: insertError } = await supabase.from("location_periods").insert({ ...withoutIdentity(period), starts_on: input.data.splitOn, ends_on: originalEnd, explanation: `${period.explanation} Split from the original period.` }).select("id").single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 422 });
    await supabase.from("transactions").update({ location_period_id: second.id }).eq("user_id", user.id).eq("location_period_id", id).gte("occurred_at", `${input.data.splitOn}T00:00:00Z`);
    return Response.json({ message: "Location period split." });
  }

  const update: Record<string, unknown> = {};
  if (input.data.status) update.status = input.data.status;
  if (input.data.startsOn) update.starts_on = input.data.startsOn;
  if (input.data.endsOn !== undefined) update.ends_on = input.data.endsOn;
  if (input.data.periodType) update.period_type = input.data.periodType;
  if (input.data.tripPurpose !== undefined) update.trip_purpose = input.data.tripPurpose;
  if (input.data.confidence !== undefined) update.confidence = input.data.confidence;
  if (input.data.explanation) update.explanation = input.data.explanation;
  const startsOn = input.data.startsOn ?? period.starts_on;
  const endsOn = input.data.endsOn === undefined ? period.ends_on : input.data.endsOn;
  if (endsOn && endsOn < startsOn) return Response.json({ error: "The end date must be on or after the start date." }, { status: 400 });
  const { error } = await supabase.from("location_periods").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 422 });
  if ((input.data.status ?? period.status) === "confirmed") await supabase.from("transactions").update({ location_period_id: id }).eq("user_id", user.id).gte("occurred_at", `${startsOn}T00:00:00Z`).lte("occurred_at", `${endsOn ?? "9999-12-31"}T23:59:59Z`);
  return Response.json({ message: "Location period updated." });
}

function previousDay(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
function laterEnd(left: string | null, right: string | null) { if (!left || !right) return null; return left > right ? left : right; }
function withoutIdentity(period: Record<string, unknown>) { const copy = { ...period }; delete copy.id; delete copy.created_at; delete copy.updated_at; return copy; }
