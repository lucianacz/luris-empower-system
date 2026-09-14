import { describe, expect, it } from "vitest";
import { answerPlanningQuestion, extractMonths, extractUsdAmount } from "./advisor";

describe("financial planning advisor", () => {
  it("understands a Spanish monthly rent scenario", () => {
    expect(extractUsdAmount("¿Puedo alquilar por dos meses un departamento de 2.000 USD por mes?")).toBe(2000);
    expect(extractUsdAmount("¿Puedo pagar 2 mil USD por mes?")).toBe(2000);
    expect(extractMonths("¿Puedo alquilar por dos meses?")).toBe(2);
  });

  it("protects the configured emergency buffer and goals", () => {
    const answer = answerPlanningQuestion({ question: "¿Puedo pagar USD 2,000 por mes durante 2 meses?", currentCash: 21000, monthlyIncome: 6000, monthlyLivingCost: 3000, monthlyGoalContribution: 1000, safetyMonths: 3 });
    expect(answer.scenarioCost).toBe(4000);
    expect(answer.projectedCash).toBe(21000);
    expect(answer.safetyBuffer).toBe(9000);
    expect(answer.level).toBe("comfortable");
  });
});
