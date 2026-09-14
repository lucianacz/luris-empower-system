export interface PlanningScenario {
  question: string;
  currentCash: number;
  monthlyIncome: number;
  monthlyLivingCost: number;
  monthlyGoalContribution: number;
  safetyMonths: number;
}

export interface PlanningAnswer {
  headline: string;
  explanation: string;
  scenarioCost: number;
  monthlyScenarioCost: number;
  months: number;
  safetyBuffer: number;
  projectedCash: number;
  availableAfterSafety: number;
  level: "comfortable" | "tight" | "not_recommended" | "needs_amount";
}

export function answerPlanningQuestion(input: PlanningScenario): PlanningAnswer {
  const amount = extractUsdAmount(input.question);
  const months = extractMonths(input.question);
  const safetyBuffer = input.monthlyLivingCost * input.safetyMonths;
  if (amount == null) return {
    headline: "Necesito un monto para calcularlo",
    explanation: "Incluí el costo en USD y, si es mensual, por cuántos meses. Por ejemplo: “¿Puedo pagar USD 2.000 por mes durante dos meses?”.",
    scenarioCost: 0,
    monthlyScenarioCost: 0,
    months,
    safetyBuffer,
    projectedCash: input.currentCash,
    availableAfterSafety: input.currentCash - safetyBuffer,
    level: "needs_amount",
  };
  const monthlyLanguage = /(?:por|al|cada)\s+mes|mensual|monthly|rent|alquil/i.test(input.question);
  const scenarioCost = monthlyLanguage ? amount * months : amount;
  const monthlyScenarioCost = monthlyLanguage ? amount : scenarioCost / months;
  const projectedCash = input.currentCash
    + input.monthlyIncome * months
    - input.monthlyLivingCost * months
    - input.monthlyGoalContribution * months
    - scenarioCost;
  const availableAfterSafety = projectedCash - safetyBuffer;
  const level = availableAfterSafety < 0 ? "not_recommended" : availableAfterSafety < input.monthlyLivingCost ? "tight" : "comfortable";
  const headline = level === "comfortable"
    ? "Sí, entra en el plan con margen"
    : level === "tight"
      ? "Es posible, pero deja poco margen"
      : "No entra de forma prudente con estos supuestos";
  const explanation = `Después de ${months} mes${months === 1 ? "" : "es"}, la proyección deja ${usd(projectedCash)} líquidos. Reservando ${input.safetyMonths} meses de gastos (${usd(safetyBuffer)}), quedan ${usd(availableAfterSafety)} de margen.`;
  return { headline, explanation, scenarioCost, monthlyScenarioCost, months, safetyBuffer, projectedCash, availableAfterSafety, level };
}

export function extractUsdAmount(question: string): number | null {
  const normalized = question.replace(/\s/g, "");
  const thousands = normalized.match(/(?:USD|US\$|\$)?([\d.,]+)(?:mil|k)(?:USD|d[oó]lares?)?/i)?.[1];
  if (thousands) {
    const numeric = Number(thousands.replace(",", "."));
    if (Number.isFinite(numeric) && numeric > 0) return numeric * 1000;
  }
  const explicit = normalized.match(/(?:USD|US\$|\$)([\d.,]+)/i)?.[1]
    ?? normalized.match(/([\d.,]+)(?:USD|d[oó]lares?)/i)?.[1];
  if (!explicit) return null;
  const separators = explicit.match(/[.,]/g)?.length ?? 0;
  const decimalStyle = separators === 1 && /[.,]\d{1,2}$/.test(explicit);
  const numeric = Number(decimalStyle ? explicit.replace(",", ".") : explicit.replace(/[.,]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function extractMonths(question: string): number {
  const numeric = question.match(/(\d+)\s*(?:mes|meses|month|months)/i)?.[1];
  if (numeric) return Math.max(1, Number(numeric));
  const words: Record<string, number> = { un: 1, uno: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6 };
  const word = question.toLocaleLowerCase().match(/\b(un|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six)\s+(?:mes|meses|month|months)\b/)?.[1];
  return word ? words[word] : 1;
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
