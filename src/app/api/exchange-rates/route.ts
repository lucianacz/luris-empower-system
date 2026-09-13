import Decimal from "decimal.js";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  rateDate: z.iso.date(),
  sourceCurrency: z.string().trim().min(3).max(5).transform((value) => value.toUpperCase()),
  rateToUsd: z.number().positive(),
  source: z.string().trim().min(1).max(120),
  methodology: z.string().trim().min(1).max(120),
  estimated: z.boolean().default(false),
  transactionIds: z.array(z.string().uuid()).max(5000).default([]),
});

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const input = schema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data: rate, error: rateError } = await supabase.from("exchange_rates").upsert({ user_id: user.id, rate_date: input.data.rateDate, source_currency: input.data.sourceCurrency, reporting_currency: "USD", rate_to_reporting: input.data.rateToUsd, source: input.data.source, methodology: input.data.methodology, is_estimated: input.data.estimated }, { onConflict: "user_id,rate_date,source_currency,reporting_currency,source,methodology" }).select("id").single();
  if (rateError) return Response.json({ error: rateError.message }, { status: 422 });
  let query = supabase.from("transactions").select("id,amount").eq("user_id", user.id).eq("currency", input.data.sourceCurrency).gte("occurred_at", `${input.data.rateDate}T00:00:00Z`).lte("occurred_at", `${input.data.rateDate}T23:59:59Z`);
  if (input.data.transactionIds.length) query = query.in("id", input.data.transactionIds);
  const { data: transactions, error: transactionError } = await query;
  if (transactionError) return Response.json({ error: transactionError.message }, { status: 422 });
  const rows = (transactions ?? []).map((transaction) => ({ user_id: user.id, transaction_id: transaction.id, exchange_rate_id: rate.id, reporting_currency: "USD", reporting_amount: new Decimal(transaction.amount).times(input.data.rateToUsd).toDecimalPlaces(8).toNumber(), rate_to_reporting: input.data.rateToUsd, source: input.data.source, is_estimated: input.data.estimated }));
  if (rows.length) {
    const { error } = await supabase.from("transaction_reporting_values").upsert(rows, { onConflict: "transaction_id,reporting_currency" });
    if (error) return Response.json({ error: error.message }, { status: 422 });
  }
  return Response.json({ message: `Saved a historical ${input.data.sourceCurrency}/USD rate for ${input.data.rateDate} and linked ${rows.length} transaction${rows.length === 1 ? "" : "s"}.` });
}
