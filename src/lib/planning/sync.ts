import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncConfirmedPlanningContext(supabase: SupabaseClient, userId: string) {
  const { data: people, error: peopleError } = await supabase.from("people").select("id,role").eq("user_id", userId).in("role", ["self", "partner"]);
  if (peopleError) throw peopleError;
  const luciana = (people ?? []).find((person) => person.role === "self");
  const julian = (people ?? []).find((person) => person.role === "partner");
  if (!luciana || !julian) throw new Error("Luciana and Julian must exist before planning context can be synchronized.");

  const { data: accounts, error: accountsError } = await supabase.from("financial_accounts").select("id,name,owner_person_id,institution,currency").eq("user_id", userId).eq("institution", "deel").eq("currency", "USD");
  if (accountsError) throw accountsError;
  const accountFor = (personId: string) => {
    const owned = (accounts ?? []).filter((account) => account.owner_person_id === personId);
    return owned.find((account) => /balance/i.test(account.name))?.id ?? owned[0]?.id ?? null;
  };
  const balanceDate = "2026-09-14";
  const balances = [
    { user_id: userId, owner_person_id: luciana.id, financial_account_id: accountFor(luciana.id), institution: "deel", amount: 21_000, currency: "USD", balance_date: balanceDate, notes: "Current Deel balance confirmed by Luciana on 2026-09-14." },
    { user_id: userId, owner_person_id: julian.id, financial_account_id: accountFor(julian.id), institution: "deel", amount: 2_470, currency: "USD", balance_date: balanceDate, notes: "Current Deel balance confirmed by Luciana on 2026-09-14." },
  ];
  const { error: balanceError } = await supabase.from("account_balance_snapshots").upsert(balances, { onConflict: "user_id,owner_person_id,institution,currency,balance_date" });
  if (balanceError) throw balanceError;

  const profiles = [
    { user_id: userId, person_id: luciana.id, expected_monthly_income: 6_000, income_currency: "USD", income_day: 31, safety_months: 3, income_is_variable: false, notes: "Luciana expects USD 6,000 on the last day of each month." },
    { user_id: userId, person_id: julian.id, expected_monthly_income: null, income_currency: "USD", income_day: null, safety_months: 3, income_is_variable: true, notes: "Julian's income is variable; planning uses completed-month history instead of assuming a fixed salary." },
  ];
  const { error: profileError } = await supabase.from("planning_profiles").upsert(profiles, { onConflict: "user_id,person_id" });
  if (profileError) throw profileError;
  return { balances: balances.length, profiles: profiles.length };
}
