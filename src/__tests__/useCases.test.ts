import { describe, expect, it } from "vitest";
import { USE_CASES } from "../prompts/useCases.js";

describe("use case catalog", () => {
  it("includes all required categories", () => {
    const ids = USE_CASES.map((u) => u.id);
    expect(ids).toContain("industry_trend_validation");
    expect(ids).toContain("roi_financial_outcomes");
    expect(ids).toContain("renewal_partnership_evolution");
    expect(ids).toContain("sales_enablement");
    expect(ids).toContain("industry_specific_usecase");
    expect(ids).toContain("before_after_transformation");
  });

  it("does not contain duplicate ids", () => {
    const ids = USE_CASES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
