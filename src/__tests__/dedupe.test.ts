import { describe, expect, it } from "vitest";
import type { CanonicalCall } from "../types/domain.js";
import { dedupeCalls } from "../pipeline/dedupe.js";

function mkCall(overrides: Partial<CanonicalCall>): CanonicalCall {
  return {
    provider: "gong",
    providerCallId: "call-1",
    accountId: "acct-1",
    accountName: "Acme",
    title: "QBR",
    occurredAt: "2026-02-01T12:00:00Z",
    durationSeconds: 1800,
    participants: [],
    transcriptText: "We reduced cycle time by 40% and saved $200k annually.",
    segments: [
      {
        speaker: "A",
        text: "We reduced cycle time by 40% and saved $200k annually.",
        startMs: 1000,
        endMs: 5000,
      },
    ],
    metadata: {},
    ...overrides,
  };
}

describe("dedupe", () => {
  it("removes exact duplicates by transcript hash", () => {
    const a = mkCall({ provider: "gong", providerCallId: "g-1" });
    const b = mkCall({ provider: "grain", providerCallId: "gr-1" });

    const result = dedupeCalls([a, b]);

    expect(result.calls).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it("removes duplicates with matching recording url", () => {
    const a = mkCall({
      provider: "gong",
      providerCallId: "g-2",
      metadata: { recordingUrl: "https://video.example/call/abc" },
    });
    const b = mkCall({
      provider: "grain",
      providerCallId: "gr-2",
      transcriptText: "Different transcript text",
      metadata: { recordingUrl: "https://video.example/call/abc/" },
    });

    const result = dedupeCalls([a, b]);

    expect(result.calls).toHaveLength(1);
    expect(result.duplicates[0]?.reason).toBe("same_recording_url");
  });
});
