# CallCase Agent

`CallCase Agent` is a standalone repo that pulls call transcripts, exports a Markdown corpus, extracts evidence, and generates case-study variants across TOFU/MOFU/BOFU/Post-Sale/Internal/Vertical/Format use cases.

## What It Does

1. Ingests transcripts from `gong`, `grain`, `gong_grain`, `merge`, or `json`.
2. Discovers account/company names directly from provider data.
3. In `gong_grain` mode, shows only accounts found in both services as a menu to choose from.
4. Writes one Markdown file per call.
5. De-duplicates overlapping calls across Gong and Grain.
6. Writes one merged Markdown corpus per account.
7. Extracts:
   - Verbatim customer quotes
   - Quantitative claims (facts, figures, metrics)
   - Direct attribution (`speaker`, `sourceCallId`, `sourceCallTitle`, `sourceCallDate`, `sourceTimestampMs`)
8. Generates a full set of case-study variants for the use-case taxonomy.

## Why Expanded Prompting Is Included

This repo uses strict extraction prompts and validation because generic summarization prompts are not enough for reliable quote/metric extraction. The extraction stage enforces:

- Verbatim-only quote extraction
- Structured quantitative claims
- Evidence quote requirement for each claim
- Confidence scoring
- Post-LLM validation to reject unsupported items
- Attribution backfill from transcript segments when the model omits speaker/timestamp

## Project Structure

- `/src/providers` provider adapters (`gong`, `grain`, `merge`, `json`, composite)
- `/src/pipeline/dedupe.ts` cross-provider duplicate suppression
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

- `PROVIDER=gong_grain` with Gong + Grain credentials
- `PROVIDER=gong` with Gong credentials
- `PROVIDER=grain` with Grain credentials
- `PROVIDER=merge` with Merge credentials
- `PROVIDER=json` with `JSON_INPUT_FILE`

## Run

### Gong + Grain with account menu (shared accounts only)

```bash
PROVIDER=gong_grain OPENAI_API_KEY=<key> GONG_ACCESS_KEY=<key> GONG_ACCESS_KEY_SECRET=<secret> GRAIN_API_TOKEN=<token> npm run dev
```

### Gong only

```bash
PROVIDER=gong OPENAI_API_KEY=<key> GONG_ACCESS_KEY=<key> GONG_ACCESS_KEY_SECRET=<secret> npm run dev -- --account-name "Northstar Logistics"
```

### Grain only

```bash
PROVIDER=grain OPENAI_API_KEY=<key> GRAIN_API_TOKEN=<token> npm run dev -- --account-name "Northstar Logistics"
```

### JSON mode (local sample)

```bash
PROVIDER=json JSON_INPUT_FILE=./sample-data/calls.json OPENAI_API_KEY=<key> npm run dev -- --account-name "Northstar Logistics"
```

## Output

By default, output is written under `output/<account-slug>/`:

- `calls/*.md` per-call transcript markdown
- `merged/all-calls.md` consolidated markdown corpus
- `quotes/quotes.json` verbatim quotes with direct attribution
- `claims/claims.json` quantitative claims with direct attribution
- `dedupe/duplicates.json` duplicate resolution report (Gong/Grain overlap)
- `case-studies/*.md` one file per use case
- `manifest.json` run summary

## Tests

```bash
npm test
```
