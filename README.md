# CallCase Agent Webapp

Simple local webapp to:

1. Enter Gong + Grain + OpenAI keys
2. Discover deduped shared accounts/companies across Gong and Grain
3. Choose account + story type
4. Build the story
5. Write merged call markdown to your Downloads folder as:
   - `~/Downloads/<Account Name>.md`

It also writes the generated story markdown to Downloads as:

- `~/Downloads/<Account Name> - <Story Type>.md`

## Quick Start

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3080`

## UI Flow

1. Paste credentials in the web form.
2. Click **Discover Shared Accounts**.
3. Pick one account from the shared Gong+Grain menu.
4. Pick a story type.
5. Click **Build Story**.

## What Happens Under the Hood

- Pulls calls/transcripts from Gong and Grain.
- Matches account/company names across both providers using:
  - exact normalization
  - heuristic fuzzy matching
  - optional OpenAI-assisted reconciliation for unresolved names
- Merges and de-duplicates duplicate calls across providers.
- Extracts verbatim quotes + quantitative claims with attribution:
  - `speaker`
  - `sourceCallId`
  - `sourceCallTitle`
  - `sourceCallDate`
  - `sourceTimestampMs`
- Generates a case-study markdown for the selected story type.

## Output Files

Primary outputs in Downloads:

- `~/Downloads/<Account Name>.md`
- `~/Downloads/<Account Name> - <Story Type>.md`

Additional diagnostic outputs in repo workspace:

- `output-web/<account>/calls/*.md`
- `output-web/<account>/merged/all-calls.md`
- `output-web/<account>/dedupe/duplicates.json`

## Environment (Optional Defaults)

You can still set defaults in `.env`:

- `PORT` (default `3080`)

Credentials are entered directly in the UI and are not persisted by the app.

## CLI (Optional)

Legacy CLI remains available:

```bash
npm run cli -- --provider gong_grain --account-name "Acme"
```
