import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { normalizeAccountName } from "../providers/account-utils.js";
import {
  asErrorMessage,
  buildStory,
  discoverSharedAccounts,
  listStoryTypes,
} from "../services/caseflow.js";
import {
  BuildRequestSchema,
  DiscoverRequestSchema,
  SelectedAccountSchema,
} from "../services/contracts.js";
import type { SharedAccountOption } from "../webapp/account-matcher.js";

const server = new McpServer({
  name: "callcase-agent",
  version: "1.0.0",
  websiteUrl: "https://github.com/jacobn-a11y/callcase-agent",
});

const CommonInputShape = {
  openaiApiKey: z
    .string()
    .optional()
    .describe("OpenAI API key (optional for discovery, required for story generation)."),
  openaiModel: z.string().optional().describe("OpenAI model, defaults to gpt-4o."),
  gongBaseUrl: z.string().optional().describe("Gong API base URL."),
  gongAccessToken: z.string().optional().describe("Gong bearer token."),
  gongAccessKey: z.string().optional().describe("Gong API access key."),
  gongAccessKeySecret: z.string().optional().describe("Gong API access key secret."),
  grainBaseUrl: z.string().optional().describe("Grain API base URL."),
  grainApiToken: z.string().optional().describe("Grain API token."),
  internalEmailDomains: z
    .string()
    .optional()
    .describe("Comma-separated internal domains to exclude from account detection."),
  fromDate: z.string().optional().describe("Lower date bound (YYYY-MM-DD or ISO datetime)."),
  toDate: z.string().optional().describe("Upper date bound (YYYY-MM-DD or ISO datetime)."),
  maxCalls: z.number().int().positive().max(5000).optional().describe("Max calls to process."),
} as const;

const BuildToolSchema = z
  .object({
    ...CommonInputShape,
    storyTypeId: z.string().min(1).describe("Use one value from list_story_types."),
    accountDisplayName: z
      .string()
      .optional()
      .describe("Account/company name from discover_shared_accounts."),
    selectedAccount: SelectedAccountSchema.optional().describe(
      "Optional full selected account object from discover_shared_accounts."
    ),
  })
  .superRefine((value, ctx) => {
    if (!value.accountDisplayName && !value.selectedAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["accountDisplayName"],
        message: "Provide accountDisplayName or selectedAccount.",
      });
    }
  });

server.registerTool(
  "list_story_types",
  {
    title: "List Story Types",
    description: "Return all case-study story types and IDs supported by this system.",
  },
  async () => {
    const storyTypes = listStoryTypes();
    return {
      content: [
        {
          type: "text",
          text: renderStoryTypes(storyTypes),
        },
      ],
      structuredContent: { storyTypes },
    };
  }
);

server.registerTool(
  "discover_shared_accounts",
  {
    title: "Discover Shared Accounts",
    description:
      "Fetch account/company names from Gong and Grain, dedupe and match shared accounts.",
    inputSchema: CommonInputShape,
  },
  async (args) => {
    try {
      const parsed = DiscoverRequestSchema.parse(withEnvDefaults(args));
      const result = await discoverSharedAccounts(parsed);

      return {
        content: [
          {
            type: "text",
            text: renderAccountsResult(result),
          },
        ],
        structuredContent: toStructuredContent(result),
      };
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "build_story_for_account",
  {
    title: "Build Account Story",
    description:
      "Build one story type for a shared account, write markdown files, and return the generated case-study markdown.",
    inputSchema: BuildToolSchema.shape,
  },
  async (args) => {
    try {
      const parsed = BuildToolSchema.parse(withEnvDefaults(args));

      const selectedAccount =
        parsed.selectedAccount ??
        (await resolveSelectedAccount(parsed.accountDisplayName!, parsed));

      const buildInput = BuildRequestSchema.parse({
        ...parsed,
        selectedAccount,
      });

      const result = await buildStory(buildInput);

      return {
        content: [
          {
            type: "text",
            text: renderBuildResult(result),
          },
        ],
        structuredContent: toStructuredContent(result),
      };
    } catch (error) {
      return toolError(error);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error) => {
  console.error(asErrorMessage(error));
  process.exit(1);
});

function withEnvDefaults(input: Record<string, unknown>) {
  return {
    ...input,
    openaiApiKey: pickString(input.openaiApiKey, process.env.OPENAI_API_KEY),
    openaiModel: pickString(input.openaiModel, process.env.OPENAI_MODEL),
    gongBaseUrl: pickString(input.gongBaseUrl, process.env.GONG_BASE_URL, "https://api.gong.io"),
    gongAccessToken: pickString(input.gongAccessToken, process.env.GONG_ACCESS_TOKEN),
    gongAccessKey: pickString(input.gongAccessKey, process.env.GONG_ACCESS_KEY),
    gongAccessKeySecret: pickString(input.gongAccessKeySecret, process.env.GONG_ACCESS_KEY_SECRET),
    grainBaseUrl: pickString(
      input.grainBaseUrl,
      process.env.GRAIN_BASE_URL,
      "https://grain.com/_/public-api"
    ),
    grainApiToken: pickString(input.grainApiToken, process.env.GRAIN_API_TOKEN),
    internalEmailDomains: pickString(input.internalEmailDomains, process.env.INTERNAL_EMAIL_DOMAINS),
    fromDate: pickString(input.fromDate),
    toDate: pickString(input.toDate),
    maxCalls: pickNumber(input.maxCalls),
  };
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

async function resolveSelectedAccount(
  accountDisplayName: string,
  discoverInputRaw: Record<string, unknown>
): Promise<z.infer<typeof SelectedAccountSchema>> {
  const discoverInput = DiscoverRequestSchema.parse(withEnvDefaults(discoverInputRaw));
  const discovered = await discoverSharedAccounts(discoverInput);
  if (discovered.accounts.length === 0) {
    throw new Error("No shared accounts found across Gong and Grain.");
  }

  const normalizedRequested = normalizeAccountName(accountDisplayName);
  const exact = discovered.accounts.find((account) => {
    return (
      normalizeAccountName(account.displayName) === normalizedRequested ||
      normalizeAccountName(account.gongName) === normalizedRequested ||
      normalizeAccountName(account.grainName) === normalizedRequested
    );
  });

  if (exact) {
    return toSelectedAccount(exact);
  }

  const ranked = discovered.accounts
    .map((account) => ({
      account,
      score: bestNameSimilarity(account, normalizedRequested),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= 0.82) {
    return toSelectedAccount(best.account);
  }

  const suggestions = ranked
    .slice(0, 5)
    .map((item) => `${item.account.displayName} (${item.account.matchReason}, ${item.score.toFixed(2)})`)
    .join(", ");

  throw new Error(
    `No shared account match found for "${accountDisplayName}". Try one of: ${suggestions || "none"}.`
  );
}

function toSelectedAccount(account: SharedAccountOption): z.infer<typeof SelectedAccountSchema> {
  return {
    id: account.id,
    displayName: account.displayName,
    gongName: account.gongName,
    grainName: account.grainName,
    confidence: account.confidence,
  };
}

function bestNameSimilarity(account: SharedAccountOption, normalizedRequested: string): number {
  return Math.max(
    tokenSimilarity(normalizeAccountName(account.displayName), normalizedRequested),
    tokenSimilarity(normalizeAccountName(account.gongName), normalizedRequested),
    tokenSimilarity(normalizeAccountName(account.grainName), normalizedRequested)
  );
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(" ").filter((token) => token.length > 1));
  const tokensB = new Set(b.split(" ").filter((token) => token.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(tokensA.size, tokensB.size);
}

function renderStoryTypes(
  storyTypes: ReturnType<typeof listStoryTypes>
): string {
  return [
    `Story types available: ${storyTypes.length}`,
    ...storyTypes.map((item) => {
      return `- ${item.id}: ${item.name} [${item.stage}] | objective=${item.spec.objective} | minQuotes=${item.spec.minimumQuoteCount} | minClaims=${item.spec.minimumClaimCount}`;
    }),
  ].join("\n");
}

function renderAccountsResult(result: Awaited<ReturnType<typeof discoverSharedAccounts>>): string {
  const header = [
    `Shared accounts found: ${result.counts.sharedAccounts}`,
    `Gong accounts discovered: ${result.counts.gongAccounts}`,
    `Grain accounts discovered: ${result.counts.grainAccounts}`,
  ];

  const rows = result.accounts.slice(0, 50).map((account) => {
    return `- ${account.displayName} | gong=${account.gongCallCount}, grain=${account.grainCallCount}, match=${account.matchReason}, confidence=${account.confidence.toFixed(2)}`;
  });

  return [...header, ...rows].join("\n");
}

function renderBuildResult(result: Awaited<ReturnType<typeof buildStory>>): string {
  const lines = [
    `Built story "${result.storyType.name}" for ${result.accountName}.`,
    `Calls fetched: ${result.callsFetched}`,
    `Calls after dedupe: ${result.callsAfterDedupe}`,
    `Duplicates removed: ${result.duplicatesRemoved}`,
    `Quotes extracted: ${result.quotesExtracted}`,
    `Claims extracted: ${result.claimsExtracted}`,
    `Merged markdown file: ${result.markdownDownloadsPath}`,
    `Story markdown file: ${result.storyDownloadsPath}`,
    "",
    "Generated story markdown:",
    result.storyMarkdown,
  ];

  return lines.join("\n");
}

function toolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `Error: ${asErrorMessage(error)}`,
      },
    ],
  };
}

function toStructuredContent(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
