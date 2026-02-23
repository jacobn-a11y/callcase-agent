#!/usr/bin/env node

import { Command } from "commander";
import { runCaseStudyAgent } from "./agent/runCaseStudyAgent.js";

const program = new Command();

program
  .name("callcase-agent")
  .description("Consolidate call transcripts and generate case-study packs")
  .requiredOption("--account-id <id>", "Account ID")
  .requiredOption("--account-name <name>", "Account name")
  .option("--from-date <YYYY-MM-DD>", "Lower bound date")
  .option("--to-date <YYYY-MM-DD>", "Upper bound date")
  .option("--max-calls <n>", "Maximum calls to fetch", (value) => Number(value))
  .option("--output-dir <dir>", "Output directory")
  .action(async (opts) => {
    const result = await runCaseStudyAgent({
      accountId: opts.accountId,
      accountName: opts.accountName,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      maxCalls: opts.maxCalls,
      outputDir: opts.outputDir,
    });

    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
