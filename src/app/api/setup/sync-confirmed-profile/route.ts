import { rebuildSpendingIntelligence } from "@/lib/intelligence/persist";
import { syncConfirmedCashExpenses } from "@/lib/cash/sync";
import { syncJulianConfirmedTrips } from "@/lib/locations/confirmed-trips";
import { syncSatuLagiProject } from "@/lib/property/sync";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const profileVersion = "confirmed-profile-2026-09-14-v8";
const periods = [
  { name: "Mexico", countryCode: "MX", countryName: "Mexico", currency: "MXN", startsOn: "2026-01-10", endsOn: "2026-03-06", periodType: "temporary_stay", tripPurpose: null },
  { name: "Miami", countryCode: "US", countryName: "United States", currency: "USD", startsOn: "2026-03-07", endsOn: "2026-03-21", periodType: "temporary_stay", tripPurpose: null },
  { name: "Costa Rica", countryCode: "CR", countryName: "Costa Rica", currency: "CRC", startsOn: "2026-03-22", endsOn: "2026-07-17", periodType: "home_base", tripPurpose: null },
  { name: "Canada", countryCode: "CA", countryName: "Canada", currency: "CAD", startsOn: "2026-07-18", endsOn: "2026-07-24", periodType: "temporary_stay", tripPurpose: "work" },
  { name: "Costa Rica", countryCode: "CR", countryName: "Costa Rica", currency: "CRC", startsOn: "2026-08-07", endsOn: "2026-10-10", periodType: "home_base", tripPurpose: null },
  { name: "Argentina", countryCode: "AR", countryName: "Argentina", currency: "ARS", startsOn: "2026-10-11", endsOn: null, periodType: "temporary_stay", tripPurpose: null },
] as const;

export async function POST() {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: marker, error: markerError } = await supabase.from("insights").select("id").eq("user_id", user.id).eq("insight_key", profileVersion).maybeSingle();
  if (markerError) return Response.json({ error: markerError.message }, { status: 422 });
  if (marker) return Response.json({ changed: false, message: "Confirmed profile data is already current." });

  const { data: luciana, error: lucianaError } = await supabase.from("people").upsert({ user_id: user.id, display_name: "Luciana Czikk", role: "self", notes: "Workspace owner" }, { onConflict: "user_id,display_name" }).select("id").single();
  if (lucianaError) return Response.json({ error: lucianaError.message }, { status: 422 });
  const { error: julianError } = await supabase.from("people").upsert({ user_id: user.id, display_name: "Julian Stivelman", role: "partner", notes: "Luciana's partner" }, { onConflict: "user_id,display_name" });
  if (julianError) return Response.json({ error: julianError.message }, { status: 422 });
  const { error: ownershipError } = await supabase.from("transactions").update({ account_owner_id: luciana.id, paid_by_id: luciana.id }).eq("user_id", user.id).is("account_owner_id", null);
  if (ownershipError) return Response.json({ error: ownershipError.message }, { status: 422 });
  const { error: accountOwnershipError } = await supabase.from("financial_accounts").update({ owner_person_id: luciana.id }).eq("user_id", user.id).is("owner_person_id", null);
  if (accountOwnershipError) return Response.json({ error: accountOwnershipError.message }, { status: 422 });

  const { data: brazil, error: brazilError } = await supabase.from("locations").upsert({ user_id: user.id, name: "Brazil", country_code: "BR", country_name: "Brazil", default_currency: "BRL" }, { onConflict: "user_id,country_code,name" }).select("id").single();
  if (brazilError) return Response.json({ error: brazilError.message }, { status: 422 });
  const { data: incorrectBrazilPeriods, error: brazilPeriodsError } = await supabase.from("location_periods").select("id").eq("user_id", user.id).eq("person_id", luciana.id).eq("location_id", brazil.id).neq("status", "rejected");
  if (brazilPeriodsError) return Response.json({ error: brazilPeriodsError.message }, { status: 422 });
  const incorrectBrazilPeriodIds = (incorrectBrazilPeriods ?? []).map((period) => period.id);
  if (incorrectBrazilPeriodIds.length) {
    const { error: unlinkBrazilError } = await supabase.from("transactions").update({ location_period_id: null }).eq("user_id", user.id).in("location_period_id", incorrectBrazilPeriodIds);
    if (unlinkBrazilError) return Response.json({ error: unlinkBrazilError.message }, { status: 422 });
    const { error: rejectBrazilError } = await supabase.from("location_periods").update({ status: "rejected", explanation: "Luciana confirmed she did not travel to Brazil in 2025 or 2026." }).eq("user_id", user.id).in("id", incorrectBrazilPeriodIds);
    if (rejectBrazilError) return Response.json({ error: rejectBrazilError.message }, { status: 422 });
  }
  const { data: brazilRejection, error: brazilRejectionLookupError } = await supabase.from("location_periods").select("id").eq("user_id", user.id).eq("person_id", luciana.id).eq("location_id", brazil.id).eq("starts_on", "2025-01-01").eq("ends_on", "2026-12-31").eq("status", "rejected").limit(1).maybeSingle();
  if (brazilRejectionLookupError) return Response.json({ error: brazilRejectionLookupError.message }, { status: 422 });
  if (!brazilRejection) {
    const { error: saveBrazilRejectionError } = await supabase.from("location_periods").insert({ user_id: user.id, person_id: luciana.id, location_id: brazil.id, starts_on: "2025-01-01", ends_on: "2026-12-31", status: "rejected", period_type: "stay", trip_purpose: null, confidence: 1, explanation: "Luciana confirmed she did not travel to Brazil in 2025 or 2026. Brazilian-currency or merchant signals are not evidence of her physical location.", evidence: { source: "user_confirmation", confirmedOn: "2026-09-14" } });
    if (saveBrazilRejectionError) return Response.json({ error: saveBrazilRejectionError.message }, { status: 422 });
  }

  const { data: existingPeriods, error: periodLookupError } = await supabase.from("location_periods").select("id,starts_on,ends_on,status").eq("user_id", user.id).eq("person_id", luciana.id).neq("status", "rejected").lte("starts_on", "2026-12-31").or("ends_on.is.null,ends_on.gte.2026-01-10");
  if (periodLookupError) return Response.json({ error: periodLookupError.message }, { status: 422 });
  const existingIds = (existingPeriods ?? []).map((period) => period.id);
  if (existingIds.length) {
    const { error } = await supabase.from("location_periods").update({ status: "rejected", explanation: "Replaced by Luciana's confirmed 2026 timeline." }).eq("user_id", user.id).in("id", existingIds);
    if (error) return Response.json({ error: error.message }, { status: 422 });
  }
  const { error: clearLocationError } = await supabase.from("transactions").update({ location_period_id: null }).eq("user_id", user.id).eq("account_owner_id", luciana.id).gte("occurred_at", "2026-01-10T00:00:00Z");
  if (clearLocationError) return Response.json({ error: clearLocationError.message }, { status: 422 });

  for (const period of periods) {
    const { data: location, error: locationError } = await supabase.from("locations").upsert({ user_id: user.id, name: period.name, country_code: period.countryCode, country_name: period.countryName, default_currency: period.currency }, { onConflict: "user_id,country_code,name" }).select("id").single();
    if (locationError) return Response.json({ error: locationError.message }, { status: 422 });
    const { data: createdPeriod, error: createPeriodError } = await supabase.from("location_periods").insert({ user_id: user.id, person_id: luciana.id, location_id: location.id, starts_on: period.startsOn, ends_on: period.endsOn, status: "confirmed", period_type: period.periodType, trip_purpose: period.tripPurpose, confidence: 1, explanation: period.startsOn === "2026-10-11" ? "Future stay manually confirmed by Luciana on September 13, 2026." : "Dates manually confirmed by Luciana on September 13, 2026.", evidence: { source: "user_confirmation", confirmedOn: "2026-09-13" } }).select("id").single();
    if (createPeriodError) return Response.json({ error: createPeriodError.message }, { status: 422 });
    let transactionQuery = supabase.from("transactions").update({ location_period_id: createdPeriod.id }).eq("user_id", user.id).eq("account_owner_id", luciana.id).gte("occurred_at", `${period.startsOn}T00:00:00Z`);
    if (period.endsOn) transactionQuery = transactionQuery.lte("occurred_at", `${period.endsOn}T23:59:59Z`);
    const { error: transactionError } = await transactionQuery;
    if (transactionError) return Response.json({ error: transactionError.message }, { status: 422 });
  }

  const { error: canadaTagError } = await supabase.from("transactions").update({ travel_destination: "CA" }).eq("user_id", user.id).eq("account_owner_id", luciana.id).or("merchant_country.eq.CA,original_currency.eq.CAD").lte("occurred_at", "2026-07-24T23:59:59Z");
  if (canadaTagError) return Response.json({ error: canadaTagError.message }, { status: 422 });

  const trips = await syncJulianConfirmedTrips(supabase, user.id);
  const cash = await syncConfirmedCashExpenses(supabase, user.id);
  const intelligence = await rebuildSpendingIntelligence(supabase, user.id);
  const property = await syncSatuLagiProject(supabase, user.id);
  const { error: saveMarkerError } = await supabase.from("insights").upsert({ user_id: user.id, insight_key: profileVersion, insight_type: "system", title: "Confirmed profile data synchronized", body: "Ownership, confirmed locations, Costa Rica household food, editable scope rules, approximate USD values, cash rent, Satu Lagi dates, and merchant rules have been applied.", priority: 0, transaction_ids: [], metadata: { hidden: true } }, { onConflict: "user_id,insight_key" });
  if (saveMarkerError) return Response.json({ error: saveMarkerError.message }, { status: 422 });
  return Response.json({ changed: true, message: "Approximate USD values, cash rent, Satu Lagi, merchant rules, ownership, and confirmed trips were synchronized.", intelligence, property, trips, cash });
}
