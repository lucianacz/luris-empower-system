import { cleanDescription } from "@/lib/import/normalize";
import type { TransactionKind } from "@/lib/import/types";

export interface KnownMerchantRule {
  id: string;
  pattern: RegExp;
  displayName: string;
  preserveDisplayName?: boolean;
  categoryName: string | null;
  countryCode?: string;
  personRole?: string;
  recurrenceHint?: "weekly" | "monthly" | "annual";
  recurringStatus?: "active" | "inactive" | "uncertain";
  subscription?: boolean;
  recurrenceDenied?: boolean;
  seasonalMonthsPerYear?: number;
  beneficiaryScope?: "personal" | "shared";
  reimbursementStatus?: "none" | "expected" | "partial" | "settled" | "uncertain";
  amount?: number;
  minAbsAmount?: number;
  currency?: string;
  kind?: TransactionKind;
  excludedFromTotals?: boolean;
  ignoredMissingMonths?: string[];
  validDuplicateMonths?: string[];
  confirmedPlanChangeOn?: string;
  paidByPartner?: boolean;
  transactionLabel?: string;
  notes?: string;
}

export interface KnownMerchantContext {
  amount?: string | number | null;
  currency?: string | null;
}

export function resolvedKnownMerchantKind(rule: KnownMerchantRule | null, amount: string, currentKind: TransactionKind): TransactionKind {
  if (rule?.kind) return rule.kind;
  if (rule?.categoryName && Number(amount) < 0) return "expense";
  return currentKind;
}

export const knownMerchantRules: KnownMerchantRule[] = [
  { id: "apple-youtube", pattern: /\bapple\.com(?:\/|\s+)bill\b/i, displayName: "YouTube (via Apple)", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "shared", amount: 9.49, currency: "USD" },
  { id: "apple-icloud", pattern: /\bapple\.com(?:\/|\s+)bill\b/i, displayName: "iCloud (via Apple)", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal", amount: 0.99, currency: "USD", ignoredMissingMonths: ["2025-12"], notes: "Not subscribed in December 2025; resumed afterward." },
  { id: "seven-eleven", pattern: /\b(?:7|seven)[ -]?eleven\b/i, displayName: "7-Eleven", categoryName: "Groceries", beneficiaryScope: "shared" },
  { id: "citymall", pattern: /\bcity\s*mall\b/i, displayName: "Citymall", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "golden-mall", pattern: /\bgolden\s*mall\b/i, displayName: "Golden Mall", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "jerusalem-panama", pattern: /\bjerusalem\s+de\s+panama\b/i, displayName: "Jerusalem de Panamá", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "daily-mart", pattern: /\bdaily\s*mart\b/i, displayName: "Daily Mart", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "bm-rio-claro", pattern: /\bbm\s+rio\s+claro\b/i, displayName: "BM Río Claro", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "supermarkets", pattern: /\b(?:mini\s*super|minisuper|mega\s*super|supermercado|supermarket|super)\b/i, displayName: "Supermarket", preserveDisplayName: true, categoryName: "Groceries", beneficiaryScope: "shared" },
  { id: "starbucks", pattern: /\bstarbucks?\b/i, displayName: "Starbucks", categoryName: "Dining out" },
  { id: "taco-fish", pattern: /\btaco\s+fish\b/i, displayName: "Taco Fish", categoryName: "Dining out", countryCode: "MX", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "oxxo-gas", pattern: /\boxxo\b.*\bgas\b|\bgas\b.*\boxxo\b/i, displayName: "OXXO gas station", preserveDisplayName: true, categoryName: "Fuel & gas", countryCode: "MX", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "oxxo", pattern: /\boxxo\b(?![^)]*\bgas\b)/i, displayName: "OXXO", preserveDisplayName: true, categoryName: "Groceries", countryCode: "MX", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "open25", pattern: /\bopen\s*25\b/i, displayName: "Open25", categoryName: "Groceries", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "newgarden", pattern: /\bnewgarden\b/i, displayName: "Newgarden", categoryName: "Groceries", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "aeromexico", pattern: /\baeromexico\b/i, displayName: "Aeromexico", categoryName: "Flights", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "pedidos-ya", pattern: /\bpedidos\s*ya\b/i, displayName: "PedidosYa", categoryName: "Dining out" },
  { id: "uber", pattern: /\buber\b(?!\s*(?:\*?\s*)?eats)/i, displayName: "Uber", categoryName: "Transport" },
  { id: "farmacity", pattern: /\bfarmacity\b/i, displayName: "Farmacity", categoryName: "Pharmacy" },
  { id: "stefanie-menajovsky", pattern: /\bstefanie\s+menajovsky\b/i, displayName: "Stefanie Menajovsky", categoryName: "Dentist", personRole: "Dentist" },
  { id: "esposito-maria-cecilia", pattern: /\besposito\s+maria\s+cecilia\b/i, displayName: "Esposito Maria Cecilia", categoryName: "Alternative therapy", personRole: "Biodecoder" },
  { id: "monk-augusto", pattern: /\bmonk\s+augusto\b/i, displayName: "Monk Augusto", categoryName: "English classes", personRole: "English teacher", recurrenceHint: "weekly" },
  { id: "daniel-jesica-solange", pattern: /\bdaniel\s+jesica\s+solange\b/i, displayName: "Daniel Jesica Solange", categoryName: "Therapy", personRole: "Psychologist", recurrenceHint: "weekly", recurringStatus: "active", beneficiaryScope: "personal", transactionLabel: "Weekly therapy" },
  { id: "anibal-marcos-paz", pattern: /\banibal\s+marcos\s+paz\b/i, displayName: "Anibal Marcos Paz", categoryName: "Diving & activities", personRole: "Surfboard workshop", beneficiaryScope: "personal" },
  { id: "fraiman-karina-andrea", pattern: /\bfraiman\s+karina\s+andrea\b/i, displayName: "Fraiman Karina Andrea", categoryName: "Workshops & classes", personRole: "Women's workshop", beneficiaryScope: "personal" },
  { id: "esteban-leisa-dermatology", pattern: /\besteban\s+tomas\s+halac\b|\bleisa\s+maria\s+molinari\b/i, displayName: "Skin medical center", categoryName: "Dermatology", personRole: "Skin medical center", beneficiaryScope: "personal" },
  { id: "nely-nardy-vargas-castro", pattern: /\bnely\s+nardy\s+vargas\s+castro\b/i, displayName: "Nely Nardy Vargas Castro", categoryName: "Cleaning", countryCode: "CR", personRole: "Cleaner" },
  { id: "cara-goldberg", pattern: /\bcara\s+goldberg\b/i, displayName: "Casa Costa Rica · Cara Goldberg", categoryName: "Housing", countryCode: "CR", personRole: "Landlord", recurrenceHint: "monthly", recurringStatus: "uncertain", seasonalMonthsPerYear: 6, beneficiaryScope: "shared" },
  { id: "airbnb", pattern: /\bairbnb\b/i, displayName: "Airbnb", categoryName: "Housing", beneficiaryScope: "shared" },
  { id: "sansa-cash-returned", pattern: /\bsansa\b/i, displayName: "SANSA", categoryName: "Loan on card · cash returned", recurrenceDenied: true, beneficiaryScope: "shared", reimbursementStatus: "settled", kind: "transfer", excludedFromTotals: true, transactionLabel: "Loan on card · returned in cash", notes: "Short-term loan that was returned in cash; retained as a settled reimbursement and excluded from spending." },
  { id: "el-conejo-cash-returned", pattern: /\b(?:servicentro\s+)?el\s+conejo\b/i, displayName: "El Conejo", categoryName: "Loan on card · cash returned", countryCode: "CR", recurrenceDenied: true, beneficiaryScope: "shared", reimbursementStatus: "settled", kind: "transfer", excludedFromTotals: true, transactionLabel: "Loan on card · returned in cash", notes: "Short-term loan that was returned in cash; retained as a settled reimbursement and excluded from spending." },
  { id: "fuel-costa-rica", pattern: /\blumicentro\b|\bservicentro\b|\bgas\s+station\b/i, displayName: "Gas station", preserveDisplayName: true, categoryName: "Fuel & gas", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "casa-hyundai", pattern: /\bla\s+casa\s+del\s+hyundai\b/i, displayName: "La Casa del Hyundai", categoryName: "Car repairs", beneficiaryScope: "shared" },
  { id: "centro-llantero", pattern: /\bcentro\s+llantero\s+del\s+sur\b/i, displayName: "Centro Llantero del Sur", categoryName: "Car repairs", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "sephora", pattern: /\bsephora\b/i, displayName: "Sephora", categoryName: "Personal care" },
  { id: "enterprise", pattern: /\benterprise\b/i, displayName: "Enterprise", categoryName: "Car rental" },
  { id: "anthropic-claude", pattern: /\banthropic\*?\s*claude\s+sub\b|\bclaude\.ai\s+subscription\b/i, displayName: "Claude", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal", ignoredMissingMonths: ["2026-05", "2026-06"], confirmedPlanChangeOn: "2026-08-25", notes: "Paused before resubscribing in July 2026; latest amount is the normal price after a plan change." },
  { id: "openai-chatgpt", pattern: /\bopenai\s*\*?\s*chatgpt\s+subscr\b|\bchatgpt\s+subscription\b/i, displayName: "ChatGPT", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal", validDuplicateMonths: ["2026-04"], confirmedPlanChangeOn: "2026-04-14", notes: "Both April 2026 charges are valid; the plan changed on April 14." },
  { id: "starlink", pattern: /\bstarlink\s+internet\b/i, displayName: "Starlink Internet", categoryName: "Bills & utilities", countryCode: "CR", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "shared", paidByPartner: true, notes: "Shared household Wi-Fi subscription paid by partner; gaps in this account are not missing bills." },
  { id: "k-eta", pattern: /\bk[ -]?eta\b/i, displayName: "K-ETA", categoryName: "Visas", countryCode: "KR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "esta", pattern: /\bus\s*customs\s+esta\b|\besta\s+appl(?:ication)?\b/i, displayName: "ESTA travel authorization", categoryName: "Visas", countryCode: "US", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "atm-withdrawal", pattern: /\batm\s+withdrawal\b|\batm0*53\b/i, displayName: "ATM cash withdrawal", categoryName: null, recurrenceDenied: true, beneficiaryScope: "personal", kind: "cash_withdrawal", excludedFromTotals: true, transactionLabel: "Cash withdrawal", notes: "Cash movement only. It becomes spending only when the cash purchase itself is recorded." },
  { id: "adrien-levinger", pattern: /\badrien\s+levi(?:n|gn)ger\b/i, displayName: "Salary · Adrien Levinger", categoryName: null, recurrenceHint: "monthly", recurringStatus: "active", beneficiaryScope: "personal", kind: "income", excludedFromTotals: false, notes: "Luciana's salary paid by her employer." },
  { id: "juan-pablo-vaghi", pattern: /\bjuan\s+pablo\s+vaghi\b/i, displayName: "Salary · Juan Pablo Vaghi", categoryName: null, recurrenceHint: "monthly", recurringStatus: "active", beneficiaryScope: "personal", kind: "income", excludedFromTotals: false, notes: "Julian's salary source since February 2026." },
  { id: "jazak-veematz", pattern: /\bjazak\s+veematz\s+ll\b/i, displayName: "Jazak VeEmatz LL", categoryName: "Papaya Kids", recurrenceDenied: true, beneficiaryScope: "personal", excludedFromTotals: false, transactionLabel: "Papaya Kids · Julian's company", notes: "Jazak VeEmatz is Julian's company; its trading name is Papaya Kids." },
  { id: "longxiang-knitting", pattern: /\blongxiang\s+knitting\s+co\.?\s*,?\s*limited\b/i, displayName: "Longxiang Knitting Co., Limited", categoryName: "Papaya Kids", recurrenceDenied: true, beneficiaryScope: "personal", excludedFromTotals: false, transactionLabel: "Papaya Kids · supplier", notes: "Papaya Kids supplier." },
  { id: "global-encounters", pattern: /\bglobal\s+encounters\s+s\.?a\.?\b/i, displayName: "Global Encounters S.A", categoryName: null, recurrenceHint: "monthly", recurringStatus: "inactive", beneficiaryScope: "personal", kind: "income", excludedFromTotals: false, transactionLabel: "Julian's previous job", notes: "Julian's previous employer." },
  { id: "pablo-exequiel-buchholz", pattern: /\bpablo\s+exequiel\s+buchholz\b/i, displayName: "Pablo Exequiel Buchholz", categoryName: "Personal care", recurrenceDenied: true, beneficiaryScope: "personal", transactionLabel: "Tattoo artist" },
  { id: "el-colono-loan", pattern: /\bel\s+colono(?:\s+de)?\s+laurel\b/i, displayName: "El Colono Laurel", categoryName: "Loan on card · cash returned", recurrenceDenied: true, beneficiaryScope: "personal", reimbursementStatus: "settled", kind: "transfer", excludedFromTotals: true, transactionLabel: "Loan on card · returned in cash", notes: "Money lent and later returned in cash. This outflow is a receivable movement, not consumption." },
  { id: "avila-horizon", pattern: /\bavilas?\s+horizon\b/i, displayName: "Avila's Horizon Dive Resort", categoryName: "Diving & activities", countryCode: "PH", recurrenceDenied: true, beneficiaryScope: "personal", notes: "PADI dive resort in Malapascua; grouped with diving and activities." },
  { id: "asian-local-transport", pattern: /\bmobile\s+suica\b|\bsioibeoseu\s+seungchagueon\b|\bhong\s+kong\s+tramway\b|\bairswift\s+transport\b/i, displayName: "Local transport", preserveDisplayName: true, categoryName: "Transport", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "asian-hotels", pattern: /\btepanee\s+resort\b|\bebino\s+puluong\s+resort\b/i, displayName: "Hotel or resort", preserveDisplayName: true, categoryName: "Hotels", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "asian-activities", pattern: /\bbulguksa\b|\bkorea\s+heritage\s+service\b|\bmuseo\s+frida\s+kahlo\b/i, displayName: "Cultural activity", preserveDisplayName: true, categoryName: "Diving & activities", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "sugi-pharmacy", pattern: /\bsugi\s+pharmacy\b/i, displayName: "Sugi Pharmacy", categoryName: "Pharmacy", countryCode: "JP", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "private-medical", pattern: /\bccss\s+hospital\b|\bm(?:yong|yeong)dongyebb?eumjooeu[ib]\b/i, displayName: "Private medical care", preserveDisplayName: true, categoryName: "Private health", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "asian-personal-care", pattern: /\bsense\s+spa\b|\bkpay\*?t-?nail\b/i, displayName: "Personal care", preserveDisplayName: true, categoryName: "Personal care", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "photo-shops", pattern: /\bkitamura\b|\btokyophotolab\b|\bfilming\s+lab\b/i, displayName: "Photography shop", preserveDisplayName: true, categoryName: "Shopping", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "known-airlines", pattern: /\barajet\b|\bhkairweb\b|\bgreater\s+bay\b|\bflyscoot\b|\bjin\s+air\b|\bviva\s*aerob\b|\btransp\s+volaris\b|\bcard\s+charge\s+\(united\d+\)|\bcard\s+charge\s+\(indigo\s+ai\)/i, displayName: "Airline", preserveDisplayName: true, categoryName: "Flights", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "localiza", pattern: /^localiza$/i, displayName: "Localiza", categoryName: "Car rental", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "antares-dhangethi", pattern: /\bantares\s+dhangethi\b/i, displayName: "Antares Dhangethi", categoryName: "Hotels", countryCode: "MV", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "hispano-mexicano-buceo", pattern: /\bhispano\s+mexicano\s+de\s+bu\b/i, displayName: "Hispano Mexicano de Buceo", categoryName: "Diving & activities", countryCode: "MX", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "surf-shops", pattern: /\bsea\s+kings\s+surf\s+sh\b/i, displayName: "Sea Kings Surf Shop", categoryName: "Diving & activities", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "express-vpn", pattern: /\bexpressvpn\.com\b/i, displayName: "ExpressVPN", categoryName: "Subscriptions & software", recurrenceHint: "annual", recurringStatus: "active", subscription: true, beneficiaryScope: "personal" },
  { id: "replicate-software", pattern: /\breplicate\b/i, displayName: "Replicate", categoryName: "Subscriptions & software", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "indonesia-visa-arrival", pattern: /\bprismalink\*?ind\s+visaarr\b/i, displayName: "Indonesia visa on arrival", categoryName: "Visas", countryCode: "ID", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "asian-convenience-stores", pattern: /\bfamilymart\b|\be-?mart\s*24\b|\bssiyu\(cu\)|\bcircle\s+k\b|\bgreen\s+lawn\s+vegetable\b/i, displayName: "Convenience store", preserveDisplayName: true, categoryName: "Groceries", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "asian-restaurants", pattern: /\btenryu\s+ramen\b|\bramen\s+fukuchian\b|\byeobi\s+hansik\b|\bsohonkenaniwasoba\b|\bsuffers\s+grillhouse\b|\bsmoothie\s+shop\b|\bbetular\s+patisserie\b|\bpeekaboo\s+hulhumale\b|\bbontemps\b|\bcheesecake\b|\bwadi\s+al\s+zaafaran\s+nuts\b|\bbaikmidang\b|\bfrench\s+bastards\b|\bvenchi\b|\bangel\s+in\s+us\b|\bhughes\s+pizza\b/i, displayName: "Restaurant or café", preserveDisplayName: true, categoryName: "Dining out", recurrenceDenied: true, beneficiaryScope: "shared" },
  { id: "travel-shopping-brands", pattern: /\balibaba\.com\b|\bapple\s+store\b|\bpatagonia\s+ko\b|\basicswalking\b|\bwbf\s+kuta\s+brand\b|\bripcurl\b|\buniqlo\b|\bdecathlon\b|\bduty\s+free\s+shop\b|\bnitori\b/i, displayName: "Shopping", preserveDisplayName: true, categoryName: "Shopping", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "olive-young", pattern: /\bolive\s+young\b/i, displayName: "Olive Young", categoryName: "Personal care", countryCode: "KR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "cocokarafine", pattern: /\bcocokarafine\b/i, displayName: "Cocokara Fine", categoryName: "Pharmacy", countryCode: "JP", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "maldives-telecom", pattern: /\bdhiraagu\b/i, displayName: "Dhiraagu mobile service", categoryName: "Bills & utilities", countryCode: "MV", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "clarence-hostels", pattern: /\bthe\s+clarence\s+park\b|\bclarence\s+castle\s+inc\b/i, displayName: "The Clarence Park hostel", categoryName: "Hotels", countryCode: "CA", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "definit-personal-care", pattern: /^definit$/i, displayName: "Definit", categoryName: "Personal care", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal", notes: "Hair-removal and aesthetics provider in Buenos Aires." },
  { id: "pilates-hiit", pattern: /\bpilateshiit\b/i, displayName: "Pilates / HIIT", categoryName: "Workshops & classes", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "club-ch-classes", pattern: /^club\s+ch$/i, displayName: "Club CH", categoryName: "Workshops & classes", countryCode: "AR", beneficiaryScope: "personal" },
  { id: "argentina-restaurants", pattern: /\bbarlosgalgos\b|\bhavannaestdvt\b|\bconfiteriamora\b|\bgeshatostador\b/i, displayName: "Restaurant or café", preserveDisplayName: true, categoryName: "Dining out", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "argentina-food-shops", pattern: /\bopen25hs\b|\bdieteticastomy\b|\bvidaverde\b/i, displayName: "Food shop", preserveDisplayName: true, categoryName: "Groceries", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "argentina-personal-care", pattern: /\bdermaceutica\b|\bsoylashista\b/i, displayName: "Personal care", preserveDisplayName: true, categoryName: "Personal care", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "mh-atelier", pattern: /\bmh\s+atelier\b/i, displayName: "MH Atelier", categoryName: "Shopping", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "google-one", pattern: /\bgoogle\s*\*?\s*google\s+one\b|\bgoogle\s+one\b/i, displayName: "Google One", categoryName: "Subscriptions & software", recurrenceHint: "annual", recurringStatus: "active", subscription: true, beneficiaryScope: "personal" },
  { id: "martin-ackerman", pattern: /\bmartin\s+ackerman\b/i, displayName: "Martin Ackerman", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "carolina-afergan", pattern: /\bcarolina\s+afergan\b/i, displayName: "Carolina Afergan", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "nicole-aronson", pattern: /\bnicole\s+aronson\b/i, displayName: "Nicole Aronson", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "tatiana-fluk", pattern: /\btatiana\s+fluk\b/i, displayName: "Tatiana Fluk", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "ausol", pattern: /\bausol\b/i, displayName: "AUSOL", categoryName: "Tolls & highways", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "sweet-chemistry-work-test", pattern: /\bsp\s+sweet[ -]?chemistry[ -]?ski\b/i, displayName: "Shopify work test · Sweet Chemistry", categoryName: "Work tests", recurrenceDenied: true, beneficiaryScope: "personal", excludedFromTotals: true },
  { id: "not-subscription-ato-sjo", pattern: /\b24\/7\s+ato\s+sjo\b/i, displayName: "24/7 ATO SJO", categoryName: null, recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "not-subscription-ztl", pattern: /\bztl\*?operadoradefranqui\b/i, displayName: "ZTL Operadora de Franqui", categoryName: null, recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "owned-account", pattern: /\bde una cuenta tuya\b/i, displayName: "Owned-account transfer", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "deel-to-arq", pattern: /\b(?:moved|withdrawal|transfer(?:red)?)\s+to\s+(?:dolarapp+|arq)\b|\bdolarapp+\s*\(?arq\)?\b/i, displayName: "Deel to ARQ", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "arq-currency-conversion", pattern: /\bconversi[oó]n\s+usdc?\s+(?:a|to)\s+ars\b|\bconversi[oó]n\s+ars\s+(?:a|to)\s+usdc?\b/i, displayName: "ARQ currency conversion", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "self-transfer-luciana", pattern: /^(?:payment|transfer(?:encia)?|dep[oó]sito)?\s*(?:to|from|a|de)?\s*luciana(?:\s+aaron)?\s+czikk\b/i, displayName: "Luciana's own-account transfer", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "deel-owned-balance", pattern: /^deel\s+(?:balance|inc)\.?$/i, displayName: "Deel own-account movement", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "deel-owned-transfer", pattern: /\b(?:transfer(?:encia)?|dep[oó]sito|retiro|withdrawal)\b.*\bdeel\s+(?:balance|inc)\b/i, displayName: "Deel own-account movement", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "payoneer-from-deel", pattern: /^payment\s+from\s+deel\b/i, displayName: "Deel to Payoneer", categoryName: null, kind: "transfer", excludedFromTotals: true, transactionLabel: "Internal transfer from Deel" },
  { id: "satu-lagi-villa", pattern: /\b(?:payment\s+to\s+)?julian(?:\s+aaron)?\s+stivelman\b/i, displayName: "Satu Lagi Villa", categoryName: "Satu Lagi Villa", recurrenceDenied: true, beneficiaryScope: "shared", minAbsAmount: 5000, currency: "USD", kind: "investment_purchase", excludedFromTotals: true, notes: "Property acquisition paid from Deel to Julian's Wise account. Kept separate from living expenses." },
  { id: "satu-lagi-baltodano", pattern: /\bbaltodano\s+gomez\s+martin\b/i, displayName: "Satu Lagi Villa · land", categoryName: "Satu Lagi Villa", recurrenceDenied: true, beneficiaryScope: "personal", kind: "investment_purchase", excludedFromTotals: true, transactionLabel: "Land · Satu Lagi", notes: "Land payments financed by Luciana through Julian's Wise account; excluded from monthly living expenses." },
  { id: "satu-lagi-lawyer", pattern: /\bgutierrez\s+gonzalez\s+kaily\s+vanessa\b/i, displayName: "Gutierrez Gonzalez Kaily Vanessa", categoryName: "Satu Lagi Villa", recurrenceDenied: true, beneficiaryScope: "personal", kind: "investment_purchase", excludedFromTotals: true, transactionLabel: "Lawyer · Satu Lagi", notes: "Legal costs for Satu Lagi; excluded from monthly living expenses." },
  { id: "julian-friends", pattern: /\buriel\s+daian\b|\bfederico\s+kosoy\b|\bnicolas\s+kompel\b|\bkevin\s+felstinsky\b|\brodrigo\s+taich\b/i, displayName: "Friends & social", preserveDisplayName: true, categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
];

export function matchKnownMerchant(value: string, context: KnownMerchantContext = {}): KnownMerchantRule | null {
  const description = cleanDescription(value);
  return knownMerchantRules.find((rule) => {
    if (!rule.pattern.test(description)) return false;
    if (rule.currency && rule.currency !== context.currency?.toUpperCase()) return false;
    if (rule.amount !== undefined) {
      const amount = Math.abs(Number(context.amount));
      if (!Number.isFinite(amount) || Math.abs(amount - rule.amount) > 0.001) return false;
    }
    if (rule.minAbsAmount !== undefined && Math.abs(Number(context.amount)) < rule.minAbsAmount) return false;
    return true;
  }) ?? null;
}

export function resolvedKnownMerchantName(rule: KnownMerchantRule | null, description: string) {
  return rule?.preserveDisplayName ? cleanDescription(description) : rule?.displayName ?? cleanDescription(description);
}

export function normalizeUserCountryHint(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (["PA", "PAN", "PANAMA", "PANAMÁ"].includes(normalized)) return "CR";
  if (["CRI", "COSTA RICA"].includes(normalized)) return "CR";
  if (["ARG", "ARGENTINA"].includes(normalized)) return "AR";
  if (["MEX", "MEXICO", "MÉXICO"].includes(normalized)) return "MX";
  if (["USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(normalized)) return "US";
  return normalized;
}

export function isEverydayVariableCategory(categoryName: string | null | undefined): boolean {
  return [
    "Car",
    "Car rental",
    "Car repairs",
    "Dining out",
    "Diving & activities",
    "Entertainment",
    "Flights",
    "Groceries",
    "Hotels",
    "Housing",
    "Fuel & gas",
    "Friends & social",
    "Personal care",
    "Parking",
    "Pharmacy",
    "Shopping",
    "Transport",
    "Tolls & highways",
    "Travel",
  ].includes(categoryName ?? "");
}
