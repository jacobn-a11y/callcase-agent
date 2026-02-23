import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  MERGE_API_KEY: z.string().optional(),
  MERGE_ACCOUNT_TOKEN: z.string().optional(),
  MERGE_BASE_URL: z.string().url().default("https://api.merge.dev/api/filestorage/v1"),
  OUTPUT_DIR: z.string().default("output"),
  PROVIDER: z.enum(["merge", "json"]).default("merge"),
  JSON_INPUT_FILE: z.string().optional(),
});

export type AgentEnv = z.infer<typeof EnvSchema>;

export function loadAgentEnv(overrides: Partial<Record<keyof AgentEnv, string>> = {}): AgentEnv {
  const parsed = EnvSchema.safeParse({
    OPENAI_API_KEY: overrides.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    OPENAI_MODEL: overrides.OPENAI_MODEL ?? process.env.OPENAI_MODEL,
    MERGE_API_KEY: overrides.MERGE_API_KEY ?? process.env.MERGE_API_KEY,
    MERGE_ACCOUNT_TOKEN: overrides.MERGE_ACCOUNT_TOKEN ?? process.env.MERGE_ACCOUNT_TOKEN,
    MERGE_BASE_URL: overrides.MERGE_BASE_URL ?? process.env.MERGE_BASE_URL,
    OUTPUT_DIR: overrides.OUTPUT_DIR ?? process.env.OUTPUT_DIR,
    PROVIDER: overrides.PROVIDER ?? process.env.PROVIDER,
    JSON_INPUT_FILE: overrides.JSON_INPUT_FILE ?? process.env.JSON_INPUT_FILE,
  });

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${errors.join("\n")}`);
  }

  return parsed.data;
}
