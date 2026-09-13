import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const common = {
  accountName: z.string().trim().min(1).max(100),
  institution: z.enum(["arq", "alpaca", "other"]),
  baseCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/),
  cashAvailable: z.number().default(0),
};
const investmentSchema = z.discriminatedUnion("recordType", [
  z.object({ recordType: z.literal("position"), ...common, assetName: z.string().trim().min(1).max(120), symbol: z.string().trim().toUpperCase().max(24).nullable().optional(), assetType: z.string().trim().min(1).max(50), assetCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/), quantity: z.number(), costBasis: z.number().nullable().optional(), currentValue: z.number().nullable().optional(), realizedProfitLoss: z.number().default(0), valuationDate: z.iso.date() }),
  z.object({ recordType: z.literal("snapshot"), ...common, valuationDate: z.iso.date(), cashValue: z.number(), positionsValue: z.number(), totalValue: z.number(), contributions: z.number().default(0), withdrawals: z.number().default(0), dividends: z.number().default(0), interest: z.number().default(0), fees: z.number().default(0), taxes: z.number().default(0), realizedProfitLoss: z.number().default(0), unrealizedProfitLoss: z.number().default(0), exchangeRateEffect: z.number().nullable().optional() }),
]);

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const input = investmentSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const value = input.data;
  let { data: account } = await supabase.from("investment_accounts").select("id").eq("user_id", user.id).eq("institution", value.institution).eq("name", value.accountName).maybeSingle();
  if (!account) {
    const created = await supabase.from("investment_accounts").insert({ user_id: user.id, institution: value.institution, name: value.accountName, base_currency: value.baseCurrency, cash_available: value.cashAvailable }).select("id").single();
    if (created.error) return Response.json({ error: created.error.message }, { status: 422 });
    account = created.data;
  } else {
    const { error } = await supabase.from("investment_accounts").update({ base_currency: value.baseCurrency, cash_available: value.cashAvailable }).eq("id", account.id).eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 422 });
  }

  if (value.recordType === "snapshot") {
    const { data, error } = await supabase.from("portfolio_snapshots").upsert({ user_id: user.id, investment_account_id: account.id, valuation_date: value.valuationDate, cash_value: value.cashValue, positions_value: value.positionsValue, total_value: value.totalValue, contributions: value.contributions, withdrawals: value.withdrawals, dividends: value.dividends, interest: value.interest, fees: value.fees, taxes: value.taxes, realized_profit_loss: value.realizedProfitLoss, unrealized_profit_loss: value.unrealizedProfitLoss, currency: value.baseCurrency, exchange_rate_effect: value.exchangeRateEffect ?? null }, { onConflict: "investment_account_id,valuation_date" }).select("id").single();
    if (error) return Response.json({ error: error.message }, { status: 422 });
    return Response.json({ snapshot: data }, { status: 201 });
  }

  let assetQuery = supabase.from("investment_assets").select("id").eq("user_id", user.id).eq("name", value.assetName);
  assetQuery = value.symbol ? assetQuery.eq("symbol", value.symbol) : assetQuery.is("symbol", null);
  let { data: asset } = await assetQuery.maybeSingle();
  if (!asset) {
    const created = await supabase.from("investment_assets").insert({ user_id: user.id, symbol: value.symbol || null, name: value.assetName, asset_type: value.assetType, currency: value.assetCurrency }).select("id").single();
    if (created.error) return Response.json({ error: created.error.message }, { status: 422 });
    asset = created.data;
  }
  const unrealized = value.currentValue != null && value.costBasis != null ? value.currentValue - value.costBasis : null;
  const { data, error } = await supabase.from("investment_positions").upsert({ user_id: user.id, investment_account_id: account.id, asset_id: asset.id, quantity: value.quantity, cost_basis: value.costBasis ?? null, current_value: value.currentValue ?? null, realized_profit_loss: value.realizedProfitLoss, unrealized_profit_loss: unrealized, currency: value.assetCurrency, valuation_date: value.valuationDate }, { onConflict: "investment_account_id,asset_id" }).select("id").single();
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ position: data }, { status: 201 });
}
