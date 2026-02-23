import { describe, expect, it } from "vitest";
import type { CanonicalCall } from "../types/domain.js";
import { renderCallMarkdown, renderMergedMarkdown } from "../pipeline/markdown.js";

const sampleCall: CanonicalCall = {
  provider: "gong",
  providerCallId: "gong-100",
  accountId: "acct-1",
  accountName: "Acme Corp",
  title: "QBR",
  occurredAt: "2026-02-01T12:00:00Z",
  durationSeconds: 1800,
  participants: [{ name: "Sam", email: "sam@acme.com", role: "host" }],
  transcriptText: "We saved $200k and reduced onboarding time by 40%.",
  segments: [
    {
      speaker: "Sam",
      text: "We saved $200k and reduced onboarding time by 40%.",
      startMs: 1000,
      endMs: 5000,
    },
  ],
};

describe("markdown rendering", () => {
  it("renders a call markdown file", () => {
    const md = renderCallMarkdown(sampleCall);
    expect(md).toContain("# QBR");
    expect(md).toContain("Provider Call ID: gong-100");
    expect(md).toContain("We saved $200k");
  });

  it("renders merged markdown corpus", () => {
    const md = renderMergedMarkdown("Acme Corp", "acct-1", [sampleCall]);
    expect(md).toContain("Consolidated Transcript Corpus");
    expect(md).toContain("Calls Included: 1");
    expect(md).toContain("QBR");
  });
});
