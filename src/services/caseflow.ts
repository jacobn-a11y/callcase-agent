import OpenAI from "openai";
import os from "node:os";
import path from "node:path";

import { dedupeCalls } from "../pipeline/dedupe.js";
import {
  renderMergedMarkdown,
  writeCallMarkdownFiles,
  writeMergedMarkdownFile,
} from "../pipeline/markdown.js";
import { QuoteExtractor } from "../pipeline/quotes.js";
import { CaseStudyGenerator } from "../pipeline/caseStudies.js";
import { USE_CASES } from "../prompts/useCases.js";
import { accountIdFromName } from "../providers/account-utils.js";
import { GongProvider } from "../providers/gongProvider.js";
import { GrainProvider } from "../providers/grainProvider.js";
import { writeJsonFile, writeTextFile } from "../utils/fs.js";
import { matchSharedAccounts } from "../webapp/account-matcher.js";
import type { SharedAccountOption } from "../webapp/account-matcher.js";
import type { BuildRequest, DiscoverRequest } from "./contracts.js";

interface CreateProvidersInput {
  gongBaseUrl: string;
  gongAccessToken?: string;
  gongAccessKey?: string;
  gongAccessKeySecret?: string;
  grainBaseUrl: string;
  grainApiToken?: string;
  internalEmailDomains?: string;
}

export interface DiscoverResult {
  accounts: SharedAccountOption[];
  counts: {
    gongAccounts: number;
    grainAccounts: number;
    sharedAccounts: number;
  };
}

export interface BuildStoryResult {
  accountName: string;
  storyType: {
    id: string;
    name: string;
  };
  callsFetched: number;
  callsAfterDedupe: number;
  duplicatesRemoved: number;
  markdownDownloadsPath: string;
  storyDownloadsPath: string;
  output: {
    callFiles: string[];
    mergedFile: string;
    dedupeReport: string;
  };
  storyMarkdown: string;
  quotesExtracted: number;
  claimsExtracted: number;
}

export function listStoryTypes() {
  return USE_CASES.map((storyType) => ({
    id: storyType.id,
    name: storyType.name,
    stage: storyType.stage,
    focus: storyType.focus,
    spec: storyType.spec,
  }));
}

export async function discoverSharedAccounts(input: DiscoverRequest): Promise<DiscoverResult> {
  const { gongProvider, grainProvider } = createProviders(input);

  const [gongAccounts, grainAccounts] = await Promise.all([
    gongProvider.discoverAccounts?.({
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxCalls: input.maxCalls,
    }) ?? Promise.resolve([]),
    grainProvider.discoverAccounts?.({
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxCalls: input.maxCalls,
    }) ?? Promise.resolve([]),
  ]);

  const sharedAccounts = await matchSharedAccounts({
    gongAccounts,
    grainAccounts,
    openaiApiKey: input.openaiApiKey,
    openaiModel: input.openaiModel,
  });

  return {
    accounts: sharedAccounts,
    counts: {
      gongAccounts: gongAccounts.length,
      grainAccounts: grainAccounts.length,
      sharedAccounts: sharedAccounts.length,
    },
  };
}

export async function buildStory(input: BuildRequest): Promise<BuildStoryResult> {
  const { gongProvider, grainProvider } = createProviders(input);

  const [gongCalls, grainCalls] = await Promise.all([
    gongProvider.fetchCalls({
      accountName: input.selectedAccount.gongName,
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxCalls: input.maxCalls,
    }),
    grainProvider.fetchCalls({
      accountName: input.selectedAccount.grainName,
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxCalls: input.maxCalls,
    }),
  ]);

  const combined = [...gongCalls, ...grainCalls];
  if (combined.length === 0) {
    throw new Error("No calls found for the selected account/company in Gong or Grain.");
  }

  const dedupe = dedupeCalls(combined);
  if (dedupe.calls.length === 0) {
    throw new Error("All calls were removed by dedupe. Try a different account or date range.");
  }

  const accountName = input.selectedAccount.displayName;
  const accountId = accountIdFromName(accountName);

  const calls = dedupe.calls
    .map((call) => ({
      ...call,
      accountId,
      accountName,
    }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const mergedMarkdown = renderMergedMarkdown(accountName, accountId, calls);
  const downloadsPath = path.join(os.homedir(), "Downloads", `${safeFileName(accountName)}.md`);
  await writeTextFile(downloadsPath, mergedMarkdown);

  const outputBase = path.resolve(process.cwd(), "output-web");
  const [callPaths, mergedPath] = await Promise.all([
    writeCallMarkdownFiles(outputBase, calls),
    writeMergedMarkdownFile(outputBase, accountName, accountId, calls),
  ]);

  const storyType = USE_CASES.find((item) => item.id === input.storyTypeId);
  if (!storyType) {
    throw new Error(`Unknown story type: ${input.storyTypeId}`);
  }

  const openai = new OpenAI({ apiKey: input.openaiApiKey });
  const model = input.openaiModel ?? "gpt-4o";

  const extractor = new QuoteExtractor(openai, model);
  const { quotes, claims } = await extractor.extractFromCalls(calls);

  const generator = new CaseStudyGenerator(openai, model);
  const [artifact] = await generator.generateAll([storyType], calls, mergedMarkdown, quotes, claims);

  const storyPath = path.join(
    os.homedir(),
    "Downloads",
    `${safeFileName(accountName)} - ${safeFileName(storyType.name)}.md`
  );
  await writeTextFile(storyPath, artifact.markdown);

  const dedupePath = path.resolve(outputBase, safeFileName(accountName), "dedupe", "duplicates.json");
  await writeJsonFile(dedupePath, {
    totalFetchedCalls: combined.length,
    dedupedCalls: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    duplicates: dedupe.duplicates,
  });

  return {
    accountName,
    storyType: { id: storyType.id, name: storyType.name },
    callsFetched: combined.length,
    callsAfterDedupe: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    markdownDownloadsPath: downloadsPath,
    storyDownloadsPath: storyPath,
    output: {
      callFiles: callPaths,
      mergedFile: mergedPath,
      dedupeReport: dedupePath,
    },
    storyMarkdown: artifact.markdown,
    quotesExtracted: quotes.length,
    claimsExtracted: claims.length,
  };
}

export function safeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

export function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createProviders(input: CreateProvidersInput): {
  gongProvider: GongProvider;
  grainProvider: GrainProvider;
} {
  const gongProvider = new GongProvider({
    baseUrl: input.gongBaseUrl,
    accessToken: input.gongAccessToken,
    accessKey: input.gongAccessKey,
    accessKeySecret: input.gongAccessKeySecret,
    internalDomains: input.internalEmailDomains,
  });

  const grainProvider = new GrainProvider({
    apiToken: input.grainApiToken!,
    baseUrl: input.grainBaseUrl,
    internalDomains: input.internalEmailDomains,
  });

  return { gongProvider, grainProvider };
}
