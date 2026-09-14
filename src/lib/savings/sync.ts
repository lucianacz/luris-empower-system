import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncConfirmedSavingsGoals(supabase: SupabaseClient, userId: string) {
  const { data: people, error: peopleError } = await supabase.from("people").select("id,role").eq("user_id", userId).in("role", ["self", "partner"]);
  if (peopleError) throw peopleError;
  const luciana = (people ?? []).find((person) => person.role === "self");
  if (!luciana) throw new Error("Luciana must exist before savings goals can be synchronized.");
  const goals = [
    { name: "Nose procedure", scope: "personal", owner_person_id: luciana.id, target_amount: 6_000, saved_amount: 0, currency: "USD", target_date: null, status: "active", notes: "Luciana's personal goal. Add a target date when ready to calculate the monthly amount." },
    { name: "Shared car", scope: "shared", owner_person_id: null, target_amount: 15_000, saved_amount: 0, currency: "USD", target_date: "2027-03-31", status: "active", notes: "Shared household goal to buy a car in March 2027. The date remains editable." },
    { name: "Satu Lagi repairs", scope: "shared", owner_person_id: null, target_amount: 15_000, saved_amount: 0, currency: "USD", target_date: null, status: "active", notes: "Approximate shared budget for future repairs. Add a target date when the schedule is known." },
  ] as const;
  const { data: existing, error: existingError } = await supabase.from("savings_goals").select("name").eq("user_id", userId).in("name", goals.map((goal) => goal.name));
  if (existingError) throw existingError;
  const existingNames = new Set((existing ?? []).map((goal) => goal.name));
  const missing = goals.filter((goal) => !existingNames.has(goal.name)).map((goal) => ({ ...goal, user_id: userId }));
  if (missing.length) {
    const { error } = await supabase.from("savings_goals").insert(missing);
    if (error) throw error;
  }
  return { added: missing.length, total: goals.length };
}
