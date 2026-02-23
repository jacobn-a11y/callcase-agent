import { describe, expect, it } from "vitest";
import { CompositeProvider } from "../providers/compositeProvider.js";
import type { CallProvider } from "../types/domain.js";

function provider(name: string, accounts: Array<{ name: string; normalizedName: string; callCount: number }>): CallProvider {
  return {
    name,
    async fetchCalls() {
      return [];
    },
    async discoverAccounts() {
      return accounts.map((account) => ({ ...account, source: name }));
    },
  };
}

describe("CompositeProvider", () => {
  it("returns only shared accounts across providers", async () => {
    const gong = provider("gong", [
      { name: "Acme Inc", normalizedName: "acme", callCount: 4 },
      { name: "Northstar", normalizedName: "northstar", callCount: 2 },
    ]);

    const grain = provider("grain", [
      { name: "Acme", normalizedName: "acme", callCount: 3 },
      { name: "Delta", normalizedName: "delta", callCount: 1 },
    ]);

    const composite = new CompositeProvider([gong, grain], { sharedAccountsOnly: true });

    const accounts = await composite.discoverAccounts?.({});

    expect(accounts).toHaveLength(1);
    expect(accounts?.[0].normalizedName).toBe("acme");
    expect(accounts?.[0].source).toBe("gong+grain");
  });
});
