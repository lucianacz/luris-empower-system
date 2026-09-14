import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedTransaction } from "@/lib/import/types";
import { matchKnownMerchant } from "@/lib/categories/known-merchants";

export interface DefaultExpenseCategory {
  name: string;
  lifeArea: string;
  essential: boolean;
  extraordinary?: boolean;
  parentName?: string;
  color: string;
  pattern: RegExp;
}

export const defaultExpenseCategories: DefaultExpenseCategory[] = [
  { name: "Bank fees", lifeArea: "Financial", essential: true, color: "#9a5528", pattern: /\bfee\b|commission|comisi[oó]n|cargo por servicio|maintenance fee/i },
  { name: "Taxes", lifeArea: "Financial", essential: true, color: "#784f66", pattern: /\btax(?:es)?\b|impuesto|afip|agip/i },
  { name: "Groceries", lifeArea: "Food", essential: true, color: "#52796f", pattern: /grocery|groceries|supermarket|supermercado|\bmini\s*super\b|\bminisuper\b|\bmega\s*super\b|\bsuper\b|market|mercado|verduler|carnicer|bakery|panader|almac[eé]n|convenience|7-eleven|seven-eleven|city\s*mall|golden\s*mall|daily\s*mart|bm\s+rio\s+claro|lawson|whole foods|walmart/i },
  { name: "Dining out", lifeArea: "Food", essential: false, color: "#d37a3d", pattern: /restaurant|dining|food\s*&\s*dining|fast food|caf[eé]|coffee|bar\b|sushi|rappi|uber eats|delivery|mcdonald|starbucks|helader/i },
  { name: "Friends & social", parentName: "Dining out", lifeArea: "Relationships", essential: false, color: "#c65f7c", pattern: /friends?\s*(?:and|&)?\s*social|salidas? con amigos/i },
  { name: "Car", lifeArea: "Mobility", essential: true, color: "#48605a", pattern: /car ownership|automotive and vehicles|gastos? del (?:auto|carro)/i },
  { name: "Housing", lifeArea: "Home", essential: true, color: "#7a6c5d", pattern: /\brent\b|alquiler|expensas|condominio|property management/i },
  { name: "Bills & utilities", lifeArea: "Home", essential: true, color: "#557a95", pattern: /electric|electricidad|internet|telecom|telephone|tel[eé]fono|mobile|water bill|agua\b|gas bill|utility|utilities/i },
  { name: "Transport", lifeArea: "Mobility", essential: true, color: "#496f5d", pattern: /taxi|rideshare|\buber\b|\bgrab\b|\bdidi\b|cabify|subway|metro\b|\bmtr\b|train|bus\b|tap to ride|transport(?:e|ation)/i },
  { name: "Flights", parentName: "Travel", lifeArea: "Travel", essential: false, extraordinary: true, color: "#416788", pattern: /airline|airlines|aeroline|avianca|latam|lan airline|copa air|vivaaerobus|sansa|air transport/i },
  { name: "Hotels", parentName: "Travel", lifeArea: "Travel", essential: false, extraordinary: true, color: "#7b6fa8", pattern: /hotel|hostel|resort|booking(?:\.com|\.[a-z])?|lodging|accommodation/i },
  { name: "Car rental", parentName: "Car", lifeArea: "Mobility", essential: false, extraordinary: true, color: "#4f7f8f", pattern: /car rental|alquiler de auto|\benterprise\b|rent[ -]?a[ -]?car/i },
  { name: "Travel", lifeArea: "Travel", essential: false, extraordinary: true, color: "#4d7298", pattern: /hotel|hostel|booking\.com|airbnb|travel|tour|car rental|alquiler de auto|airalo|\besim\b|immigration|\bvisa\b/i },
  { name: "Visas", parentName: "Travel", lifeArea: "Travel", essential: false, extraordinary: true, color: "#58729c", pattern: /\bk[ -]?eta\b|\bvisa\b|immigration permit|travel authori[sz]ation/i },
  { name: "Health insurance", parentName: "Health", lifeArea: "Health", essential: true, color: "#326a60", pattern: /hospital\s*alem[aá]n|hospitalaleman|health insurance|seguro (?:m[eé]dico|de salud)|obra social/i },
  { name: "Therapy", lifeArea: "Health", essential: true, color: "#568b82", pattern: /psycholog|psic[oó]log|therapy|terapia/i },
  { name: "Dentist", parentName: "Health", lifeArea: "Health", essential: true, color: "#4f8c80", pattern: /dentist|dental|odont[oó]log/i },
  { name: "Pharmacy", parentName: "Health", lifeArea: "Health", essential: true, color: "#6f9d84", pattern: /pharmacy|farmacia|farmacity/i },
  { name: "Alternative therapy", parentName: "Health", lifeArea: "Health", essential: false, color: "#8c7aa9", pattern: /biodecodific|biodecoder/i },
  { name: "Private health", parentName: "Health", lifeArea: "Health", essential: true, color: "#2f7f78", pattern: /private health|centro m[eé]dico|medical cent(?:er|re)|consulta m[eé]dica|specialist|doctor\b/i },
  { name: "Health", lifeArea: "Health", essential: true, color: "#3d7c6f", pattern: /pharmacy|farmacia|farmacity|medical|m[eé]dic|clinic|cl[ií]nic|hospital|dentist|dental|health(?:\s+and\s+wellness)?|salud|therapy|terapia|laborator/i },
  { name: "Subscriptions & software", lifeArea: "Digital", essential: false, color: "#6c63a8", pattern: /subscription|software|hosting|cloud|google storage|apple\.com\/bill|openai|netflix|spotify|youtube|adobe|notion|figma|canva/i },
  { name: "Shopping", lifeArea: "Lifestyle", essential: false, color: "#a26769", pattern: /clothing|apparel|department store|retail|amazon|mercadolibre|shopping|tienda|zara|ikea|electronics/i },
  { name: "Personal care", lifeArea: "Lifestyle", essential: false, color: "#b07d8b", pattern: /salon|beauty|hair|peluquer|barber|cosmetic|spa\b|personal care/i },
  { name: "Entertainment", lifeArea: "Leisure", essential: false, color: "#8b6f47", pattern: /cinema|movie|theater|theatre|concert|museum|entertainment(?:\s*&\s*recreation)?|recreation|gaming|game\b|ticket/i },
  { name: "Education", lifeArea: "Growth", essential: false, color: "#657153", pattern: /course|school|university|college|education|academy|bookstore|libro|udemy|coursera|preply/i },
  { name: "English classes", parentName: "Education", lifeArea: "Growth", essential: false, color: "#7b8b65", pattern: /english class|clases? de ingl[eé]s/i },
  { name: "Cleaning", parentName: "Housing", lifeArea: "Home", essential: true, color: "#8a806f", pattern: /cleaning|limpieza/i },
  { name: "Car repairs", parentName: "Car", lifeArea: "Mobility", essential: true, color: "#6a7f4f", pattern: /car repair|reparaci[oó]n.*(?:auto|carro)|mec[aá]nic|neum[aá]tic|la casa del hyundai|centro llantero del sur/i },
  { name: "Fuel & gas", parentName: "Car", lifeArea: "Mobility", essential: true, color: "#b56b36", pattern: /fuel|gasolin|combustible|servicentro|gas station|lumicentro|terpel|racetrac/i },
  { name: "Parking", parentName: "Car", lifeArea: "Mobility", essential: true, color: "#65766f", pattern: /parking|estacionamiento/i },
  { name: "Tolls & highways", parentName: "Car", lifeArea: "Mobility", essential: true, color: "#7a7542", pattern: /\bausol\b|toll|peaje|autopista|ruta 27/i },
  { name: "Dermatology", parentName: "Health", lifeArea: "Health", essential: true, color: "#357d8a", pattern: /dermatolog|skin medical/i },
  { name: "Diving & activities", parentName: "Travel", lifeArea: "Travel", essential: false, color: "#167b91", pattern: /diving|buceo|scuba|surfboard|water activit/i },
  { name: "Workshops & classes", parentName: "Education", lifeArea: "Growth", essential: false, color: "#9a6b52", pattern: /workshop|taller|class|clase/i },
  { name: "Work tests", lifeArea: "Work", essential: false, color: "#6f7782", pattern: /shopify work test|sweet[ -]?chemistry/i },
  { name: "Papaya Kids", lifeArea: "Business", essential: false, color: "#b06d32", pattern: /papaya kids|jazak\s+veematz|longxiang\s+knitting/i },
  { name: "Loan on card · cash returned", lifeArea: "Financial", essential: false, extraordinary: true, color: "#8b7656", pattern: /loan on card|returned in cash|cash loan recovered/i },
  { name: "Satu Lagi Villa", lifeArea: "Assets", essential: false, extraordinary: true, color: "#8a6545", pattern: /satu lagi villa/i },
  { name: "Gifts & giving", lifeArea: "Relationships", essential: false, color: "#a66b6b", pattern: /gift|regalo|donation|donaci[oó]n|charity/i },
];

const archivedDefaultCategoryNames = ["Pets"];

export function suggestDefaultCategory(transaction: Pick<NormalizedTransaction, "kind" | "description" | "metadata" | "amount" | "currency">) {
  if (!["expense", "refund", "fee", "tax"].includes(transaction.kind)) return null;
  if (transaction.kind === "fee") return "Bank fees";
  if (transaction.kind === "tax") return "Taxes";
  const known = matchKnownMerchant(transaction.description, transaction);
  if (known) return known.categoryName;
  const mccCategory = categoryFromMcc(transaction.metadata?.mcc);
  if (mccCategory) return mccCategory;
  const haystack = [transaction.description, transaction.metadata?.mccLabel, transaction.metadata?.sourceType].filter(Boolean).join(" ");
  return defaultExpenseCategories.find((category) => category.pattern.test(haystack))?.name ?? null;
}

function categoryFromMcc(value: unknown) {
  const mcc = String(value ?? "").trim();
  if (mcc === "4511") return "Flights";
  if (mcc === "7512") return "Car rental";
  if (mcc === "7011") return "Hotels";
  if (["4111", "4112", "4121", "4131", "4789"].includes(mcc)) return "Transport";
  if (["5541", "5542"].includes(mcc)) return "Fuel & gas";
  if (["5812", "5813", "5814"].includes(mcc)) return "Dining out";
  if (["5411", "5422", "5441", "5451", "5462", "5499"].includes(mcc)) return "Groceries";
  if (mcc === "5912") return "Pharmacy";
  if (mcc === "8021") return "Dentist";
  if (["8011", "8031", "8041", "8042", "8049", "8099"].includes(mcc)) return "Private health";
  if (["5311", "5331", "5399", "5611", "5621", "5631", "5641", "5651", "5655", "5661", "5691", "5941", "5947"].includes(mcc)) return "Shopping";
  if (["7221", "7230", "7298"].includes(mcc)) return "Personal care";
  if (mcc === "8299") return "Workshops & classes";
  if (["4814", "4899"].includes(mcc)) return "Bills & utilities";
  if (["5734", "5818"].includes(mcc)) return "Subscriptions & software";
  return null;
}

export async function ensureDefaultCategories(supabase: SupabaseClient, userId: string) {
  const { data: existing, error } = await supabase.from("categories").select("id,name,parent_id,is_archived").eq("user_id", userId).eq("kind", "expense");
  if (error) throw error;
  const existingNames = new Set((existing ?? []).map((category) => category.name));
  const missingParents = defaultExpenseCategories.filter((category) => !category.parentName && !existingNames.has(category.name));
  if (missingParents.length) {
    const { error: insertError } = await supabase.from("categories").insert(missingParents.map(categoryRow));
    if (insertError) throw insertError;
  }
  const { data: parents, error: parentsError } = await supabase.from("categories").select("id,name").eq("user_id", userId).eq("kind", "expense");
  if (parentsError) throw parentsError;
  const parentIds = new Map((parents ?? []).map((category) => [category.name, category.id]));
  const missingChildren = defaultExpenseCategories.filter((category) => category.parentName && !existingNames.has(category.name));
  if (missingChildren.length) {
    const { error: insertError } = await supabase.from("categories").insert(missingChildren.map((category) => ({ ...categoryRow(category), parent_id: parentIds.get(category.parentName!) ?? null })));
    if (insertError) throw insertError;
  }
  const { data: allDefaults, error: allDefaultsError } = await supabase.from("categories").select("id,name,parent_id,is_archived").eq("user_id", userId).eq("kind", "expense");
  if (allDefaultsError) throw allDefaultsError;
  const rowsByName = new Map((allDefaults ?? []).map((category) => [category.name, category]));
  const idsByName = new Map((allDefaults ?? []).map((category) => [category.name, category.id]));
  const hierarchyUpdates = new Map<string, string[]>();
  for (const category of defaultExpenseCategories) {
    const row = rowsByName.get(category.name);
    if (!row) continue;
    const parentId = category.parentName ? idsByName.get(category.parentName) ?? null : null;
    if (row.parent_id === parentId && !row.is_archived) continue;
    const key = parentId ?? "root";
    hierarchyUpdates.set(key, [...(hierarchyUpdates.get(key) ?? []), row.id]);
  }
  for (const [key, ids] of hierarchyUpdates) {
    const { error: updateError } = await supabase.from("categories").update({ parent_id: key === "root" ? null : key, is_archived: false }).eq("user_id", userId).in("id", ids);
    if (updateError) throw updateError;
  }
  const metadataUpdates = new Map<string, { values: { life_area: string; is_essential: boolean; is_extraordinary: boolean }; ids: string[] }>();
  for (const category of defaultExpenseCategories) {
    const row = rowsByName.get(category.name);
    if (!row) continue;
    const values = { life_area: category.lifeArea, is_essential: category.essential, is_extraordinary: category.extraordinary ?? false };
    const key = JSON.stringify(values);
    const group = metadataUpdates.get(key) ?? { values, ids: [] };
    group.ids.push(row.id);
    metadataUpdates.set(key, group);
  }
  for (const { values, ids } of metadataUpdates.values()) {
    const { error: metadataError } = await supabase.from("categories").update(values).eq("user_id", userId).in("id", ids);
    if (metadataError) throw metadataError;
  }
  const { error: archiveError } = await supabase.from("categories").update({ is_archived: true }).eq("user_id", userId).eq("kind", "expense").in("name", archivedDefaultCategoryNames);
  if (archiveError) throw archiveError;
  const { data, error: reloadError } = await supabase.from("categories").select("id,name").eq("user_id", userId).eq("kind", "expense").eq("is_archived", false);
  if (reloadError) throw reloadError;
  return new Map((data ?? []).map((category) => [category.name, category.id]));

  function categoryRow(category: DefaultExpenseCategory) {
    return { user_id: userId, name: category.name, kind: "expense", color: category.color, life_area: category.lifeArea, is_essential: category.essential, is_extraordinary: category.extraordinary ?? false };
  }
}
