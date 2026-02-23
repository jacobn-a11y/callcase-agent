import { z } from "zod";

export const BaseRequestSchema = z
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
      message:
        "Provide Gong credentials: GONG_ACCESS_TOKEN or GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET",
      path: ["gongAccessToken"],
    }
  )
  .refine((value) => Boolean(value.grainApiToken), {
    message: "GRAIN_API_TOKEN is required",
    path: ["grainApiToken"],
  });

export const DiscoverRequestSchema = BaseRequestSchema;

export const SelectedAccountSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  gongName: z.string().min(1),
  grainName: z.string().min(1),
  confidence: z.number().optional(),
});

export const BuildRequestSchema = BaseRequestSchema.safeExtend({
  openaiApiKey: z.string().min(1, "OpenAI API key is required"),
  storyTypeId: z.string().min(1),
  selectedAccount: SelectedAccountSchema,
});

export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;
export type BuildRequest = z.infer<typeof BuildRequestSchema>;
