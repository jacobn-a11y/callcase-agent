import { createHash } from "node:crypto";
import type { CanonicalCall, DuplicateResolution } from "../types/domain.js";

interface DuplicateMatch {
  reason: string;
  score: number;
}

export interface DedupeResult {
  calls: CanonicalCall[];
  duplicates: DuplicateResolution[];
}

export function dedupeCalls(calls: CanonicalCall[]): DedupeResult {
  const sorted = [...calls].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const kept: CanonicalCall[] = [];
  const duplicates: DuplicateResolution[] = [];

  for (const call of sorted) {
    let bestMatchIndex = -1;
    let bestMatch: DuplicateMatch | null = null;

    for (let index = 0; index < kept.length; index += 1) {
      const candidate = kept[index];
      const match = evaluateDuplicate(candidate, call);
      if (!match) continue;

      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
        bestMatchIndex = index;
      }
    }

    if (bestMatchIndex === -1 || !bestMatch) {
      kept.push(call);
      continue;
    }

    const existing = kept[bestMatchIndex];
    const preferred = choosePreferred(existing, call);
    const dropped = preferred === existing ? call : existing;

    if (preferred !== existing) {
      kept[bestMatchIndex] = mergeMetadata(preferred, existing);
    } else {
      kept[bestMatchIndex] = mergeMetadata(existing, call);
    }

    duplicates.push({
      keptCallId: preferred.providerCallId,
      keptProvider: preferred.provider,
      droppedCallId: dropped.providerCallId,
      droppedProvider: dropped.provider,
      reason: bestMatch.reason,
    });
  }

  return { calls: kept, duplicates };
}

function evaluateDuplicate(a: CanonicalCall, b: CanonicalCall): DuplicateMatch | null {
  if (a.provider === b.provider && a.providerCallId === b.providerCallId) {
    return { reason: "same_provider_call_id", score: 1 };
  }

  const urlA = asString(a.metadata?.recordingUrl);
  const urlB = asString(b.metadata?.recordingUrl);
  if (urlA && urlB && normalizeUrl(urlA) === normalizeUrl(urlB)) {
    return { reason: "same_recording_url", score: 0.99 };
  }

  const hashA = transcriptHash(a.transcriptText);
  const hashB = transcriptHash(b.transcriptText);
  if (hashA === hashB && hashA.length > 0) {
    return { reason: "same_transcript_hash", score: 0.97 };
  }

  const timeDeltaMinutes = Math.abs(new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()) / 60000;
  const durationDelta = Math.abs((a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));

  if (timeDeltaMinutes <= 7 && durationDelta <= 180) {
    const titleSimilarity = overlapSimilarity(a.title, b.title);
    if (titleSimilarity >= 0.72) {
      return { reason: "matching_time_and_title", score: 0.94 };
    }
  }

  if (timeDeltaMinutes <= 45 && durationDelta <= 420) {
    const transcriptSimilarity = overlapSimilarity(a.transcriptText, b.transcriptText);
    if (transcriptSimilarity >= 0.86) {
      return { reason: "high_transcript_similarity", score: 0.9 };
    }
  }

  return null;
}

function choosePreferred(a: CanonicalCall, b: CanonicalCall): CanonicalCall {
  const scoreA = qualityScore(a);
  const scoreB = qualityScore(b);

  if (scoreB > scoreA) return b;
  if (scoreA > scoreB) return a;

  // Stable tiebreaker: keep earliest provider name then call id.
  const aKey = `${a.provider}:${a.providerCallId}`;
  const bKey = `${b.provider}:${b.providerCallId}`;
  return aKey <= bKey ? a : b;
}

function qualityScore(call: CanonicalCall): number {
  const segmentCount = call.segments.length;
  const speakerCount = call.segments.filter((segment) => !!segment.speaker).length;
  const tsCount = call.segments.filter((segment) => segment.startMs != null).length;
  const transcriptLen = call.transcriptText.length;

  return segmentCount * 0.6 + speakerCount * 1.2 + tsCount * 1.2 + Math.min(50, transcriptLen / 400);
}

function mergeMetadata(kept: CanonicalCall, dropped: CanonicalCall): CanonicalCall {
  const keptMeta = { ...(kept.metadata ?? {}) };
  const existing = Array.isArray(keptMeta.dedupSources)
    ? (keptMeta.dedupSources as Array<Record<string, unknown>>)
    : [];

  const dedupSources = [
    ...existing,
    {
      provider: dropped.provider,
      providerCallId: dropped.providerCallId,
      title: dropped.title,
      occurredAt: dropped.occurredAt,
      durationSeconds: dropped.durationSeconds,
    },
  ];

  return {
    ...kept,
    metadata: {
      ...keptMeta,
      dedupSources,
    },
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeUrl(value: string): string {
  return value.toLowerCase().replace(/\/?$/, "");
}

function transcriptHash(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  return createHash("sha1").update(normalized).digest("hex");
}

function overlapSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  return overlap / Math.max(tokensA.size, tokensB.size);
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
