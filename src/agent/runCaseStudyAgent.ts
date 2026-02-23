import OpenAI from "openai";
import path from "node:path";
import type { AgentEnv } from "../config/env.js";
import { loadAgentEnv } from "../config/env.js";
import { dedupeCalls } from "../pipeline/dedupe.js";
import { USE_CASES } from "../prompts/useCases.js";
import { createProvider } from "../providers/factory.js";
import { accountIdFromName, normalizeAccountName } from "../providers/account-utils.js";
import { CaseStudyGenerator } from "../pipeline/caseStudies.js";
import {
  renderMergedMarkdown,
  writeCallMarkdownFiles,
  writeMergedMarkdownFile,
} from "../pipeline/markdown.js";
import { QuoteExtractor } from "../pipeline/quotes.js";
import type { AgentRunResult, DiscoveredAccount } from "../types/domain.js";
import { slugify, writeJsonFile, writeTextFile } from "../utils/fs.js";

export interface AgentRunInput {
  accountId?: string;
  accountName?: string;
  fromDate?: string;
  toDate?: string;
  maxCalls?: number;
  outputDir?: string;
  provider?: AgentEnv["PROVIDER"];
  selectAccount?: (accounts: DiscoveredAccount[]) => Promise<DiscoveredAccount>;
}

export async function runCaseStudyAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const env = loadAgentEnv({
    OUTPUT_DIR: input.outputDir,
    PROVIDER: input.provider,
  });

  const provider = createProvider(env, input.accountName, input.accountId);
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const selectedAccount = await resolveAccountSelection(provider, input);
  const accountName = selectedAccount.name;
  const accountId = input.accountId ?? selectedAccount.id;

  const callsRaw = await provider.fetchCalls({
    accountId,
    accountName,
    fromDate: input.fromDate,
    toDate: input.toDate,
    maxCalls: input.maxCalls,
  });

  if (callsRaw.length === 0) {
    throw new Error(
      `No calls with transcripts found for account \"${accountName}\" using provider ${provider.name}.`
    );
  }

  const dedupe = dedupeCalls(callsRaw);
  if (dedupe.calls.length === 0) {
    throw new Error("All fetched calls were removed during dedupe. Check provider data and filters.");
  }

  const calls = dedupe.calls.map((call) => ({
    ...call,
    accountId,
    accountName,
  }));

  const callsMarkdownPaths = await writeCallMarkdownFiles(env.OUTPUT_DIR, calls);
  const mergedMarkdownPath = await writeMergedMarkdownFile(
    env.OUTPUT_DIR,
    accountName,
    accountId,
    calls
  );

  const mergedMarkdown = renderMergedMarkdown(accountName, accountId, calls);
  const extractor = new QuoteExtractor(openai, env.OPENAI_MODEL);
  const { quotes, claims } = await extractor.extractFromCalls(calls);

  const accountSlug = slugify(accountName || accountId);
  const quotesPath = path.resolve(env.OUTPUT_DIR, accountSlug, "quotes", "quotes.json");
  const claimsPath = path.resolve(env.OUTPUT_DIR, accountSlug, "claims", "claims.json");
  const dedupeReportPath = path.resolve(env.OUTPUT_DIR, accountSlug, "dedupe", "duplicates.json");

  await writeJsonFile(quotesPath, { accountId, accountName, quotes });
  await writeJsonFile(claimsPath, { accountId, accountName, claims });
  await writeJsonFile(dedupeReportPath, {
    accountId,
    accountName,
    totalFetchedCalls: callsRaw.length,
    dedupedCalls: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    duplicates: dedupe.duplicates,
  });

  const generator = new CaseStudyGenerator(openai, env.OPENAI_MODEL);
  const caseStudies = await generator.generateAll(USE_CASES, calls, mergedMarkdown, quotes, claims);

  const caseStudyPaths: string[] = [];
  for (const item of caseStudies) {
    const filePath = path.resolve(
      env.OUTPUT_DIR,
      accountSlug,
      "case-studies",
      `${item.useCaseId}.md`
    );
    await writeTextFile(filePath, item.markdown);
    caseStudyPaths.push(filePath);
  }

  const manifestPath = path.resolve(env.OUTPUT_DIR, accountSlug, "manifest.json");
  await writeJsonFile(manifestPath, {
    generatedAt: new Date().toISOString(),
    accountId,
    accountName,
    provider: provider.name,
    totalFetchedCalls: callsRaw.length,
    callsProcessed: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    callsMarkdownPaths,
    mergedMarkdownPath,
    quotesPath,
    claimsPath,
    dedupeReportPath,
    caseStudyPaths,
  });

  return {
    accountId,
    accountName,
    callsProcessed: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    callsMarkdownPaths,
    mergedMarkdownPath,
    quotesPath,
    claimsPath,
    dedupeReportPath,
    caseStudyPaths,
  };
}

async function resolveAccountSelection(
  provider: ReturnType<typeof createProvider>,
  input: AgentRunInput
): Promise<{ id: string; name: string }> {
  if (input.accountName?.trim()) {
    const name = input.accountName.trim();
    return {
      id: input.accountId ?? accountIdFromName(name),
      name,
    };
  }

  if (!provider.discoverAccounts) {
    throw new Error(
      `Provider ${provider.name} requires --account-name because it does not support account discovery.`
    );
  }

  const discovered = await provider.discoverAccounts({
    fromDate: input.fromDate,
    toDate: input.toDate,
    maxCalls: input.maxCalls,
  });

  if (discovered.length === 0) {
    throw new Error(
      `No discoverable account/company names found for provider ${provider.name}.`
    );
  }

  const selected = input.selectAccount
    ? await input.selectAccount(discovered)
    : discovered[0];

  if (!selected || !selected.name) {
    throw new Error("Account discovery selection failed.");
  }

  const id = input.accountId ?? accountIdFromName(selected.name);
  return {
    id,
    name: selected.name,
  };
}

export function pickDefaultAccount(accounts: DiscoveredAccount[]): DiscoveredAccount {
  if (accounts.length === 0) {
    throw new Error("No accounts provided");
  }

  return [...accounts].sort((a, b) => {
    if (b.callCount !== a.callCount) return b.callCount - a.callCount;
    return normalizeAccountName(a.name).localeCompare(normalizeAccountName(b.name));
  })[0];
}
