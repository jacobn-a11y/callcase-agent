export interface CallParticipant {
  name: string | null;
  email: string | null;
  role: "host" | "participant";
}

export interface CallSegment {
  speaker: string | null;
  text: string;
  startMs: number | null;
  endMs: number | null;
}

export interface CanonicalCall {
  provider: string;
  providerCallId: string;
  accountId: string;
  accountName: string;
  title: string;
  occurredAt: string;
  durationSeconds: number | null;
  participants: CallParticipant[];
  transcriptText: string;
  segments: CallSegment[];
  metadata?: Record<string, unknown>;
}

export interface QuoteEvidence {
  quote: string;
  speaker: string | null;
  metricValue: string | null;
  metricType: string | null;
  reason: string;
  sourceCallId: string;
  sourceCallTitle: string;
  sourceCallDate: string;
  sourceTimestampMs: number | null;
  confidence: number;
}

export interface QuantClaim {
  claim: string;
  claimType:
    | "cost_savings"
    | "revenue"
    | "time_saved"
    | "efficiency"
    | "error_reduction"
    | "adoption"
    | "risk"
    | "roi"
    | "other";
  value: string;
  unit: string | null;
  sourceCallId: string;
  sourceCallTitle: string;
  sourceCallDate: string;
  sourceTimestampMs: number | null;
  evidenceQuote: string;
  confidence: number;
}

export interface CaseStudyArtifact {
  useCaseId: string;
  useCaseName: string;
  markdown: string;
}

export interface DuplicateResolution {
  keptCallId: string;
  keptProvider: string;
  droppedCallId: string;
  droppedProvider: string;
  reason: string;
}

export interface AgentRunResult {
  accountId: string;
  accountName: string;
  callsProcessed: number;
  duplicatesRemoved: number;
  callsMarkdownPaths: string[];
  mergedMarkdownPath: string;
  quotesPath: string;
  claimsPath: string;
  dedupeReportPath: string;
  caseStudyPaths: string[];
}

export interface ProviderFetchInput {
  accountId?: string;
  accountName?: string;
  fromDate?: string;
  toDate?: string;
  maxCalls?: number;
}

export interface DiscoveredAccount {
  name: string;
  normalizedName: string;
  source: string;
  callCount: number;
}

export interface CallProvider {
  name: string;
  fetchCalls(input: ProviderFetchInput): Promise<CanonicalCall[]>;
  discoverAccounts?(input: ProviderFetchInput): Promise<DiscoveredAccount[]>;
}
