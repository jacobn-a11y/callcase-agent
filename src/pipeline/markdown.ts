import path from "node:path";
import type { CanonicalCall } from "../types/domain.js";
import { ensureDir, slugify, writeTextFile } from "../utils/fs.js";

function renderParticipants(call: CanonicalCall): string {
  if (call.participants.length === 0) return "None listed";
  return call.participants
    .map((p) => {
      const identity = p.name || p.email || "Unknown";
      const role = p.role === "host" ? "host" : "participant";
      return `- ${identity} (${role})`;
    })
    .join("\n");
}

export function renderCallMarkdown(call: CanonicalCall): string {
  const duration = call.durationSeconds ? `${Math.round(call.durationSeconds / 60)} min` : "Unknown";
  const segments = call.segments.length > 0
    ? call.segments
        .map((seg) => {
          const speaker = seg.speaker ? `**${seg.speaker}:** ` : "";
          return `${speaker}${seg.text}`;
        })
        .join("\n\n")
    : call.transcriptText;

  return `# ${call.title}\n\n- Account: ${call.accountName} (${call.accountId})\n- Provider: ${call.provider}\n- Provider Call ID: ${call.providerCallId}\n- Date: ${call.occurredAt}\n- Duration: ${duration}\n\n## Participants\n${renderParticipants(call)}\n\n## Transcript\n${segments}\n`;
}

export function renderMergedMarkdown(accountName: string, accountId: string, calls: CanonicalCall[]): string {
  const header = `# Consolidated Transcript Corpus\n\n- Account: ${accountName} (${accountId})\n- Calls Included: ${calls.length}\n\n`;

  const body = calls
    .map((call) => {
      const title = `${call.title} (${call.occurredAt})`;
      return `---\n\n## ${title}\n\n${call.transcriptText.trim()}`;
    })
    .join("\n\n");

  return `${header}${body}\n`;
}

export async function writeCallMarkdownFiles(baseOutputDir: string, calls: CanonicalCall[]): Promise<string[]> {
  if (calls.length === 0) return [];
  const accountSlug = slugify(calls[0].accountName || calls[0].accountId);
  const callDir = path.resolve(baseOutputDir, accountSlug, "calls");
  await ensureDir(callDir);

  const written: string[] = [];
  for (const call of calls) {
    const fileName = `${call.occurredAt.slice(0, 10)}-${slugify(call.providerCallId)}.md`;
    const filePath = path.resolve(callDir, fileName);
    await writeTextFile(filePath, renderCallMarkdown(call));
    written.push(filePath);
  }
  return written;
}

export async function writeMergedMarkdownFile(baseOutputDir: string, accountName: string, accountId: string, calls: CanonicalCall[]): Promise<string> {
  const accountSlug = slugify(accountName || accountId);
  const filePath = path.resolve(baseOutputDir, accountSlug, "merged", "all-calls.md");
  await writeTextFile(filePath, renderMergedMarkdown(accountName, accountId, calls));
  return filePath;
}
