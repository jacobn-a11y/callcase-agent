import type { AgentEnv } from "../config/env.js";
import type { CallProvider } from "../types/domain.js";
import { JsonProvider } from "./jsonProvider.js";
import { MergeProvider } from "./mergeProvider.js";

export function createProvider(env: AgentEnv, accountName: string, accountId: string): CallProvider {
  if (env.PROVIDER === "json") {
    if (!env.JSON_INPUT_FILE) {
      throw new Error("JSON_INPUT_FILE is required when PROVIDER=json");
    }
    return new JsonProvider(env.JSON_INPUT_FILE);
  }

  if (!env.MERGE_API_KEY || !env.MERGE_ACCOUNT_TOKEN) {
    throw new Error("MERGE_API_KEY and MERGE_ACCOUNT_TOKEN are required when PROVIDER=merge");
  }

  return new MergeProvider({
    apiKey: env.MERGE_API_KEY,
    accountToken: env.MERGE_ACCOUNT_TOKEN,
    baseUrl: env.MERGE_BASE_URL,
    accountName,
    fallbackAccountId: accountId,
  });
}
