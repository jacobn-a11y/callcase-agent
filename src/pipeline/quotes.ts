import OpenAI from "openai";
import type { CanonicalCall, QuantClaim, QuoteEvidence } from "../types/domain.js";

const EXTRACTION_PROMPT = `You are an evidence extraction engine.
Return strict JSON with shape:
{
  "quotes": [
    {
      "quote": "exact verbatim text",
      "speaker": "speaker name or null",
      "metricValue": "number/percent/currency string or null",
      "metricType": "roi|revenue|cost_savings|time_saved|efficiency|error_reduction|adoption|risk|other|null",
      "reason": "why this quote matters",
      "sourceCallId": "call id",
      "sourceTimestampMs": number|null,
      "confidence": number
    }
  ],
  "claims": [
    {
      "claim": "quantitative claim statement",
      "claimType": "cost_savings|revenue|time_saved|efficiency|error_reduction|adoption|risk|roi|other",
      "value": "numeric value phrase",
      "unit": "unit string or null",
      "sourceCallId": "call id",
      "sourceTimestampMs": number|null,
      "evidenceQuote": "verbatim supporting quote",
      "confidence": number
    }
  ]
}
Rules:
- Extract only verbatim quotes that appear in transcript.
- Prioritize numbers, percentages, dollar values, time reductions, error rates, adoption rates.
- If uncertain, exclude the item.
- confidence must be 0..1.
- Max 10 quotes, max 12 claims.`;

const NUMERIC_PATTERN = /\b(?:\$\s?\d[\d,.]*|\d[\d,.]*\s?%|\d[\d,.]*\s?(?:x|hours?|days?|weeks?|months?|years?|mins?|minutes?|seconds?|users?|seats?|tickets?|incidents?|calls?|meetings?|dollars?))\b/i;

interface RawQuote {
  quote: string;
  speaker: string | null;
  metricValue: string | null;
  metricType: string | null;
  reason: string;
  sourceCallId: string;
  sourceTimestampMs: number | null;
  confidence: number;
}

interface RawClaim {
  claim: string;
  claimType: QuantClaim["claimType"];
  value: string;
  unit: string | null;
  sourceCallId: string;
  sourceTimestampMs: number | null;
  evidenceQuote: string;
  confidence: number;
}

export class QuoteExtractor {
  constructor(private readonly openai: OpenAI, private readonly model: string) {}

  async extractFromCalls(calls: CanonicalCall[]): Promise<{ quotes: QuoteEvidence[]; claims: QuantClaim[] }> {
    const quotes: QuoteEvidence[] = [];
    const claims: QuantClaim[] = [];

    for (const call of calls) {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          {
            role: "user",
            content: `Call ID: ${call.providerCallId}\nTitle: ${call.title}\nDate: ${call.occurredAt}\n\nTranscript:\n${call.transcriptText}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "{\"quotes\":[],\"claims\":[]}";
      const parsed = safeParseExtraction(content, call.providerCallId);

      const validatedQuotes = parsed.quotes
        .filter((q) => quoteAppearsInTranscript(q.quote, call.transcriptText))
        .map((q) => withQuoteAttribution(q, call));

      const validatedClaims = parsed.claims
        .filter((c) => {
          const hasNumber =
            NUMERIC_PATTERN.test(c.claim) ||
            NUMERIC_PATTERN.test(c.value) ||
            NUMERIC_PATTERN.test(c.evidenceQuote);
          const evidencePresent = quoteAppearsInTranscript(c.evidenceQuote, call.transcriptText);
          return hasNumber && evidencePresent;
        })
        .map((c) => withClaimAttribution(c, call));

      quotes.push(...validatedQuotes);
      claims.push(...validatedClaims);
    }

    return {
      quotes: dedupeQuotes(quotes),
      claims: dedupeClaims(claims),
    };
  }
}

function withQuoteAttribution(raw: RawQuote, call: CanonicalCall): QuoteEvidence {
  const segmentMatch = findSegmentForText(call, raw.quote);
  return {
    quote: raw.quote,
    speaker: raw.speaker ?? segmentMatch?.speaker ?? null,
    metricValue: raw.metricValue,
    metricType: raw.metricType,
    reason: raw.reason,
    sourceCallId: raw.sourceCallId || call.providerCallId,
    sourceCallTitle: call.title,
    sourceCallDate: call.occurredAt,
    sourceTimestampMs: raw.sourceTimestampMs ?? segmentMatch?.startMs ?? null,
    confidence: raw.confidence,
  };
}

function withClaimAttribution(raw: RawClaim, call: CanonicalCall): QuantClaim {
  const segmentMatch = findSegmentForText(call, raw.evidenceQuote);
  return {
    claim: raw.claim,
    claimType: raw.claimType,
    value: raw.value,
    unit: raw.unit,
    sourceCallId: raw.sourceCallId || call.providerCallId,
    sourceCallTitle: call.title,
    sourceCallDate: call.occurredAt,
    sourceTimestampMs: raw.sourceTimestampMs ?? segmentMatch?.startMs ?? null,
    evidenceQuote: raw.evidenceQuote,
    confidence: raw.confidence,
  };
}

function findSegmentForText(call: CanonicalCall, text: string) {
  const needle = normalize(text);
  if (needle.length < 12) return null;
  return (
    call.segments.find((seg) => normalize(seg.text).includes(needle) || needle.includes(normalize(seg.text))) ?? null
  );
}

function quoteAppearsInTranscript(quote: string, transcript: string): boolean {
  const normalizedQuote = normalize(quote);
  const normalizedTranscript = normalize(transcript);
  return normalizedQuote.length >= 16 && normalizedTranscript.includes(normalizedQuote);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function safeParseExtraction(content: string, fallbackCallId: string): { quotes: RawQuote[]; claims: RawClaim[] } {
  try {
    const parsed = JSON.parse(content) as {
      quotes?: Array<Partial<RawQuote>>;
      claims?: Array<Partial<RawClaim>>;
    };

    const quotes: RawQuote[] = (parsed.quotes ?? [])
      .filter((q) => typeof q.quote === "string" && q.quote.trim().length > 0)
      .map((q) => ({
        quote: q.quote!.trim(),
        speaker: q.speaker ?? null,
        metricValue: q.metricValue ?? null,
        metricType: q.metricType ?? null,
        reason: typeof q.reason === "string" ? q.reason.trim() : "Evidence quote",
        sourceCallId: q.sourceCallId || fallbackCallId,
        sourceTimestampMs: q.sourceTimestampMs ?? null,
        confidence: boundConfidence(q.confidence),
      }));

    const claims: RawClaim[] = (parsed.claims ?? [])
      .filter((c) => typeof c.claim === "string" && c.claim.trim().length > 0)
      .filter((c) => typeof c.value === "string" && c.value.trim().length > 0)
      .map((c) => ({
        claim: c.claim!.trim(),
        claimType: (c.claimType as QuantClaim["claimType"]) ?? "other",
        value: c.value!.trim(),
        unit: c.unit ?? null,
        sourceCallId: c.sourceCallId || fallbackCallId,
        sourceTimestampMs: c.sourceTimestampMs ?? null,
        evidenceQuote: typeof c.evidenceQuote === "string" ? c.evidenceQuote.trim() : "",
        confidence: boundConfidence(c.confidence),
      }))
      .filter((c) => c.evidenceQuote.length > 0);

    return { quotes, claims };
  } catch {
    return { quotes: [], claims: [] };
  }
}

function boundConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

function dedupeQuotes(quotes: QuoteEvidence[]): QuoteEvidence[] {
  const seen = new Set<string>();
  const result: QuoteEvidence[] = [];
  for (const q of quotes) {
    const key = `${q.sourceCallId}::${q.quote.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(q);
  }
  return result;
}

function dedupeClaims(claims: QuantClaim[]): QuantClaim[] {
  const seen = new Set<string>();
  const result: QuantClaim[] = [];
  for (const c of claims) {
    const key = `${c.sourceCallId}::${c.claim.toLowerCase()}::${c.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
}
