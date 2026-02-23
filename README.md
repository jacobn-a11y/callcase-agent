# CallCase Agent

Local-first app to consolidate Gong + Grain call transcripts, dedupe overlap, extract attributed evidence, and generate case-study markdown variants.

## What You Get

- Shared account discovery across **both Gong and Grain** (exact + fuzzy + optional LLM reconciliation)
- Story generation for your full funnel taxonomy
- Direct attribution in extracted evidence:
  - speaker
  - source call id/title/date
  - source timestamp (ms)
- Markdown outputs:
  - `~/Downloads/<Account Name>.md`
  - `~/Downloads/<Account Name> - <Story Type>.md`

## Run The Web App

```bash
npm install
npm run web
```

Open:

- `http://localhost:3080`

API routes:

- `GET /api/story-types`
- `POST /api/accounts/discover`
- `POST /api/stories/build`
- `GET /openapi.json`
- `GET /.well-known/ai-plugin.json`

## ChatGPT Integration (Custom GPT Actions)

Use this when you want a ChatGPT app/skill experience.

1. Start the server: `npm run web`
2. Expose it publicly over HTTPS (example):
   - `cloudflared tunnel --url http://localhost:3080`
3. In ChatGPT, create/edit your Custom GPT and add an **Action**.
4. Use schema URL:
   - `https://<your-public-domain>/openapi.json`
5. Save and test actions:
   - `listStoryTypes`
   - `discoverSharedAccounts`
   - `buildCaseStudyStory`

Notes:

- Credentials are request parameters. You can pass Gong/Grain/OpenAI keys per call.
- This repo also exposes `/.well-known/ai-plugin.json` for plugin-compatible tooling.

## Claude Local Plugin ZIP (Upload Flow)

Prebuilt plugin zip in this repo:

- `plugins/callcase-agent-local-plugin.zip`

Direct GitHub download link:

- `https://github.com/jacobn-a11y/callcase-agent/raw/main/plugins/callcase-agent-local-plugin.zip`

How to use it in Claude:

1. Open Claude plugin upload.
2. Click **Browse files**.
3. Select `callcase-agent-local-plugin.zip`.
4. Upload and enable the plugin.
5. Ensure your keys exist in `.env` (or pass them in tool args).

## Claude Integration (MCP Server)

Use this when you want a Claude plugin/connector workflow.

1. Start MCP server command:
   - `npm run mcp`
2. Add this to Claude Desktop config:
   - macOS path:
     - `~/Library/Application Support/Claude/claude_desktop_config.json`

Example config:

```json
{
  "mcpServers": {
    "callcase-agent": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/Users/jacobnikolau/Documents/Codex/callcase-agent"
    }
  }
}
```

MCP tools exposed:

- `list_story_types`
- `discover_shared_accounts`
- `build_story_for_account`

`build_story_for_account` accepts either:

- `selectedAccount` object from discovery output, or
- `accountDisplayName` (it resolves to the best shared account match)

## Optional Environment Defaults

You can keep using UI-entered credentials, but MCP can also pull defaults from `.env`:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GONG_BASE_URL`
- `GONG_ACCESS_TOKEN`
- `GONG_ACCESS_KEY`
- `GONG_ACCESS_KEY_SECRET`
- `GRAIN_BASE_URL`
- `GRAIN_API_TOKEN`
- `INTERNAL_EMAIL_DOMAINS`
- `PORT`

## Build & Test

```bash
npm run build
npm test
```

## Output Paths

Primary:

- `~/Downloads/<Account Name>.md`
- `~/Downloads/<Account Name> - <Story Type>.md`

Diagnostics:

- `output-web/<account>/calls/*.md`
- `output-web/<account>/merged/all-calls.md`
- `output-web/<account>/dedupe/duplicates.json`
