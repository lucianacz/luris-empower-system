import type { SupabaseClient } from "@supabase/supabase-js";

export const julianConfirmedPeriods = [
  { name: "Brazil", countryCode: "BR", countryName: "Brazil", currency: "BRL", startsOn: "2025-12-23", endsOn: "2026-01-04", periodType: "temporary_stay", purpose: "Personal vacation", confidence: 1, source: "user_confirmation" },
  { name: "Mexico", countryCode: "MX", countryName: "Mexico", currency: "MXN", startsOn: "2026-01-10", endsOn: "2026-03-06", periodType: "temporary_stay", purpose: null, confidence: 0.9, source: "shared_household_context" },
  { name: "Miami", countryCode: "US", countryName: "United States", currency: "USD", startsOn: "2026-03-07", endsOn: "2026-03-21", periodType: "temporary_stay", purpose: null, confidence: 0.9, source: "shared_household_context" },
  { name: "Costa Rica", countryCode: "CR", countryName: "Costa Rica", currency: "CRC", startsOn: "2026-03-22", endsOn: "2026-05-14", periodType: "home_base", purpose: null, confidence: 0.9, source: "shared_household_context" },
  { name: "Canada", countryCode: "CA", countryName: "Canada", currency: "CAD", startsOn: "2026-05-15", endsOn: "2026-05-26", periodType: "temporary_stay", purpose: "Personal trip", confidence: 1, source: "user_confirmation" },
  { name: "Costa Rica", countryCode: "CR", countryName: "Costa Rica", currency: "CRC", startsOn: "2026-05-27", endsOn: "2026-07-17", periodType: "home_base", purpose: null, confidence: 0.9, source: "shared_household_context" },
  { name: "Argentina", countryCode: "AR", countryName: "Argentina", currency: "ARS", startsOn: "2026-07-18", endsOn: "2026-08-07", periodType: "temporary_stay", purpose: null, confidence: 1, source: "user_confirmation" },
  { name: "Costa Rica", countryCode: "CR", countryName: "Costa Rica", currency: "CRC", startsOn: "2026-08-08", endsOn: null, periodType: "home_base", purpose: null, confidence: 0.9, source: "shared_household_context" },
] as const;

export async function syncJulianConfirmedTrips(supabase: SupabaseClient, userId: string) {
  const { data: julian, error: personError } = await supabase.from("people").select("id").eq("user_id", userId).eq("role", "partner").single();
  if (personError) throw personError;
  const periodIds: string[] = [];

  const { data: existingPeriods, error: existingPeriodsError } = await supabase.from("location_periods").select("id").eq("user_id", userId).eq("person_id", julian.id).neq("status", "rejected").gte("starts_on", "2025-12-23");
  if (existingPeriodsError) throw existingPeriodsError;
  const existingPeriodIds = (existingPeriods ?? []).map((period) => period.id);
  if (existingPeriodIds.length) {
    const { error: rejectError } = await supabase.from("location_periods").update({ status: "rejected", explanation: "Replaced by Julian's reconstructed location timeline." }).eq("user_id", userId).in("id", existingPeriodIds);
    if (rejectError) throw rejectError;
  }
  const { error: clearLocationError } = await supabase.from("transactions").update({ location_period_id: null }).eq("user_id", userId).eq("account_owner_id", julian.id).gte("occurred_at", "2025-12-23T00:00:00Z");
  if (clearLocationError) throw clearLocationError;

  for (const period of julianConfirmedPeriods) {
    const { data: location, error: locationError } = await supabase.from("locations").upsert({
      user_id: userId,
      name: period.name,
      country_code: period.countryCode,
      country_name: period.countryName,
      default_currency: period.currency,
    }, { onConflict: "user_id,country_code,name" }).select("id").single();
    if (locationError) throw locationError;
    const { data: existing, error: lookupError } = await supabase.from("location_periods")
      .select("id")
      .eq("user_id", userId)
      .eq("person_id", julian.id)
      .eq("location_id", location.id)
      .eq("starts_on", period.startsOn)
      .limit(1);
    if (lookupError) throw lookupError;
    const payload = {
      user_id: userId,
      person_id: julian.id,
      location_id: location.id,
      starts_on: period.startsOn,
      ends_on: period.endsOn,
      status: "confirmed",
      period_type: period.periodType,
      trip_purpose: period.purpose,
      confidence: period.confidence,
      explanation: period.source === "user_confirmation"
        ? `Dates confirmed by Luciana for Julian's ${period.name} stay.`
        : `Reconstructed from the shared household timeline around Julian's separately confirmed personal trips.`,
      evidence: { source: period.source, confirmedOn: "2026-09-14", reconstructedAroundConfirmedTrips: period.source !== "user_confirmation" },
    };
    const result = existing?.[0]
      ? await supabase.from("location_periods").update(payload).eq("id", existing[0].id).eq("user_id", userId).select("id").single()
      : await supabase.from("location_periods").insert(payload).select("id").single();
    if (result.error) throw result.error;
    periodIds.push(result.data.id);

    let transactionQuery = supabase.from("transactions").update({ location_period_id: result.data.id }).eq("user_id", userId)
      .eq("account_owner_id", julian.id)
      .gte("occurred_at", `${period.startsOn}T00:00:00Z`);
    if (period.endsOn) transactionQuery = transactionQuery.lte("occurred_at", `${period.endsOn}T23:59:59Z`);
    const { error: transactionError } = await transactionQuery;
    if (transactionError) throw transactionError;

    // This LATAM charge predates the stay because the ticket was purchased in
    // advance. Keep the purchase date intact while linking the travel date and
    // destination to Julian's confirmed personal Brazil trip.
    if (period.countryCode === "BR") {
      const { data: advanceFlights, error: flightLookupError } = await supabase.from("transactions")
        .select("id,metadata")
        .eq("user_id", userId)
        .eq("account_owner_id", julian.id)
        .ilike("description", "%LA LATAM XP%")
        .gte("occurred_at", "2025-11-01T00:00:00Z")
        .lte("occurred_at", "2025-11-10T23:59:59Z");
      if (flightLookupError) throw flightLookupError;
      for (const flight of advanceFlights ?? []) {
        const { error: flightUpdateError } = await supabase.from("transactions").update({
          travel_destination: "BR",
          travel_date: period.startsOn,
          beneficiary_scope: "personal",
          transaction_label: "Flight to Brazil · Julian's personal trip",
          metadata: { ...(flight.metadata ?? {}), tripAttribution: "Julian Brazil 2025-12-23 to 2026-01-04", attributionSource: "user-confirmed trip and advance-purchase timing" },
        }).eq("user_id", userId).eq("id", flight.id);
        if (flightUpdateError) throw flightUpdateError;
      }
    }
  }

  return { periodIds };
}
