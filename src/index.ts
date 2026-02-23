#!/usr/bin/env node

import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runCaseStudyAgent } from "./agent/runCaseStudyAgent.js";
import type { DiscoveredAccount } from "./types/domain.js";

const program = new Command();

program
  .name("callcase-agent")
  .description("Consolidate call transcripts and generate case-study packs")
  .option("--provider <provider>", "Provider override: merge|json|gong|grain|gong_grain")
  .option("--account-id <id>", "Account ID")
  .option("--account-name <name>", "Account name (if omitted, account menu is shown when supported)")
  .option("--from-date <YYYY-MM-DD>", "Lower bound date")
  .option("--to-date <YYYY-MM-DD>", "Upper bound date")
  .option("--max-calls <n>", "Maximum calls to fetch", (value) => Number(value))
  .option("--output-dir <dir>", "Output directory")
  .action(async (opts) => {
    const result = await runCaseStudyAgent({
      provider: opts.provider,
      accountId: opts.accountId,
      accountName: opts.accountName,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      maxCalls: opts.maxCalls,
      outputDir: opts.outputDir,
      selectAccount: async (accounts) => promptAccountSelection(accounts),
    });

    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

async function promptAccountSelection(accounts: DiscoveredAccount[]): Promise<DiscoveredAccount> {
  if (accounts.length === 0) {
    throw new Error("No accounts discovered to select from.");
  }

  console.log("\nSelect an account/company to process:\n");
  accounts.forEach((account, index) => {
    console.log(
      `${index + 1}. ${account.name}  [${account.source}]  (${account.callCount} calls)`
    );
  });

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const answer = await rl.question("\nEnter number: ");
      const choice = Number(answer.trim());

      if (Number.isInteger(choice) && choice >= 1 && choice <= accounts.length) {
        return accounts[choice - 1];
      }

      console.log(`Please enter a number between 1 and ${accounts.length}.`);
    }
  } finally {
    rl.close();
  }
}
