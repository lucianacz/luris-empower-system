import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const periodSchema = z.object({
  countryName: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()).nullable().optional(),
  locationName: z.string().trim().min(1).max(100).optional(),
  defaultCurrency: z.string().trim().min(3).max(5).transform((value) => value.toUpperCase()).nullable().optional(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().optional(),
  status: z.enum(["suggested", "confirmed", "rejected"]).default("confirmed"),
  periodType: z.enum(["location", "stay", "temporary_stay", "home_base"]).default("stay"),
  tripPurpose: z.string().trim().max(120).nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
  explanation: z.string().trim().max(1000).default("Manually entered location period."),
  evidence: z.record(z.string(), z.unknown()).default({}),
  transactionIds: z.array(z.string().uuid()).max(5000).default([]),
});

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const input = periodSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  if (input.data.endsOn && input.data.endsOn < input.data.startsOn) return Response.json({ error: "The end date must be on or after the start date." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const name = input.data.locationName || input.data.countryName;
  const { data: location, error: locationError } = await supabase.from("locations").upsert({ user_id: user.id, name, country_code: input.data.countryCode ?? null, country_name: input.data.countryName, default_currency: input.data.defaultCurrency ?? null }, { onConflict: "user_id,country_code,name" }).select("id").single();
  if (locationError) return Response.json({ error: locationError.message }, { status: 422 });
  if (input.data.defaultCurrency) {
    const { error: hintError } = await supabase.from("location_currency_hints").upsert({ user_id: user.id, currency: input.data.defaultCurrency, location_id: location.id, weight: 0.2 }, { onConflict: "user_id,currency,location_id" });
    if (hintError) return Response.json({ error: hintError.message }, { status: 422 });
  }
  let existingQuery = supabase.from("location_periods").select("id").eq("user_id", user.id).eq("location_id", location.id).eq("starts_on", input.data.startsOn);
  existingQuery = input.data.endsOn ? existingQuery.eq("ends_on", input.data.endsOn) : existingQuery.is("ends_on", null);
  const { data: existingPeriod, error: existingPeriodError } = await existingQuery.limit(1).maybeSingle();
  if (existingPeriodError) return Response.json({ error: existingPeriodError.message }, { status: 422 });
  if (existingPeriod) {
    const { error: updateError } = await supabase.from("location_periods").update({ status: input.data.status, period_type: input.data.periodType, trip_purpose: input.data.tripPurpose ?? null, confidence: input.data.confidence, explanation: input.data.explanation, evidence: { ...input.data.evidence, transactionIds: input.data.transactionIds } }).eq("id", existingPeriod.id).eq("user_id", user.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 422 });
    if (input.data.status === "confirmed") await assignPeriodTransactions(supabase, user.id, existingPeriod.id, input.data.startsOn, input.data.endsOn ?? input.data.startsOn, input.data.transactionIds);
    return Response.json({ message: input.data.status === "rejected" ? "Location suggestion rejected." : "Existing location period updated without creating a duplicate.", periodId: existingPeriod.id });
  }
  const { data: period, error: periodError } = await supabase.from("location_periods").insert({ user_id: user.id, location_id: location.id, starts_on: input.data.startsOn, ends_on: input.data.endsOn ?? null, status: input.data.status, period_type: input.data.periodType, trip_purpose: input.data.tripPurpose ?? null, confidence: input.data.confidence, explanation: input.data.explanation, evidence: { ...input.data.evidence, transactionIds: input.data.transactionIds } }).select("id").single();
  if (periodError) return Response.json({ error: periodError.message }, { status: 422 });
  if (input.data.status === "confirmed") await assignPeriodTransactions(supabase, user.id, period.id, input.data.startsOn, input.data.endsOn ?? input.data.startsOn, input.data.transactionIds);
  return Response.json({ message: input.data.status === "rejected" ? "Location suggestion rejected." : "Location period saved.", periodId: period.id }, { status: 201 });
}

async function assignPeriodTransactions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, periodId: string, from: string, to: string, transactionIds: string[]) {
  let query = supabase.from("transactions").update({ location_period_id: periodId }).eq("user_id", userId);
  query = transactionIds.length ? query.in("id", transactionIds) : query.gte("occurred_at", `${from}T00:00:00Z`).lte("occurred_at", `${to}T23:59:59Z`);
  await query;
}
