# CallCase Agent

`CallCase Agent` is a standalone repo that pulls call transcripts, exports a Markdown corpus, extracts evidence, and generates case-study variants across TOFU/MOFU/BOFU/Post-Sale/Internal/Vertical/Format use cases.

## What It Does

1. Ingests transcripts from a provider (`merge` or `json` input).
2. Writes one Markdown file per call.
3. Writes one merged Markdown corpus per account.
4. Extracts:
   - Verbatim customer quotes
   - Quantitative claims (facts, figures, metrics)
   - Direct attribution (`speaker`, `sourceCallId`, `sourceCallTitle`, `sourceCallDate`, `sourceTimestampMs`)
5. Generates a full set of case-study variants for the use-case taxonomy.

## Why Expanded Prompting Is Included

This repo uses strict extraction prompts and validation because generic summarization prompts are not enough for reliable quote/metric extraction. The extraction stage enforces:

- Verbatim-only quote extraction
- Structured quantitative claims
- Evidence quote requirement for each claim
- Confidence scoring
- Post-LLM validation to reject unsupported items
- Attribution backfill from transcript segments when the model omits speaker/timestamp

## Project Structure

- `/src/providers` provider adapters
- `/src/pipeline/markdown.ts` per-call + merged markdown
- `/src/pipeline/quotes.ts` quote + quantitative claim extraction
- `/src/pipeline/caseStudies.ts` per-use-case generation
- `/src/prompts/useCases.ts` complete use-case catalog
- `/src/agent/runCaseStudyAgent.ts` orchestrator

## Setup

```bash
npm install
cp .env.example .env
```

## Environment

Required:

- `OPENAI_API_KEY`

Provider configuration:

- `PROVIDER=merge` and set `MERGE_API_KEY`, `MERGE_ACCOUNT_TOKEN`
- or `PROVIDER=json` and set `JSON_INPUT_FILE`

## Run

### JSON mode (local sample)

```bash
PROVIDER=json JSON_INPUT_FILE=./sample-data/calls.json OPENAI_API_KEY=<key> npm run dev -- --account-id acct-123 --account-name "Northstar Logistics"
```

### Merge mode

```bash
PROVIDER=merge MERGE_API_KEY=<merge_key> MERGE_ACCOUNT_TOKEN=<account_token> OPENAI_API_KEY=<key> npm run dev -- --account-id acct-123 --account-name "Northstar Logistics"
```

## Output

By default, output is written under `output/<account-slug>/`:

- `calls/*.md` per-call transcript markdown
- `merged/all-calls.md` consolidated markdown corpus
- `quotes/quotes.json` verbatim quotes with direct attribution
- `claims/claims.json` quantitative claims with direct attribution
- `case-studies/*.md` one file per use case
- `manifest.json` run summary

## Tests

```bash
npm test
```
