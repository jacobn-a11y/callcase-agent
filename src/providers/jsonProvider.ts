import { readFile } from "node:fs/promises";
import { z } from "zod";
import { normalizeAccountName } from "./account-utils.js";
import type {
  CanonicalCall,
  CallProvider,
  DiscoveredAccount,
  ProviderFetchInput,
} from "../types/domain.js";

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
    const parsed = await this.load();
    const targetAccountName = input.accountName ? normalizeAccountName(input.accountName) : null;

    return parsed.calls
      .filter((call) => (input.accountId ? call.accountId === input.accountId : true))
      .filter((call) =>
        targetAccountName ? normalizeAccountName(call.accountName) === targetAccountName : true
      )
      .filter((call) => (input.fromDate ? call.occurredAt >= input.fromDate : true))
      .filter((call) => (input.toDate ? call.occurredAt <= input.toDate : true))
      .slice(0, input.maxCalls ?? parsed.calls.length)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async discoverAccounts(): Promise<DiscoveredAccount[]> {
    const parsed = await this.load();
    const counts = new Map<string, { name: string; callCount: number }>();

    for (const call of parsed.calls) {
      const normalizedName = normalizeAccountName(call.accountName);
      const current = counts.get(normalizedName);
      if (!current) {
        counts.set(normalizedName, { name: call.accountName, callCount: 1 });
      } else {
        current.callCount += 1;
      }
    }

    return [...counts.entries()]
      .map(([normalizedName, value]) => ({
        name: value.name,
        normalizedName,
        source: "json",
        callCount: value.callCount,
      }))
      .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));
  }

  private async load(): Promise<z.infer<typeof CallsFileSchema>> {
    const raw = await readFile(this.filePath, "utf8");
    return CallsFileSchema.parse(JSON.parse(raw));
  }
}
