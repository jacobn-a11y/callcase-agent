import { createHash } from "node:crypto";

const COMMON_SUFFIXES = /\b(inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|corp|corp\.|corporation|company|co\.|plc|gmbh|s\.a\.|sa|pte|pty)\b/gi;

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMMON_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function accountIdFromName(name: string): string {
  const normalized = normalizeAccountName(name);
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  return `acct_${hash}`;
}

export function companyNameFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) {
    return null;
  }

  const labels = domain.split(".");
  if (labels.length < 2) return null;
  const root = labels[labels.length - 2];
  if (!root || root.length < 2) return null;

  return titleCase(root.replace(/[-_]+/g, " "));
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function uniqueAccountCandidates(values: Array<string | null | undefined>): string[] {
  const dedup = new Map<string, string>();
  for (const raw of values) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length < 2) continue;
    const normalized = normalizeAccountName(trimmed);
    if (normalized.length < 2) continue;
    if (!dedup.has(normalized)) {
      dedup.set(normalized, trimmed);
    }
  }
  return [...dedup.values()];
}

export function parseCommaSeparated(input: string | undefined): string[] {
  return (input ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}
