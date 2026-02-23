import type { AgentEnv } from "../config/env.js";
import type { CallProvider } from "../types/domain.js";
import { accountIdFromName } from "./account-utils.js";
import { CompositeProvider } from "./compositeProvider.js";
import { GongProvider } from "./gongProvider.js";
import { GrainProvider } from "./grainProvider.js";
import { JsonProvider } from "./jsonProvider.js";
import { MergeProvider } from "./mergeProvider.js";

export function createProvider(env: AgentEnv, accountName?: string, accountId?: string): CallProvider {
  if (env.PROVIDER === "json") {
    if (!env.JSON_INPUT_FILE) {
      throw new Error("JSON_INPUT_FILE is required when PROVIDER=json");
    }
    return new JsonProvider(env.JSON_INPUT_FILE);
  }

  if (env.PROVIDER === "merge") {
    if (!env.MERGE_API_KEY || !env.MERGE_ACCOUNT_TOKEN) {
      throw new Error("MERGE_API_KEY and MERGE_ACCOUNT_TOKEN are required when PROVIDER=merge");
    }

    const fallbackName = accountName ?? env.MERGE_ACCOUNT_NAME ?? "Merge Account";
    const fallbackId = accountId ?? env.MERGE_ACCOUNT_ID ?? accountIdFromName(fallbackName);

    return new MergeProvider({
      apiKey: env.MERGE_API_KEY,
      accountToken: env.MERGE_ACCOUNT_TOKEN,
      baseUrl: env.MERGE_BASE_URL,
      accountName: fallbackName,
      fallbackAccountId: fallbackId,
    });
  }

  if (env.PROVIDER === "gong") {
    if (!hasGongCreds(env)) {
      throw new Error(
        "Gong credentials are required: set GONG_ACCESS_TOKEN or GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET"
      );
    }

    return new GongProvider({
      baseUrl: env.GONG_BASE_URL,
      accessToken: env.GONG_ACCESS_TOKEN,
      accessKey: env.GONG_ACCESS_KEY,
      accessKeySecret: env.GONG_ACCESS_KEY_SECRET,
      internalDomains: env.INTERNAL_EMAIL_DOMAINS,
    });
  }

  if (env.PROVIDER === "grain") {
    if (!env.GRAIN_API_TOKEN) {
      throw new Error("GRAIN_API_TOKEN is required when PROVIDER=grain");
    }

    return new GrainProvider({
      apiToken: env.GRAIN_API_TOKEN,
      baseUrl: env.GRAIN_BASE_URL,
      internalDomains: env.INTERNAL_EMAIL_DOMAINS,
    });
  }

  // PROVIDER=gong_grain
  if (!env.GRAIN_API_TOKEN) {
    throw new Error("GRAIN_API_TOKEN is required when PROVIDER=gong_grain");
  }

  if (!hasGongCreds(env)) {
    throw new Error(
      "Gong credentials are required for PROVIDER=gong_grain: set GONG_ACCESS_TOKEN or GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET"
    );
  }

  const gong = new GongProvider({
    baseUrl: env.GONG_BASE_URL,
    accessToken: env.GONG_ACCESS_TOKEN,
    accessKey: env.GONG_ACCESS_KEY,
    accessKeySecret: env.GONG_ACCESS_KEY_SECRET,
    internalDomains: env.INTERNAL_EMAIL_DOMAINS,
  });

  const grain = new GrainProvider({
    apiToken: env.GRAIN_API_TOKEN,
    baseUrl: env.GRAIN_BASE_URL,
    internalDomains: env.INTERNAL_EMAIL_DOMAINS,
  });

  return new CompositeProvider([gong, grain], { sharedAccountsOnly: true });
}

function hasGongCreds(env: AgentEnv): boolean {
  return Boolean(
    env.GONG_ACCESS_TOKEN || (env.GONG_ACCESS_KEY && env.GONG_ACCESS_KEY_SECRET)
  );
}
