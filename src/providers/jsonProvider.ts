import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { CanonicalCall, CallProvider, ProviderFetchInput } from "../types/domain.js";

const SegmentSchema = z.object({
  speaker: z.string().nullable().default(null),
  text: z.string().min(1),
  startMs: z.number().nullable().default(null),
  endMs: z.number().nullable().default(null),
});

const ParticipantSchema = z.object({
  name: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  role: z.enum(["host", "participant"]).default("participant"),
});

const CallSchema = z.object({
  provider: z.string(),
  providerCallId: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  title: z.string(),
  occurredAt: z.string(),
  durationSeconds: z.number().nullable().default(null),
  participants: z.array(ParticipantSchema).default([]),
  transcriptText: z.string(),
  segments: z.array(SegmentSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CallsFileSchema = z.object({
  calls: z.array(CallSchema),
});

export class JsonProvider implements CallProvider {
  readonly name = "json";

  constructor(private readonly filePath: string) {}

  async fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]> {
    const raw = await readFile(this.filePath, "utf8");
    const parsed = CallsFileSchema.parse(JSON.parse(raw));

    return parsed.calls
      .filter((call) => (input.accountId ? call.accountId === input.accountId : true))
      .filter((call) => (input.fromDate ? call.occurredAt >= input.fromDate : true))
      .filter((call) => (input.toDate ? call.occurredAt <= input.toDate : true))
      .slice(0, input.maxCalls ?? parsed.calls.length)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
}
