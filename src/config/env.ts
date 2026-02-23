import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  PROVIDER: z.enum(["merge", "json", "gong", "grain", "gong_grain"]).default("gong_grain"),

  OUTPUT_DIR: z.string().default("output"),

  // Merge
  MERGE_API_KEY: z.string().optional(),
  MERGE_ACCOUNT_TOKEN: z.string().optional(),
  MERGE_BASE_URL: z.string().url().default("https://api.merge.dev/api/filestorage/v1"),
  MERGE_ACCOUNT_NAME: z.string().optional(),
  MERGE_ACCOUNT_ID: z.string().optional(),

  // Gong
  GONG_BASE_URL: z.string().url().default("https://api.gong.io"),
  GONG_ACCESS_TOKEN: z.string().optional(),
  GONG_ACCESS_KEY: z.string().optional(),
  GONG_ACCESS_KEY_SECRET: z.string().optional(),

  // Grain
  GRAIN_BASE_URL: z.string().url().default("https://grain.com/_/public-api"),
  GRAIN_API_TOKEN: z.string().optional(),

  // Shared
  INTERNAL_EMAIL_DOMAINS: z.string().optional(),

  // JSON fallback
  JSON_INPUT_FILE: z.string().optional(),
});

export type AgentEnv = z.infer<typeof EnvSchema>;

export function loadAgentEnv(overrides: Partial<Record<keyof AgentEnv, string>> = {}): AgentEnv {
  const parsed = EnvSchema.safeParse({
    OPENAI_API_KEY: overrides.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    OPENAI_MODEL: overrides.OPENAI_MODEL ?? process.env.OPENAI_MODEL,

    PROVIDER: overrides.PROVIDER ?? process.env.PROVIDER,
    OUTPUT_DIR: overrides.OUTPUT_DIR ?? process.env.OUTPUT_DIR,

    MERGE_API_KEY: overrides.MERGE_API_KEY ?? process.env.MERGE_API_KEY,
    MERGE_ACCOUNT_TOKEN: overrides.MERGE_ACCOUNT_TOKEN ?? process.env.MERGE_ACCOUNT_TOKEN,
    MERGE_BASE_URL: overrides.MERGE_BASE_URL ?? process.env.MERGE_BASE_URL,
    MERGE_ACCOUNT_NAME: overrides.MERGE_ACCOUNT_NAME ?? process.env.MERGE_ACCOUNT_NAME,
    MERGE_ACCOUNT_ID: overrides.MERGE_ACCOUNT_ID ?? process.env.MERGE_ACCOUNT_ID,

    GONG_BASE_URL: overrides.GONG_BASE_URL ?? process.env.GONG_BASE_URL,
    GONG_ACCESS_TOKEN: overrides.GONG_ACCESS_TOKEN ?? process.env.GONG_ACCESS_TOKEN,
    GONG_ACCESS_KEY: overrides.GONG_ACCESS_KEY ?? process.env.GONG_ACCESS_KEY,
    GONG_ACCESS_KEY_SECRET:
      overrides.GONG_ACCESS_KEY_SECRET ?? process.env.GONG_ACCESS_KEY_SECRET,

    GRAIN_BASE_URL: overrides.GRAIN_BASE_URL ?? process.env.GRAIN_BASE_URL,
    GRAIN_API_TOKEN: overrides.GRAIN_API_TOKEN ?? process.env.GRAIN_API_TOKEN,

    INTERNAL_EMAIL_DOMAINS:
      overrides.INTERNAL_EMAIL_DOMAINS ?? process.env.INTERNAL_EMAIL_DOMAINS,

    JSON_INPUT_FILE: overrides.JSON_INPUT_FILE ?? process.env.JSON_INPUT_FILE,
  });

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${errors.join("\n")}`);
  }

  return parsed.data;
}
