import express from "express";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";

import { USE_CASES } from "../prompts/useCases.js";
import { dedupeCalls } from "../pipeline/dedupe.js";
import {
  renderMergedMarkdown,
  writeCallMarkdownFiles,
  writeMergedMarkdownFile,
} from "../pipeline/markdown.js";
import { QuoteExtractor } from "../pipeline/quotes.js";
import { CaseStudyGenerator } from "../pipeline/caseStudies.js";
import { accountIdFromName } from "../providers/account-utils.js";
import { GongProvider } from "../providers/gongProvider.js";
import { GrainProvider } from "../providers/grainProvider.js";
import { matchSharedAccounts } from "./account-matcher.js";
import { writeJsonFile, writeTextFile } from "../utils/fs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "public");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

const BaseSchema = z
  .object({
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().optional(),

    gongBaseUrl: z.string().url().default("https://api.gong.io"),
    gongAccessToken: z.string().optional(),
    gongAccessKey: z.string().optional(),
    gongAccessKeySecret: z.string().optional(),

    grainBaseUrl: z.string().url().default("https://grain.com/_/public-api"),
    grainApiToken: z.string().optional(),

    internalEmailDomains: z.string().optional(),

    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    maxCalls: z.coerce.number().int().positive().max(5000).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.gongAccessToken) ||
      (Boolean(value.gongAccessKey) && Boolean(value.gongAccessKeySecret)),
    {
      message: "Provide Gong credentials: GONG_ACCESS_TOKEN or GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET",
      path: ["gongAccessToken"],
    }
  )
  .refine((value) => Boolean(value.grainApiToken), {
    message: "GRAIN_API_TOKEN is required",
    path: ["grainApiToken"],
  });

const DiscoverRequestSchema = BaseSchema;

const SelectedAccountSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  gongName: z.string().min(1),
  grainName: z.string().min(1),
  confidence: z.number().optional(),
});

const BuildRequestSchema = BaseSchema.safeExtend({
  openaiApiKey: z.string().min(1, "OpenAI API key is required"),
  storyTypeId: z.string().min(1),
  selectedAccount: SelectedAccountSchema,
});

app.get("/api/story-types", (_req, res) => {
  res.json({
    storyTypes: USE_CASES.map((storyType) => ({
      id: storyType.id,
      name: storyType.name,
      stage: storyType.stage,
      focus: storyType.focus,
    })),
  });
});

app.post("/api/accounts/discover", async (req, res) => {
  const parsed = DiscoverRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
    return;
  }

  const input = parsed.data;

  try {
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

    res.json({
      accounts: sharedAccounts,
      counts: {
        gongAccounts: gongAccounts.length,
        grainAccounts: grainAccounts.length,
        sharedAccounts: sharedAccounts.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
});

app.post("/api/stories/build", async (req, res) => {
  const parsed = BuildRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
    return;
  }

  const input = parsed.data;

  try {
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
    const [artifact] = await generator.generateAll(
      [storyType],
      calls,
      mergedMarkdown,
      quotes,
      claims
    );

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

    res.json({
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
    });
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
});

app.use((_req, res) => {
  res.sendFile(path.resolve(publicDir, "index.html"));
});

const PORT = Number(process.env.PORT ?? 3080);
app.listen(PORT, () => {
  console.log(`CallCase webapp running at http://localhost:${PORT}`);
});

function createProviders(input: z.infer<typeof BaseSchema>): {
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

function safeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
