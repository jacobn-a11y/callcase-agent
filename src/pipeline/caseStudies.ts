import OpenAI from "openai";
import type {
  CaseStudyArtifact,
  CanonicalCall,
  QuantClaim,
  QuoteEvidence,
} from "../types/domain.js";
import type { UseCaseDefinition } from "../prompts/useCases.js";

const CASE_STUDY_SYSTEM_PROMPT = `You write evidence-backed B2B case studies from transcripts.
Rules:
- Use only evidence present in supplied transcript corpus, extracted quotes, and quantitative claims.
- Include verbatim quotes as blockquotes with attribution.
- Include a numeric evidence table in every output.
- Mark every unsupported inference as \"Inference\".
- If evidence is weak, explicitly list data gaps.
- Output Markdown only.`;

export class CaseStudyGenerator {
  constructor(private readonly openai: OpenAI, private readonly model: string) {}

  async generateAll(
    useCases: UseCaseDefinition[],
    calls: CanonicalCall[],
    mergedMarkdown: string,
    quotes: QuoteEvidence[],
    claims: QuantClaim[]
  ): Promise<CaseStudyArtifact[]> {
    const artifacts: CaseStudyArtifact[] = [];

    const quoteContext = quotes
      .map(
        (q) =>
          `- [${q.sourceCallId}] date=${q.sourceCallDate} title=${q.sourceCallTitle} speaker=${q.speaker ?? "unknown"} t=${formatTimestamp(q.sourceTimestampMs)} confidence=${q.confidence.toFixed(2)} :: \"${q.quote}\"`
      )
      .join("\n");

    const claimContext = claims
      .map(
        (c) =>
          `- [${c.sourceCallId}] date=${c.sourceCallDate} title=${c.sourceCallTitle} t=${formatTimestamp(c.sourceTimestampMs)} type=${c.claimType} value=${c.value}${c.unit ? ` ${c.unit}` : ""} confidence=${c.confidence.toFixed(2)} :: ${c.claim} :: evidence=\"${c.evidenceQuote}\"`
      )
      .join("\n");

    const callSummary = calls
      .map((call) => `- ${call.occurredAt}: ${call.title} (${call.providerCallId})`)
      .join("\n");

    for (const useCase of useCases) {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: CASE_STUDY_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Generate a case study variant for:\n- Use Case ID: ${useCase.id}\n- Use Case Name: ${useCase.name}\n- Funnel/Type: ${useCase.stage}\n- Focus: ${useCase.focus}\n\nRequired structure:\n# ${useCase.name}\n## Executive Summary\n## Context\n## Trigger / Problem\n## Evaluation / Decision Dynamics\n## Implementation / Adoption\n## Outcomes and Metrics\n## Quantitative Evidence Table\n## Notable Quotes (with direct attribution)\n## Risks, Gaps, and What Is Still Unknown\n## Reusable Messaging\n\nCall index:\n${callSummary}\n\nExtracted quotes with attribution:\n${quoteContext || "No extracted quotes"}\n\nExtracted quantitative claims with attribution:\n${claimContext || "No extracted claims"}\n\nMerged transcript corpus:\n${mergedMarkdown}`,
          },
        ],
      });

      artifacts.push({
        useCaseId: useCase.id,
        useCaseName: useCase.name,
        markdown: response.choices[0]?.message?.content ?? `# ${useCase.name}\nNo output generated.`,
      });
    }

    return artifacts;
  }
}

function formatTimestamp(ms: number | null): string {
  if (ms == null) return "unknown";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
