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
import type { BuildRequest, DiscoverRequest, ExportRequest } from "./contracts.js";
import type { CanonicalCall, QuoteEvidence } from "../types/domain.js";

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
  accountId: string;
  storyType: {
    id: string;
    name: string;
  };
  callsFetched: number;
  callsAfterDedupe: number;
  duplicatesRemoved: number;
  markdownDownloadsPath: string;
  storyDownloadsPath: string;
  quotesCsvDownloadsPath: string;
  output: {
    callFiles: string[];
    mergedFile: string;
    dedupeReport: string;
  };
  storyMarkdown: string;
  quotesExtracted: number;
  claimsExtracted: number;
  quoteCsvRows: number;
}

export interface ExportCorpusResult {
  accountName: string;
  accountId: string;
  callsFetched: number;
  callsAfterDedupe: number;
  duplicatesRemoved: number;
  markdownDownloadsPath: string;
  output: {
    callFiles: string[];
    mergedFile: string;
    dedupeReport: string;
  };
  storyTypeOptions: ReturnType<typeof listStoryTypes>;
}

interface PreparedCorpus {
  accountName: string;
  accountId: string;
  calls: CanonicalCall[];
  mergedMarkdown: string;
  callsFetched: number;
  callsAfterDedupe: number;
  duplicatesRemoved: number;
  markdownDownloadsPath: string;
  output: {
    callFiles: string[];
    mergedFile: string;
    dedupeReport: string;
  };
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

export async function exportAccountCorpus(input: ExportRequest): Promise<ExportCorpusResult> {
  const prepared = await prepareAccountCorpus(input);
  return {
    accountName: prepared.accountName,
    accountId: prepared.accountId,
    callsFetched: prepared.callsFetched,
    callsAfterDedupe: prepared.callsAfterDedupe,
    duplicatesRemoved: prepared.duplicatesRemoved,
    markdownDownloadsPath: prepared.markdownDownloadsPath,
    output: prepared.output,
    storyTypeOptions: listStoryTypes(),
  };
}

export async function buildStory(input: BuildRequest): Promise<BuildStoryResult> {
  const prepared = await prepareAccountCorpus(input);

  const storyType = USE_CASES.find((item) => item.id === input.storyTypeId);
  if (!storyType) {
    throw new Error(`Unknown story type: ${input.storyTypeId}`);
  }

  const openai = new OpenAI({ apiKey: input.openaiApiKey });
  const model = input.openaiModel ?? "gpt-4o";

  const extractor = new QuoteExtractor(openai, model);
  const { quotes, claims } = await extractor.extractFromCalls(prepared.calls);

  const generator = new CaseStudyGenerator(openai, model);
  const [artifact] = await generator.generateAll(
    [storyType],
    prepared.calls,
    prepared.mergedMarkdown,
    quotes,
    claims
  );

  const storyPath = path.join(
    os.homedir(),
    "Downloads",
    `${safeFileName(prepared.accountName)} - ${safeFileName(storyType.name)}.md`
  );
  await writeTextFile(storyPath, artifact.markdown);

  const quotesCsv = renderQuotesCsv(quotes);
  const quotesCsvPath = path.join(
    os.homedir(),
    "Downloads",
    `${safeFileName(prepared.accountName)} - ${safeFileName(storyType.name)} - Quotes.csv`
  );
  await writeTextFile(quotesCsvPath, quotesCsv);

  return {
    accountName: prepared.accountName,
    accountId: prepared.accountId,
    storyType: { id: storyType.id, name: storyType.name },
    callsFetched: prepared.callsFetched,
    callsAfterDedupe: prepared.callsAfterDedupe,
    duplicatesRemoved: prepared.duplicatesRemoved,
    markdownDownloadsPath: prepared.markdownDownloadsPath,
    storyDownloadsPath: storyPath,
    quotesCsvDownloadsPath: quotesCsvPath,
    output: prepared.output,
    storyMarkdown: artifact.markdown,
    quotesExtracted: quotes.length,
    claimsExtracted: claims.length,
    quoteCsvRows: quotes.length,
  };
}

async function prepareAccountCorpus(input: ExportRequest | BuildRequest): Promise<PreparedCorpus> {
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
  const markdownDownloadsPath = path.join(os.homedir(), "Downloads", `${safeFileName(accountName)}.md`);
  await writeTextFile(markdownDownloadsPath, mergedMarkdown);

  const outputBase = path.resolve(process.cwd(), "output-web");
  const [callPaths, mergedPath] = await Promise.all([
    writeCallMarkdownFiles(outputBase, calls),
    writeMergedMarkdownFile(outputBase, accountName, accountId, calls),
  ]);

  const dedupePath = path.resolve(outputBase, safeFileName(accountName), "dedupe", "duplicates.json");
  await writeJsonFile(dedupePath, {
    totalFetchedCalls: combined.length,
    dedupedCalls: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    duplicates: dedupe.duplicates,
  });

  return {
    accountName,
    accountId,
    calls,
    mergedMarkdown,
    callsFetched: combined.length,
    callsAfterDedupe: calls.length,
    duplicatesRemoved: dedupe.duplicates.length,
    markdownDownloadsPath,
    output: {
      callFiles: callPaths,
      mergedFile: mergedPath,
      dedupeReport: dedupePath,
    },
  };
}

function renderQuotesCsv(quotes: QuoteEvidence[]): string {
  const headers = ["speaker", "date", "call_time", "quote", "why_included"];
  const rows = quotes.map((quote) => [
    quote.speaker ?? "",
    formatDateOnly(quote.sourceCallDate),
    formatCallTimestamp(quote.sourceTimestampMs),
    quote.quote,
    quote.reason,
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function formatDateOnly(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toISOString().slice(0, 10);
}

function formatCallTimestamp(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function csvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  if (!/[",]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, "\"\"")}"`;
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
