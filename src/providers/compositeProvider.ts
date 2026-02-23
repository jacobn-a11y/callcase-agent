import type {
  CallProvider,
  CanonicalCall,
  DiscoveredAccount,
  ProviderFetchInput,
} from "../types/domain.js";

interface CompositeProviderOptions {
  sharedAccountsOnly?: boolean;
}

export class CompositeProvider implements CallProvider {
  readonly name: string;

  constructor(
    private readonly providers: CallProvider[],
    private readonly options: CompositeProviderOptions = { sharedAccountsOnly: true }
  ) {
    if (providers.length < 2) {
      throw new Error("CompositeProvider requires at least two providers");
    }
    this.name = providers.map((provider) => provider.name).join("+");
  }

  async fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]> {
    const resultSets = await Promise.all(this.providers.map((provider) => provider.fetchCalls(input)));
    return resultSets.flat().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async discoverAccounts(input: ProviderFetchInput): Promise<DiscoveredAccount[]> {
    const providerAccounts = await Promise.all(
      this.providers.map(async (provider) => {
        if (!provider.discoverAccounts) {
          throw new Error(`Provider ${provider.name} does not support account discovery`);
        }
        const accounts = await provider.discoverAccounts(input);
        return { provider: provider.name, accounts };
      })
    );

    const allNormalized = new Map<string, DiscoveredAccount[]>();

    for (const result of providerAccounts) {
      for (const account of result.accounts) {
        const bucket = allNormalized.get(account.normalizedName) ?? [];
        bucket.push({ ...account, source: result.provider });
        allNormalized.set(account.normalizedName, bucket);
      }
    }

    const output: DiscoveredAccount[] = [];
    for (const [normalizedName, entries] of allNormalized.entries()) {
      if (this.options.sharedAccountsOnly && entries.length < this.providers.length) {
        continue;
      }

      const bestName = entries
        .map((entry) => entry.name)
        .sort((a, b) => b.length - a.length)[0];

      output.push({
        name: bestName,
        normalizedName,
        source: entries.map((entry) => entry.source).join("+"),
        callCount: entries.reduce((sum, entry) => sum + entry.callCount, 0),
      });
    }

    return output.sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));
  }
}
