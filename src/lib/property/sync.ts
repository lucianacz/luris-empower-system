import Decimal from "decimal.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Person = { id: string; role: string };
type LinkedTransaction = {
  id: string;
  occurred_at: string;
  description: string;
  amount: string | number;
  currency: string;
};

export async function syncSatuLagiProject(supabase: SupabaseClient, userId: string) {
  const [{ data: people, error: peopleError }, { data: project, error: projectError }] = await Promise.all([
    supabase.from("people").select("id,role").eq("user_id", userId).in("role", ["self", "partner"]),
    supabase.from("property_projects").upsert({
      user_id: userId,
      name: "satu-lagi-house",
      display_name: "Satu Lagi House",
      location_name: "Costa Rica",
      currency: "USD",
      status: "active",
      notes: "Capital project shared by Luciana and Julian. Excluded from monthly living expenses.",
    }, { onConflict: "user_id,name" }).select("id").single(),
  ]);
  if (peopleError) throw peopleError;
  if (projectError) throw projectError;
  const luciana = (people as Person[] | null)?.find((person) => person.role === "self");
  const julian = (people as Person[] | null)?.find((person) => person.role === "partner");
  if (!luciana || !julian) throw new Error("Luciana and Julian must exist before Satu Lagi can be synchronized.");

  const linkedTransactions: LinkedTransaction[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase.from("transactions")
      .select("id,occurred_at,description,amount,currency")
      .eq("user_id", userId)
      .or("description.ilike.%Baltodano Gomez Martin%,description.ilike.%Gutierrez Gonzalez Kaily Vanessa%")
      .order("occurred_at")
      .range(from, from + 999);
    if (error) throw error;
    linkedTransactions.push(...((data ?? []) as LinkedTransaction[]));
    if (!data || data.length < 1_000) break;
  }

  for (const transaction of linkedTransactions) {
    const amount = new Decimal(transaction.amount).abs();
    if (!amount.isPositive() || transaction.currency !== "USD") continue;
    const isLand = /baltodano\s+gomez\s+martin/i.test(transaction.description);
    const isLegal = /gutierrez\s+gonzalez\s+kaily\s+vanessa/i.test(transaction.description);
    if (!isLand && !isLegal) continue;
    const transferFee = isLand && (amount.equals("20008.54") || amount.equals("40008.54")) ? new Decimal("8.54") : new Decimal(0);
    const paidById = isLand || amount.lessThan(300) ? luciana.id : julian.id;
    const label = isLand ? "Land payment · funded by Luciana" : "Lawyer · Satu Lagi";
    const { error } = await supabase.from("property_expenses").upsert({
      user_id: userId,
      project_id: project.id,
      transaction_id: transaction.id,
      paid_by_id: paidById,
      description: transaction.description,
      transaction_label: label,
      expense_type: isLand ? "land_purchase" : "legal",
      amount: amount.toFixed(8),
      principal_amount: amount.minus(transferFee).toFixed(8),
      fee_amount: transferFee.toFixed(8),
      currency: "USD",
      paid_on: transaction.occurred_at.slice(0, 10),
      payment_method: "bank_transfer",
      source_type: "linked_transaction",
      notes: isLand
        ? "Paid from Julian's Wise account with money funded by Luciana. The two linked charges represent USD 60,000 of land principal plus USD 17.08 in transfer fees."
        : paidById === luciana.id ? "Legal cost paid by Luciana via Julian's Wise account." : "Legal cost paid by Julian.",
    }, { onConflict: "transaction_id" });
    if (error) throw error;
  }

  const manualExpenses = [
    { manual_key: "julian-cash-2026-04-20-land-48000", paid_by_id: julian.id, description: "Cash payment for Satu Lagi House", transaction_label: "Land payment · cash", expense_type: "land_purchase", amount: 48_000, paid_on: "2026-04-20", notes: "Cash payment manually confirmed by Luciana." },
    { manual_key: "julian-cash-2026-05-30-land-8000", paid_by_id: julian.id, description: "Cash payment for Satu Lagi House", transaction_label: "Land payment · cash", expense_type: "land_purchase", amount: 8_000, paid_on: "2026-05-30", notes: "Cash payment manually confirmed by Luciana." },
    { manual_key: "julian-cash-fence-682", paid_by_id: julian.id, description: "Cash payment for the fence", transaction_label: "Fence · paid by Julian", expense_type: "fence", amount: 682, paid_on: "2026-07-09", notes: "Cash amount and July 9 payment date manually confirmed by Luciana." },
    { manual_key: "luciana-cash-fence-600", paid_by_id: luciana.id, description: "Cash payment for the fence", transaction_label: "Fence · paid by Luciana", expense_type: "fence", amount: 600, paid_on: "2026-07-09", notes: "Cash amount and July 9 payment date manually confirmed by Luciana." },
  ] as const;

  for (const expense of manualExpenses) {
    const { error } = await supabase.from("property_expenses").upsert({
      user_id: userId,
      project_id: project.id,
      transaction_id: null,
      ...expense,
      principal_amount: expense.amount,
      fee_amount: 0,
      currency: "USD",
      payment_method: "cash",
      source_type: "manual_cash",
    }, { onConflict: "user_id,manual_key" });
    if (error) throw error;
  }

  return { projectId: project.id, linkedCount: linkedTransactions.length, manualCount: manualExpenses.length };
}
