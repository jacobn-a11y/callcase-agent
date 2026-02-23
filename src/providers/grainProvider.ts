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

const GrainParticipantSchema = z.object({
  id: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  company: z.string().optional(),
  is_host: z.boolean().optional(),
  is_organizer: z.boolean().optional(),
});

const GrainTranscriptSentenceSchema = z.object({
  speaker: z.string().optional(),
  speaker_email: z.string().optional(),
  text: z.string().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
});

const GrainTranscriptSchema = z.object({
  text: z.string().optional(),
  sentences: z.array(GrainTranscriptSentenceSchema).optional(),
  segments: z.array(GrainTranscriptSentenceSchema).optional(),
});

const GrainRecordingSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
  duration: z.number().optional(),
  started_at: z.string().optional(),
  participants: z.array(GrainParticipantSchema).optional(),
  transcript: GrainTranscriptSchema.optional(),
  account: z.union([z.string(), z.object({ name: z.string().optional() })]).optional(),
  company: z.union([z.string(), z.object({ name: z.string().optional() })]).optional(),
  companies: z
    .array(z.union([z.string(), z.object({ name: z.string().optional() })]))
    .optional(),
});

const GrainListResponseSchema = z.object({
  recordings: z.array(GrainRecordingSchema).default([]),
  cursor: z.string().optional(),
  has_more: z.boolean().optional(),
});

const GrainDetailResponseSchema = z.object({
  recording: GrainRecordingSchema,
});

interface GrainProviderConfig {
  apiToken: string;
  baseUrl: string;
  internalDomains?: string;
}

interface FetchedGrainCall {
  call: z.infer<typeof GrainRecordingSchema>;
  transcriptText: string;
  segments: CanonicalCall["segments"];
  derivedAccountName: string;
}

export class GrainProvider implements CallProvider {
  readonly name = "grain";

  private readonly internalDomains: Set<string>;

  constructor(private readonly config: GrainProviderConfig) {
    this.internalDomains = new Set(parseCommaSeparated(config.internalDomains));
  }

  async fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]> {
    const rows = await this.fetchAndDerive(input);
    const normalizedTarget = input.accountName
      ? normalizeAccountName(input.accountName)
      : null;

    const filtered = normalizedTarget
      ? rows.filter((row) => normalizeAccountName(row.derivedAccountName) === normalizedTarget)
      : rows;

    const maxCalls = input.maxCalls ?? filtered.length;

    return filtered
      .slice(0, maxCalls)
      .map((row) => ({
        provider: "grain",
        providerCallId: row.call.id,
        accountId: accountIdFromName(row.derivedAccountName),
        accountName: row.derivedAccountName,
        title: row.call.title?.trim() || `Call ${row.call.id}`,
        occurredAt: row.call.started_at ?? new Date().toISOString(),
        durationSeconds: row.call.duration ?? null,
        participants: (row.call.participants ?? []).map((p) => ({
          name: p.name ?? null,
          email: p.email?.toLowerCase() ?? null,
          role: p.is_host ?? p.is_organizer ? ("host" as const) : ("participant" as const),
        })),
        transcriptText: row.transcriptText,
        segments: row.segments,
        metadata: {
          grainRecordingId: row.call.id,
          recordingUrl: row.call.url ?? null,
          transcriptHash: hashText(row.transcriptText),
          accountCandidates: extractAccountNamesFromRecording(row.call, this.internalDomains),
        },
      }))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async discoverAccounts(input: ProviderFetchInput): Promise<DiscoveredAccount[]> {
    const rows = await this.fetchAndDerive({ ...input, maxCalls: input.maxCalls ?? 1200 });
    const counter = new Map<string, { name: string; count: number }>();

    for (const row of rows) {
      const normalized = normalizeAccountName(row.derivedAccountName);
      const current = counter.get(normalized);
      if (!current) {
        counter.set(normalized, { name: row.derivedAccountName, count: 1 });
      } else {
        current.count += 1;
      }
    }

    return [...counter.entries()]
      .map(([normalizedName, value]) => ({
        name: value.name,
        normalizedName,
        source: "grain",
        callCount: value.count,
      }))
      .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));
  }

  private async fetchAndDerive(input: ProviderFetchInput): Promise<FetchedGrainCall[]> {
    const rows: FetchedGrainCall[] = [];
    const maxCalls = input.maxCalls ?? 500;
    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("transcript_format", "sentences");
      if (cursor) params.set("cursor", cursor);
      if (input.fromDate) params.set("started_after", toIso(input.fromDate, false));
      if (input.toDate) params.set("started_before", toIso(input.toDate, true));

      const payload = await this.requestList(params);

      for (const call of payload.recordings) {
        const transcript = await this.getTranscript(call);
        if (!transcript.transcriptText.trim()) {
          continue;
        }

        rows.push({
          call,
          transcriptText: transcript.transcriptText,
          segments: transcript.segments,
          derivedAccountName: resolveRecordingAccountName(call, this.internalDomains),
        });

        if (rows.length >= maxCalls) {
          done = true;
          break;
        }
      }

      if (!payload.cursor || payload.has_more === false || done) {
        break;
      }
      cursor = payload.cursor;
    }

    return rows;
  }

  private async requestList(params: URLSearchParams): Promise<z.infer<typeof GrainListResponseSchema>> {
    const primary = `${this.config.baseUrl.replace(/\/$/, "")}/recordings?${params.toString()}`;
    let response = await fetch(primary, {
      method: "GET",
      headers: this.headers(),
    });

    if (response.status === 404) {
      const fallback = `${this.config.baseUrl.replace(/\/$/, "")}/v1/recordings?${params.toString()}`;
      response = await fetch(fallback, {
        method: "GET",
        headers: this.headers(),
      });
    }

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Grain list fetch failed (${response.status}): ${bodyText}`);
    }

    return GrainListResponseSchema.parse(await response.json());
  }

  private async getTranscript(
    call: z.infer<typeof GrainRecordingSchema>
  ): Promise<{ transcriptText: string; segments: CanonicalCall["segments"] }> {
    const inline = parseGrainTranscript(call.transcript);
    if (inline.transcriptText.trim()) {
      return inline;
    }

    const detail = await this.requestDetail(call.id);
    return parseGrainTranscript(detail.recording.transcript);
  }

  private async requestDetail(id: string): Promise<z.infer<typeof GrainDetailResponseSchema>> {
    const params = new URLSearchParams();
    params.set("transcript_format", "sentences");
    const primary = `${this.config.baseUrl.replace(/\/$/, "")}/recordings/${encodeURIComponent(id)}?${params.toString()}`;
    let response = await fetch(primary, {
      method: "GET",
      headers: this.headers(),
    });

    if (response.status === 404) {
      const fallback = `${this.config.baseUrl.replace(/\/$/, "")}/v1/recordings/${encodeURIComponent(id)}?${params.toString()}`;
      response = await fetch(fallback, {
        method: "GET",
        headers: this.headers(),
      });
    }

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Grain detail fetch failed (${response.status}): ${bodyText}`);
    }

    return GrainDetailResponseSchema.parse(await response.json());
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      "Content-Type": "application/json",
    };
  }
}

function parseGrainTranscript(
  transcript: z.infer<typeof GrainTranscriptSchema> | undefined
): { transcriptText: string; segments: CanonicalCall["segments"] } {
  if (!transcript) {
    return { transcriptText: "", segments: [] };
  }

  const chunks = transcript.sentences ?? transcript.segments ?? [];
  if (chunks.length > 0) {
    const segments = chunks
      .map((sentence) => {
        const text = sentence.text?.trim();
        if (!text) return null;
        const speaker = sentence.speaker?.trim() || sentence.speaker_email?.trim() || null;
        return {
          speaker,
          text,
          startMs: normalizeTimestamp(sentence.start_time),
          endMs: normalizeTimestamp(sentence.end_time),
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const transcriptText = segments
      .map((segment) => (segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text))
      .join("\n");

    return { transcriptText, segments };
  }

  const fallbackText = transcript.text?.trim() ?? "";
  return {
    transcriptText: fallbackText,
    segments: fallbackText
      ? fallbackText.split(/\n+/).map((line) => ({
          speaker: null,
          text: line.trim(),
          startMs: null,
          endMs: null,
        }))
      : [],
  };
}

function resolveRecordingAccountName(
  call: z.infer<typeof GrainRecordingSchema>,
  internalDomains: Set<string>
): string {
  const candidates = extractAccountNamesFromRecording(call, internalDomains);
  return candidates[0] ?? "Unknown Account";
}

function extractAccountNamesFromRecording(
  call: z.infer<typeof GrainRecordingSchema>,
  internalDomains: Set<string>
): string[] {
  const values: Array<string | null | undefined> = [];

  values.push(extractObjectName(call.account));
  values.push(extractObjectName(call.company));

  for (const company of call.companies ?? []) {
    values.push(extractObjectName(company));
  }

  for (const participant of call.participants ?? []) {
    values.push(participant.company ?? null);

    if (participant.email) {
      const domain = participant.email.split("@")[1]?.toLowerCase();
      if (domain && !internalDomains.has(domain)) {
        values.push(companyNameFromEmail(participant.email));
      }
    }
  }

  return uniqueAccountCandidates(values);
}

function extractObjectName(
  candidate: string | { name?: string } | undefined
): string | null {
  if (!candidate) return null;
  if (typeof candidate === "string") return candidate;
  return candidate.name ?? null;
}

function normalizeTimestamp(raw?: number): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw) || raw <= 0) {
    return null;
  }

  // Some APIs return seconds, others milliseconds.
  if (raw < 10_000) {
    return Math.floor(raw * 1000);
  }

  return Math.floor(raw);
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

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
