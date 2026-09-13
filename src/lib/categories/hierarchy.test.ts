import { describe, expect, it } from "vitest";
import type { WorkspaceCategory } from "@/lib/workspace/demo";
import { categoryOptions } from "./hierarchy";

const category = (id: string, name: string, parentId: string | null): WorkspaceCategory => ({
  id,
  name,
  kind: "expense",
  color: null,
  icon: null,
  parent_id: parentId,
  life_area: "Test",
  is_essential: false,
});

describe("categoryOptions", () => {
  it("groups children under their actual parent and shows the full path", () => {
    const options = categoryOptions([
      category("therapy", "Therapy", null),
      category("travel", "Travel", null),
      category("diving", "Diving & activities", "travel"),
      category("health", "Health", null),
      category("dentist", "Dentist", "health"),
      category("housing", "Housing", null),
      category("cleaning", "Cleaning", "housing"),
    ], "expense");

    expect(options.map((option) => option.label)).toEqual([
      "Health",
      "Health → Dentist",
      "Housing",
      "Housing → Cleaning",
      "Therapy",
      "Travel",
      "Travel → Diving & activities",
    ]);
  });

  it("keeps orphaned and cyclic categories visible without looping", () => {
    const options = categoryOptions([
      category("orphan", "Orphan", "missing"),
      category("a", "Cycle A", "b"),
      category("b", "Cycle B", "a"),
    ]);

    expect(options.map((option) => option.category.id).sort()).toEqual(["a", "b", "orphan"]);
  });
});
