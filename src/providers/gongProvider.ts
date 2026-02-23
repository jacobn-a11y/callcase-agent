import { createHash } from "node:crypto";
import { z } from "zod";
import {
  accountIdFromName,
  companyNameFromEmail,
  normalizeAccountName,
  parseCommaSeparated,
  uniqueAccountCandidates,
} from "./account-utils.js";
import type {
  CanonicalCall,
  CallProvider,
  DiscoveredAccount,
  ProviderFetchInput,
} from "../types/domain.js";

const GongFieldSchema = z.object({
  name: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const GongContextObjectSchema = z.object({
  objectType: z.string().optional(),
  fields: z.array(GongFieldSchema).optional(),
});

const GongContextSchema = z.object({
  system: z.string().optional(),
  objects: z.array(GongContextObjectSchema).optional(),
});

const GongPartySchema = z.object({
  id: z.string().optional(),
  speakerId: z.string().optional(),
  emailAddress: z.string().optional(),
  name: z.string().optional(),
  affiliation: z.enum(["INTERNAL", "EXTERNAL", "UNKNOWN"]).optional(),
  context: z.array(GongContextSchema).optional(),
});

const GongCallSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  duration: z.number().optional(),
  started: z.string().optional(),
  url: z.string().optional(),
  parties: z.array(GongPartySchema).optional(),
  media: z
    .object({
      audioUrl: z.string().optional(),
      videoUrl: z.string().optional(),
    })
    .optional(),
});

const GongCallsResponseSchema = z.object({
  records: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
  calls: z.array(GongCallSchema).default([]),
});

const GongSentenceSchema = z.object({
  start: z.number().optional(),
  end: z.number().optional(),
  text: z.string().optional(),
});

const GongTranscriptEntrySchema = z.object({
  speakerId: z.string().optional(),
  sentences: z.array(GongSentenceSchema).optional(),
});

const GongCallTranscriptSchema = z.object({
  callId: z.string(),
  transcript: z.array(GongTranscriptEntrySchema).optional(),
});

const GongTranscriptResponseSchema = z.object({
  callTranscripts: z.array(GongCallTranscriptSchema).default([]),
});

interface GongProviderConfig {
  baseUrl: string;
  accessToken?: string;
  accessKey?: string;
  accessKeySecret?: string;
  internalDomains?: string;
}

interface ParsedGongTranscript {
  transcriptText: string;
  segments: Array<{
    speaker: string | null;
    text: string;
    startMs: number | null;
    endMs: number | null;
  }>;
}

interface FetchedGongCall {
  call: z.infer<typeof GongCallSchema>;
  transcript: ParsedGongTranscript | null;
  derivedAccountName: string;
}

export class GongProvider implements CallProvider {
  readonly name = "gong";

  private readonly internalDomains: Set<string>;

  constructor(private readonly config: GongProviderConfig) {
    this.internalDomains = new Set(parseCommaSeparated(config.internalDomains));
  }

  async fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]> {
    const fetched = await this.fetchAndDerive(input);
    const normalizedTarget = input.accountName
      ? normalizeAccountName(input.accountName)
      : null;

    const filtered = normalizedTarget
      ? fetched.filter((row) => normalizeAccountName(row.derivedAccountName) === normalizedTarget)
      : fetched;

    const maxCalls = input.maxCalls ?? filtered.length;

    return filtered
      .slice(0, maxCalls)
      .map(({ call, transcript, derivedAccountName }) => {
        const transcriptText = transcript?.transcriptText ?? "";
        const segments = transcript?.segments ?? [];

        return {
          provider: "gong",
          providerCallId: call.id,
          accountId: accountIdFromName(derivedAccountName),
          accountName: derivedAccountName,
          title: call.title?.trim() || `Call ${call.id}`,
          occurredAt: call.started ?? new Date().toISOString(),
          durationSeconds: call.duration ?? null,
          participants: (call.parties ?? []).map((party) => ({
            name: party.name ?? null,
            email: party.emailAddress?.toLowerCase() ?? null,
            role: party.affiliation === "INTERNAL" ? ("host" as const) : ("participant" as const),
          })),
          transcriptText,
          segments,
          metadata: {
            gongCallId: call.id,
            recordingUrl: call.media?.videoUrl ?? call.media?.audioUrl ?? call.url ?? null,
            transcriptHash: hashText(transcriptText),
            accountCandidates: extractAccountNamesFromCall(call, this.internalDomains),
          },
        } satisfies CanonicalCall;
      })
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async discoverAccounts(input: ProviderFetchInput): Promise<DiscoveredAccount[]> {
    const fetched = await this.fetchAndDerive({ ...input, maxCalls: input.maxCalls ?? 1200 });
    const counter = new Map<string, { name: string; count: number }>();

    for (const row of fetched) {
      const normalized = normalizeAccountName(row.derivedAccountName);
      const current = counter.get(normalized);
      if (!current) {
        counter.set(normalized, { name: row.derivedAccountName, count: 1 });
      } else {
        current.count += 1;
      }
    }

    return [...counter.entries()]
      .map(([normalizedName, meta]) => ({
        name: meta.name,
        normalizedName,
        source: "gong",
        callCount: meta.count,
      }))
      .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));
  }

  private async fetchAndDerive(input: ProviderFetchInput): Promise<FetchedGongCall[]> {
    const maxCalls = input.maxCalls ?? 500;
    const rows: FetchedGongCall[] = [];
    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const body: Record<string, unknown> = {};
      if (cursor) body.cursor = cursor;

      const filter: Record<string, string> = {};
      if (input.fromDate) filter.fromDateTime = toIso(input.fromDate, false);
      if (input.toDate) filter.toDateTime = toIso(input.toDate, true);
      if (Object.keys(filter).length > 0) body.filter = filter;

      const callsResponse = await fetch(this.endpoint("/v2/calls/extensive"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!callsResponse.ok) {
        const bodyText = await callsResponse.text();
        throw new Error(`Gong calls fetch failed (${callsResponse.status}): ${bodyText}`);
      }

      const payload = GongCallsResponseSchema.parse(await callsResponse.json());
      const transcripts = await this.fetchTranscripts(payload.calls);

      for (const call of payload.calls) {
        const parsedTranscript = transcripts.get(call.id);
        if (!parsedTranscript || !parsedTranscript.transcriptText.trim()) {
          continue;
        }

        rows.push({
          call,
          transcript: parsedTranscript,
          derivedAccountName: resolveCallAccountName(call, this.internalDomains),
        });

        if (rows.length >= maxCalls) {
          done = true;
          break;
        }
      }

      if (!payload.records?.cursor || done) {
        break;
      }
      cursor = payload.records.cursor;
    }

    return rows;
  }

  private async fetchTranscripts(
    calls: Array<z.infer<typeof GongCallSchema>>
  ): Promise<Map<string, ParsedGongTranscript>> {
    const result = new Map<string, ParsedGongTranscript>();
    const speakerLookupByCall = new Map<string, Map<string, string>>();

    for (const call of calls) {
      const speakerMap = new Map<string, string>();
      for (const party of call.parties ?? []) {
        const speakerName = party.name?.trim() || party.emailAddress?.trim() || null;
        if (!speakerName) continue;
        if (party.speakerId) speakerMap.set(party.speakerId, speakerName);
        if (party.id) speakerMap.set(party.id, speakerName);
      }
      speakerLookupByCall.set(call.id, speakerMap);
    }

    for (const callIdChunk of chunk(calls.map((call) => call.id), 80)) {
      if (callIdChunk.length === 0) continue;

      const response = await fetch(this.endpoint("/v2/calls/transcript"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          filter: {
            callIds: callIdChunk,
          },
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Gong transcript fetch failed (${response.status}): ${bodyText}`);
      }

      const payload = GongTranscriptResponseSchema.parse(await response.json());

      for (const callTranscript of payload.callTranscripts) {
        const speakerMap = speakerLookupByCall.get(callTranscript.callId) ?? new Map();
        const parsed = parseGongTranscript(callTranscript.transcript ?? [], speakerMap);
        if (parsed.transcriptText.trim()) {
          result.set(callTranscript.callId, parsed);
        }
      }
    }

    return result;
  }

  private endpoint(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.buildAuthorization(),
      "Content-Type": "application/json",
    };
  }

  private buildAuthorization(): string {
    if (this.config.accessToken) {
      return `Bearer ${this.config.accessToken}`;
    }

    if (this.config.accessKey && this.config.accessKeySecret) {
      const encoded = Buffer.from(`${this.config.accessKey}:${this.config.accessKeySecret}`).toString("base64");
      return `Basic ${encoded}`;
    }

    throw new Error(
      "Gong credentials missing: provide GONG_ACCESS_TOKEN or GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET"
    );
  }
}

function parseGongTranscript(
  entries: Array<z.infer<typeof GongTranscriptEntrySchema>>,
  speakerLookup: Map<string, string>
): ParsedGongTranscript {
  const lines: string[] = [];
  const segments: ParsedGongTranscript["segments"] = [];

  for (const entry of entries) {
    const speaker = entry.speakerId ? speakerLookup.get(entry.speakerId) ?? `Speaker ${entry.speakerId}` : null;

    for (const sentence of entry.sentences ?? []) {
      const text = sentence.text?.trim();
      if (!text) continue;

      lines.push(speaker ? `${speaker}: ${text}` : text);
      segments.push({
        speaker,
        text,
        startMs: normalizeTimestamp(sentence.start),
        endMs: normalizeTimestamp(sentence.end),
      });
    }
  }

  return {
    transcriptText: lines.join("\n"),
    segments,
  };
}

function resolveCallAccountName(
  call: z.infer<typeof GongCallSchema>,
  internalDomains: Set<string>
): string {
  const candidates = extractAccountNamesFromCall(call, internalDomains);
  return candidates[0] ?? "Unknown Account";
}

function extractAccountNamesFromCall(
  call: z.infer<typeof GongCallSchema>,
  internalDomains: Set<string>
): string[] {
  const values: Array<string | null> = [];

  for (const party of call.parties ?? []) {
    for (const ctx of party.context ?? []) {
      for (const obj of ctx.objects ?? []) {
        for (const field of obj.fields ?? []) {
          if (!field.name || typeof field.value !== "string") continue;
          if (/account|company|organization|org/i.test(field.name)) {
            values.push(field.value);
          }
        }
      }
    }

    const domainCompany = party.emailAddress
      ? companyNameFromEmail(party.emailAddress)
      : null;

    if (domainCompany) {
      const domain = party.emailAddress!.split("@")[1]?.toLowerCase();
      if (domain && !internalDomains.has(domain)) {
        values.push(domainCompany);
      }
    }
  }

  return uniqueAccountCandidates(values);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function toIso(value: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return date.toISOString();
}

function normalizeTimestamp(raw?: number): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw) || raw <= 0) {
    return null;
  }
  return Math.floor(raw);
}

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
