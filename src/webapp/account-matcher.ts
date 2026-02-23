import OpenAI from "openai";
import { z } from "zod";
import { normalizeAccountName } from "../providers/account-utils.js";
import type { DiscoveredAccount } from "../types/domain.js";

export interface SharedAccountOption {
  id: string;
  displayName: string;
  gongName: string;
  grainName: string;
  gongCallCount: number;
  grainCallCount: number;
  confidence: number;
  matchReason: "exact" | "heuristic" | "llm";
}

interface MatcherInput {
  gongAccounts: DiscoveredAccount[];
  grainAccounts: DiscoveredAccount[];
  openaiApiKey?: string;
  openaiModel?: string;
}

const LlmResponseSchema = z.object({
  matches: z
    .array(
      z.object({
        gongNormalizedName: z.string(),
        grainNormalizedName: z.string(),
        canonicalName: z.string().optional(),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
});

export async function matchSharedAccounts(input: MatcherInput): Promise<SharedAccountOption[]> {
  const gongByNormalized = new Map<string, DiscoveredAccount>();
  const grainByNormalized = new Map<string, DiscoveredAccount>();

  for (const account of input.gongAccounts) {
    gongByNormalized.set(account.normalizedName || normalizeAccountName(account.name), account);
  }
  for (const account of input.grainAccounts) {
    grainByNormalized.set(account.normalizedName || normalizeAccountName(account.name), account);
  }

  const usedGong = new Set<string>();
  const usedGrain = new Set<string>();
  const matches: SharedAccountOption[] = [];

  // 1) Exact normalized matches
  for (const [normalized, gong] of gongByNormalized.entries()) {
    const grain = grainByNormalized.get(normalized);
    if (!grain) continue;

    usedGong.add(normalized);
    usedGrain.add(normalized);
    matches.push(createMatch(gong, grain, "exact", 1));
  }

  // 2) Heuristic matches
  const gongRemaining = [...gongByNormalized.entries()].filter(([name]) => !usedGong.has(name));
  const grainRemaining = [...grainByNormalized.entries()].filter(([name]) => !usedGrain.has(name));

  for (const [gongNormalized, gong] of gongRemaining) {
    let best: { normalized: string; score: number; account: DiscoveredAccount } | null = null;

    for (const [grainNormalized, grain] of grainRemaining) {
      if (usedGrain.has(grainNormalized)) continue;

      const score = nameSimilarity(gongNormalized, grainNormalized);
      if (score < 0.82) continue;

      if (!best || score > best.score) {
        best = { normalized: grainNormalized, score, account: grain };
      }
    }

    if (best) {
      usedGong.add(gongNormalized);
      usedGrain.add(best.normalized);
      matches.push(createMatch(gong, best.account, "heuristic", best.score));
    }
  }

  // 3) LLM matching for unresolved accounts
  const unresolvedGong = [...gongByNormalized.entries()]
    .filter(([normalized]) => !usedGong.has(normalized))
    .map(([normalized, account]) => ({ normalized, account }));

  const unresolvedGrain = [...grainByNormalized.entries()]
    .filter(([normalized]) => !usedGrain.has(normalized))
    .map(([normalized, account]) => ({ normalized, account }));

  if (
    unresolvedGong.length > 0 &&
    unresolvedGrain.length > 0 &&
    input.openaiApiKey &&
    input.openaiApiKey.trim().length > 0
  ) {
    const llmMatches = await llmMatchUnresolved({
      unresolvedGong,
      unresolvedGrain,
      openaiApiKey: input.openaiApiKey,
      openaiModel: input.openaiModel ?? "gpt-4o-mini",
    });

    for (const llmMatch of llmMatches) {
      const gong = gongByNormalized.get(llmMatch.gongNormalizedName);
      const grain = grainByNormalized.get(llmMatch.grainNormalizedName);

      if (!gong || !grain) continue;
      if (usedGong.has(llmMatch.gongNormalizedName)) continue;
      if (usedGrain.has(llmMatch.grainNormalizedName)) continue;
      if (llmMatch.confidence < 0.75) continue;

      usedGong.add(llmMatch.gongNormalizedName);
      usedGrain.add(llmMatch.grainNormalizedName);
      matches.push(createMatch(gong, grain, "llm", llmMatch.confidence, llmMatch.canonicalName));
    }
  }

  return matches
    .sort((a, b) => {
      const totalA = a.gongCallCount + a.grainCallCount;
      const totalB = b.gongCallCount + b.grainCallCount;
      if (totalB !== totalA) return totalB - totalA;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((match, index) => ({ ...match, id: `shared-${index + 1}` }));
}

function createMatch(
  gong: DiscoveredAccount,
  grain: DiscoveredAccount,
  reason: "exact" | "heuristic" | "llm",
  confidence: number,
  canonicalName?: string
): SharedAccountOption {
  const displayName = (canonicalName?.trim() || pickBetterName(gong.name, grain.name)).trim();

  return {
    id: "",
    displayName,
    gongName: gong.name,
    grainName: grain.name,
    gongCallCount: gong.callCount,
    grainCallCount: grain.callCount,
    confidence,
    matchReason: reason,
  };
}

function pickBetterName(a: string, b: string): string {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (aTrim.length === bTrim.length) {
    return aTrim.localeCompare(bTrim) <= 0 ? aTrim : bTrim;
  }
  return aTrim.length > bTrim.length ? aTrim : bTrim;
}

function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const tokensA = new Set(a.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(b.split(" ").filter((t) => t.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(tokensA.size, tokensB.size);

  if (a.includes(b) || b.includes(a)) {
    return Math.max(ratio, 0.88);
  }

  return ratio;
}

async function llmMatchUnresolved(input: {
  unresolvedGong: Array<{ normalized: string; account: DiscoveredAccount }>;
  unresolvedGrain: Array<{ normalized: string; account: DiscoveredAccount }>;
  openaiApiKey: string;
  openaiModel: string;
}): Promise<Array<z.infer<typeof LlmResponseSchema>["matches"][number]>> {
  const openai = new OpenAI({ apiKey: input.openaiApiKey });

  const gong = input.unresolvedGong.slice(0, 120).map((item) => ({
    normalizedName: item.normalized,
    rawName: item.account.name,
    callCount: item.account.callCount,
  }));

  const grain = input.unresolvedGrain.slice(0, 120).map((item) => ({
    normalizedName: item.normalized,
    rawName: item.account.name,
    callCount: item.account.callCount,
  }));

  const response = await openai.chat.completions.create({
    model: input.openaiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You match company/account names between two systems. Return only highly likely matches. Never invent names.",
      },
      {
        role: "user",
        content: `Match accounts between GONG and GRAIN.\n\nRules:\n- Only include records that clearly refer to the same company.\n- Ignore weak matches.\n- Confidence must be 0..1 and >=0.75 for strong matches.\n- Return JSON format: {\"matches\":[{\"gongNormalizedName\":\"...\",\"grainNormalizedName\":\"...\",\"canonicalName\":\"...\",\"confidence\":0.0}]}\n\nGONG:\n${JSON.stringify(
          gong,
          null,
          2
        )}\n\nGRAIN:\n${JSON.stringify(grain, null, 2)}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return [];
  }

  try {
    const parsed = LlmResponseSchema.parse(JSON.parse(content));
    return parsed.matches;
  } catch {
    return [];
  }
}
