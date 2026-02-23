import OpenAI from "openai";
import path from "node:path";
import { loadAgentEnv } from "../config/env.js";
import { USE_CASES } from "../prompts/useCases.js";
import { createProvider } from "../providers/factory.js";
import { CaseStudyGenerator } from "../pipeline/caseStudies.js";
import {
  renderMergedMarkdown,
  writeCallMarkdownFiles,
  writeMergedMarkdownFile,
} from "../pipeline/markdown.js";
import { QuoteExtractor } from "../pipeline/quotes.js";
import type { AgentRunResult } from "../types/domain.js";
import { slugify, writeJsonFile, writeTextFile } from "../utils/fs.js";

export interface AgentRunInput {
  accountId: string;
  accountName: string;
  fromDate?: string;
  toDate?: string;
  maxCalls?: number;
  outputDir?: string;
}

export async function runCaseStudyAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const env = loadAgentEnv({
    OUTPUT_DIR: input.outputDir,
  });

  const provider = createProvider(env, input.accountName, input.accountId);
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const calls = await provider.fetchCalls({
    accountId: input.accountId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    maxCalls: input.maxCalls,
  });

  if (calls.length === 0) {
    throw new Error("No calls with transcripts found for provided filters.");
  }

  const callsMarkdownPaths = await writeCallMarkdownFiles(env.OUTPUT_DIR, calls);
  const mergedMarkdownPath = await writeMergedMarkdownFile(
    env.OUTPUT_DIR,
    input.accountName,
    input.accountId,
    calls
  );

  const mergedMarkdown = renderMergedMarkdown(input.accountName, input.accountId, calls);
  const extractor = new QuoteExtractor(openai, env.OPENAI_MODEL);
  const { quotes, claims } = await extractor.extractFromCalls(calls);

  const accountSlug = slugify(input.accountName || input.accountId);
  const quotesPath = path.resolve(env.OUTPUT_DIR, accountSlug, "quotes", "quotes.json");
  const claimsPath = path.resolve(env.OUTPUT_DIR, accountSlug, "claims", "claims.json");
  await writeJsonFile(quotesPath, { accountId: input.accountId, quotes });
  await writeJsonFile(claimsPath, { accountId: input.accountId, claims });

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
    accountId: input.accountId,
    accountName: input.accountName,
    provider: provider.name,
    callsProcessed: calls.length,
    callsMarkdownPaths,
    mergedMarkdownPath,
    quotesPath,
    claimsPath,
    caseStudyPaths,
  });

  return {
    accountId: input.accountId,
    accountName: input.accountName,
    callsProcessed: calls.length,
    callsMarkdownPaths,
    mergedMarkdownPath,
    quotesPath,
    claimsPath,
    caseStudyPaths,
  };
}
