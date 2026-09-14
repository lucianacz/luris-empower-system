import { describe, expect, it } from "vitest";
import { isLocationIndependentCategory } from "./attribution";

describe("location-independent spending", () => {
  it("keeps business costs and subscriptions out of stays and trips", () => {
    expect(isLocationIndependentCategory("Papaya Kids")).toBe(true);
    expect(isLocationIndependentCategory("Subscriptions & software")).toBe(true);
  });

  it("still allows physical spending categories to use a location", () => {
    expect(isLocationIndependentCategory("Hotels")).toBe(false);
    expect(isLocationIndependentCategory("Dining out")).toBe(false);
    expect(isLocationIndependentCategory(null)).toBe(false);
  });
});
