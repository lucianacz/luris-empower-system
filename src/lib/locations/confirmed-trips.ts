import type { SupabaseClient } from "@supabase/supabase-js";

const partnerTrips = [
  { name: "Brazil", countryCode: "BR", countryName: "Brazil", currency: "BRL", startsOn: "2025-12-23", endsOn: "2026-01-04", purpose: "Personal vacation" },
  { name: "Canada", countryCode: "CA", countryName: "Canada", currency: "CAD", startsOn: "2026-05-15", endsOn: "2026-05-26", purpose: "Personal trip" },
] as const;

export async function syncJulianConfirmedTrips(supabase: SupabaseClient, userId: string) {
  const { data: julian, error: personError } = await supabase.from("people").select("id").eq("user_id", userId).eq("role", "partner").single();
  if (personError) throw personError;
  const periodIds: string[] = [];

  for (const trip of partnerTrips) {
    const { data: location, error: locationError } = await supabase.from("locations").upsert({
      user_id: userId,
      name: trip.name,
      country_code: trip.countryCode,
      country_name: trip.countryName,
      default_currency: trip.currency,
    }, { onConflict: "user_id,country_code,name" }).select("id").single();
    if (locationError) throw locationError;
    const { data: existing, error: lookupError } = await supabase.from("location_periods")
      .select("id")
      .eq("user_id", userId)
      .eq("person_id", julian.id)
      .eq("location_id", location.id)
      .eq("starts_on", trip.startsOn)
      .limit(1);
    if (lookupError) throw lookupError;
    const payload = {
      user_id: userId,
      person_id: julian.id,
      location_id: location.id,
      starts_on: trip.startsOn,
      ends_on: trip.endsOn,
      status: "confirmed",
      period_type: "temporary_stay",
      trip_purpose: trip.purpose,
      confidence: 1,
      explanation: `Approximate dates manually confirmed by Luciana. This is Julian's ${trip.purpose.toLocaleLowerCase()} and is not a shared household trip.`,
      evidence: { source: "user_confirmation", confirmedOn: "2026-09-13", approximateDates: true },
    };
    const result = existing?.[0]
      ? await supabase.from("location_periods").update(payload).eq("id", existing[0].id).eq("user_id", userId).select("id").single()
      : await supabase.from("location_periods").insert(payload).select("id").single();
    if (result.error) throw result.error;
    periodIds.push(result.data.id);

    const { error: transactionError } = await supabase.from("transactions").update({
      location_period_id: result.data.id,
      beneficiary_scope: "personal",
    }).eq("user_id", userId)
      .eq("account_owner_id", julian.id)
      .gte("occurred_at", `${trip.startsOn}T00:00:00Z`)
      .lte("occurred_at", `${trip.endsOn}T23:59:59Z`);
    if (transactionError) throw transactionError;

    // This LATAM charge predates the stay because the ticket was purchased in
    // advance. Keep the purchase date intact while linking the travel date and
    // destination to Julian's confirmed personal Brazil trip.
    if (trip.countryCode === "BR") {
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
          travel_date: trip.startsOn,
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
