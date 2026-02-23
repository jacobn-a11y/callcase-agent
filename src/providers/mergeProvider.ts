import { z } from "zod";
import {
  accountIdFromName,
  normalizeAccountName,
} from "./account-utils.js";
import type {
  CanonicalCall,
  CallProvider,
  DiscoveredAccount,
  ProviderFetchInput,
} from "../types/domain.js";

const MergeParticipantSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  is_organizer: z.boolean().nullable().optional(),
});

const MergeRecordingSchema = z.object({
  id: z.string(),
  remote_id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  start_time: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  participants: z.array(MergeParticipantSchema).nullable().optional(),
});

const MergePageSchema = z.object({
  next: z.string().nullable(),
  results: z.array(MergeRecordingSchema),
});

interface MergeProviderConfig {
  apiKey: string;
  accountToken: string;
  baseUrl: string;
  accountName: string;
  fallbackAccountId: string;
}

export class MergeProvider implements CallProvider {
  readonly name = "merge";

  constructor(private readonly config: MergeProviderConfig) {}

  async fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]> {
    const targetAccountName = input.accountName?.trim();
    if (targetAccountName) {
      const wanted = normalizeAccountName(targetAccountName);
      const own = normalizeAccountName(this.config.accountName);
      if (wanted !== own) {
        return [];
      }
    }

    const maxCalls = input.maxCalls ?? 500;
    const allCalls: CanonicalCall[] = [];

    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const url = new URL(`${this.config.baseUrl}/recordings`);
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "X-Account-Token": this.config.accountToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Merge fetch failed (${response.status}): ${body}`);
      }

      const parsed = MergePageSchema.parse(await response.json());

      for (const rec of parsed.results) {
        if (!rec.transcript || rec.transcript.trim().length === 0) continue;

        const callDate = rec.start_time ?? new Date().toISOString();
        if (input.fromDate && callDate < input.fromDate) continue;
        if (input.toDate && callDate > input.toDate) continue;

        const providerCallId = rec.remote_id ?? rec.id;
        const participants = (rec.participants ?? []).map((p) => ({
          name: p.name ?? null,
          email: p.email ?? null,
          role: p.is_organizer ? ("host" as const) : ("participant" as const),
        }));

        const transcriptText = rec.transcript.trim();
        const segments = transcriptText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => ({
            speaker: null,
            text: line,
            startMs: null,
            endMs: null,
          }));

        allCalls.push({
          provider: "merge",
          providerCallId,
          accountId: input.accountId ?? this.config.fallbackAccountId,
          accountName: this.config.accountName,
          title: rec.name?.trim() || `Call ${providerCallId}`,
          occurredAt: callDate,
          durationSeconds: rec.duration ?? null,
          participants,
          transcriptText,
          segments,
          metadata: {
            mergeRecordingId: rec.id,
            mergeRemoteId: rec.remote_id ?? null,
          },
        });

        if (allCalls.length >= maxCalls) {
          done = true;
          break;
        }
      }

      if (!parsed.next || done) {
        break;
      }
      cursor = parsed.next;
    }

    return allCalls.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async discoverAccounts(): Promise<DiscoveredAccount[]> {
    return [
      {
        name: this.config.accountName,
        normalizedName: normalizeAccountName(this.config.accountName),
        source: "merge",
        callCount: 0,
      },
    ];
  }
}

export function buildMergeAccountId(accountName: string): string {
  return accountIdFromName(accountName);
}
